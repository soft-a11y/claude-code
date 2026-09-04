/*
 * Envoi des écritures vers une base de données Notion.
 *
 * Ce fichier ne dépend ni d'Electron ni du réseau : le client reçoit son
 * `fetch`, ce qui le rend testable sans appeler Notion (voir test/).
 * Il tourne dans le processus principal uniquement — le jeton d'intégration
 * n'est jamais exposé à la page.
 */
"use strict";

const API = "https://api.notion.com/v1";
const VERSION = "2022-06-28";

// Notion accepte au mieux 3 requêtes par seconde ; on reste en dessous.
const THROTTLE_MS = 350;

const TYPE_LABEL = { d: "Dépense", r: "Recette" };

/* ------------------------------------------------------------ identifiants */

// Accepte une URL de page ou de base (« …/Mes-comptes-1f2e3d4c… »), un UUID
// avec tirets, ou l'identifiant brut de 32 caractères.
function parseNotionId(input) {
  const raw = String(input == null ? "" : input).trim();
  if (!raw) return null;

  // Le dernier bloc de 32 caractères hexadécimaux est l'identifiant : dans une
  // URL Notion il suit le titre, et les paramètres (?v=…) en contiennent
  // d'autres qu'il ne faut pas confondre avec lui.
  const withoutQuery = raw.split("?")[0];
  const matches = withoutQuery.replace(/-/g, "").match(/[0-9a-fA-F]{32}/g);
  if (!matches || !matches.length) return null;

  const id = matches[matches.length - 1].toLowerCase();
  return [id.slice(0, 8), id.slice(8, 12), id.slice(12, 16), id.slice(16, 20), id.slice(20)].join("-");
}

/* ------------------------------------------------------------- conversions */

// Notion refuse les virgules dans les noms d'option de liste déroulante.
function selectName(value, fallback) {
  const clean = String(value == null ? "" : value).replace(/,/g, " ").trim().slice(0, 100);
  return clean || fallback;
}

// Le montant part signé : négatif pour une dépense. La somme de la colonne
// dans Notion donne alors directement le solde.
function signedEuros(entry) {
  const cents = Math.round(Number(entry.amount) || 0);
  return (entry.type === "r" ? cents : -cents) / 100;
}

function entryToProperties(entry) {
  return {
    "Libellé": { title: [{ text: { content: String(entry.label || "Sans libellé").slice(0, 2000) } }] },
    Date: { date: { start: entry.date } },
    Montant: { number: signedEuros(entry) },
    Type: { select: { name: TYPE_LABEL[entry.type] || TYPE_LABEL.d } },
    "Catégorie": { select: { name: selectName(entry.category, "Divers") } },
  };
}

function databaseSchema() {
  return {
    "Libellé": { title: {} },
    Date: { date: {} },
    Montant: { number: { format: "euro" } },
    Type: {
      select: {
        options: [
          { name: TYPE_LABEL.d, color: "orange" },
          { name: TYPE_LABEL.r, color: "green" },
        ],
      },
    },
    "Catégorie": { select: {} },
  };
}

/* ----------------------------------------------------------------- erreurs */

// Les messages de Notion sont en anglais et souvent techniques : on les
// traduit en une phrase qui dit quoi faire.
function humanError(status, body) {
  const code = body && body.code;
  if (status === 401 || code === "unauthorized") {
    return "Jeton refusé. Vérifiez le jeton d'intégration copié depuis notion.so/my-integrations.";
  }
  if (status === 403 || code === "restricted_resource") {
    return "Accès refusé. Dans Notion, ouvrez la page puis « Connexions » et ajoutez votre intégration.";
  }
  if (status === 404 || code === "object_not_found") {
    return "Introuvable. Soit l'adresse est erronée, soit la page n'est pas partagée avec votre intégration.";
  }
  if (status === 429) return "Notion demande de ralentir. Réessayez dans un instant.";
  if (code === "validation_error") {
    return "Notion a refusé les données : " + (body.message || "requête invalide") + ".";
  }
  if (status >= 500) return "Notion est momentanément indisponible. Réessayez plus tard.";
  return (body && body.message) || "Échec de la requête (code " + status + ").";
}

class NotionError extends Error {
  constructor(status, body) {
    super(humanError(status, body));
    this.name = "NotionError";
    this.status = status;
    this.code = (body && body.code) || null;
  }
}

/* ------------------------------------------------------------------ client */

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

class NotionClient {
  constructor(token, options = {}) {
    this.token = String(token || "").trim();
    this.fetch = options.fetch || globalThis.fetch;
    this.wait = options.wait || delay;
    this.throttleMs = options.throttleMs == null ? THROTTLE_MS : options.throttleMs;
    this.lastCall = 0;
  }

  async request(method, path, body) {
    // Un 429 est réessayé une fois, en respectant le délai demandé.
    for (let attempt = 0; attempt < 2; attempt++) {
      const since = Date.now() - this.lastCall;
      if (this.lastCall && since < this.throttleMs) await this.wait(this.throttleMs - since);
      this.lastCall = Date.now();

      const response = await this.fetch(API + path, {
        method,
        headers: {
          Authorization: "Bearer " + this.token,
          "Notion-Version": VERSION,
          "Content-Type": "application/json",
        },
        body: body === undefined ? undefined : JSON.stringify(body),
      });

      let payload = null;
      try { payload = await response.json(); } catch (e) { payload = null; }

      if (response.ok) return payload;

      if (response.status === 429 && attempt === 0) {
        const retry = Number((response.headers && response.headers.get && response.headers.get("Retry-After")) || 1);
        await this.wait(Math.min(Math.max(retry, 1), 10) * 1000);
        continue;
      }
      throw new NotionError(response.status, payload);
    }
    throw new NotionError(429, { code: "rate_limited" });
  }

  // Vérifie le jeton et l'accès à la base, et renvoie son titre.
  async checkDatabase(databaseId) {
    const database = await this.request("GET", "/databases/" + databaseId);
    const title = (database.title || []).map((part) => part.plain_text || "").join("").trim();
    return { id: database.id, title: title || "Base sans titre", url: database.url || null };
  }

  async createDatabase(parentPageId, title) {
    const database = await this.request("POST", "/databases", {
      parent: { type: "page_id", page_id: parentPageId },
      title: [{ type: "text", text: { content: String(title || "Livre de comptes").slice(0, 2000) } }],
      properties: databaseSchema(),
    });
    return { id: database.id, url: database.url || null };
  }

  async createEntry(databaseId, entry) {
    const page = await this.request("POST", "/pages", {
      parent: { type: "database_id", database_id: databaseId },
      properties: entryToProperties(entry),
    });
    return page.id;
  }

  async updateEntry(pageId, entry) {
    const page = await this.request("PATCH", "/pages/" + pageId, {
      properties: entryToProperties(entry),
    });
    return page.id;
  }
}

/* -------------------------------------------------------------------- envoi */

/*
 * Envoie une liste d'écritures. Chaque écriture déjà envoyée (elle porte un
 * notionPageId) est mise à jour au lieu d'être recréée : renvoyer deux fois
 * le même mois ne produit pas de doublons.
 *
 * Une écriture en échec n'arrête pas les suivantes ; le rapport dit ce qui
 * est passé et ce qui a échoué.
 */
async function sync(client, databaseId, entries, onProgress) {
  const report = { created: 0, updated: 0, failed: 0, pages: {}, errors: [] };
  const total = entries.length;

  for (let i = 0; i < total; i++) {
    const entry = entries[i];
    if (onProgress) onProgress({ done: i, total: total, label: entry.label });

    try {
      if (entry.notionPageId) {
        await client.updateEntry(entry.notionPageId, entry);
        report.pages[entry.id] = entry.notionPageId;
        report.updated++;
      } else {
        report.pages[entry.id] = await client.createEntry(databaseId, entry);
        report.created++;
      }
    } catch (err) {
      report.failed++;
      // Une page supprimée dans Notion : on oublie le lien pour la recréer
      // au prochain envoi plutôt que de rester bloqué dessus.
      if (entry.notionPageId && (err.status === 404 || err.code === "object_not_found")) {
        report.pages[entry.id] = null;
      }
      if (report.errors.length < 5) {
        report.errors.push({ label: entry.label, reason: err.message });
      }
      // Jeton invalide ou base inaccessible : inutile d'insister 200 fois.
      if (err.status === 401 || err.status === 403) {
        report.aborted = err.message;
        break;
      }
    }
  }

  if (onProgress) onProgress({ done: total, total: total, label: null });
  return report;
}

module.exports = {
  API,
  VERSION,
  TYPE_LABEL,
  parseNotionId,
  selectName,
  signedEuros,
  entryToProperties,
  databaseSchema,
  humanError,
  NotionError,
  NotionClient,
  sync,
};
