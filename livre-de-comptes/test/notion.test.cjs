"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const N = require("../notion.js");

/* Un faux fetch : enregistre les appels et rend les réponses programmées. */
function fakeFetch(responses) {
  const calls = [];
  const queue = responses.slice();
  const fetch = async (url, options) => {
    calls.push({ url, method: options.method, headers: options.headers, body: options.body ? JSON.parse(options.body) : null });
    const next = queue.shift() || { status: 200, body: {} };
    return {
      ok: next.status >= 200 && next.status < 300,
      status: next.status,
      headers: { get: (name) => (next.headers || {})[name] || null },
      json: async () => next.body,
    };
  };
  fetch.calls = calls;
  return fetch;
}

const client = (fetch, options = {}) =>
  new N.NotionClient("ntn_secret", Object.assign({ fetch, throttleMs: 0, wait: async () => {} }, options));

const ENTRY = {
  id: "e1",
  type: "d",
  amount: 2490,
  label: "Courses du soir",
  category: "Courses",
  date: "2026-09-04",
};

/* ---------------------------------------------------------- identifiants */

test("parseNotionId lit une URL de page Notion", () => {
  assert.equal(
    N.parseNotionId("https://www.notion.so/Mes-comptes-1f2e3d4c5b6a7988990a1b2c3d4e5f60"),
    "1f2e3d4c-5b6a-7988-990a-1b2c3d4e5f60"
  );
});

test("parseNotionId ignore les paramètres de vue", () => {
  // Le ?v=… porte un second identifiant : c'est celui de la vue, pas de la base.
  assert.equal(
    N.parseNotionId("https://www.notion.so/moi/Comptes-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa?v=bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb&pvs=4"),
    "aaaaaaaa-aaaa-aaaa-aaaa-aaaaaaaaaaaa"
  );
});

test("parseNotionId accepte un UUID et un identifiant brut", () => {
  const expected = "1f2e3d4c-5b6a-7988-990a-1b2c3d4e5f60";
  assert.equal(N.parseNotionId("1f2e3d4c5b6a7988990a1b2c3d4e5f60"), expected);
  assert.equal(N.parseNotionId(expected), expected);
  assert.equal(N.parseNotionId("  " + expected + "  "), expected);
});

test("parseNotionId rejette ce qui n'en est pas un", () => {
  assert.equal(N.parseNotionId(""), null);
  assert.equal(N.parseNotionId("https://exemple.fr/page"), null);
  assert.equal(N.parseNotionId("bonjour"), null);
  assert.equal(N.parseNotionId(null), null);
});

/* ------------------------------------------------------------ conversion */

test("le montant part signé pour que Notion additionne le solde", () => {
  assert.equal(N.signedEuros({ type: "d", amount: 2490 }), -24.9);
  assert.equal(N.signedEuros({ type: "r", amount: 238000 }), 2380);
  assert.equal(N.signedEuros({ type: "d", amount: 7 }), -0.07);
});

test("entryToProperties construit les propriétés attendues", () => {
  assert.deepEqual(N.entryToProperties(ENTRY), {
    "Libellé": { title: [{ text: { content: "Courses du soir" } }] },
    Date: { date: { start: "2026-09-04" } },
    Montant: { number: -24.9 },
    Type: { select: { name: "Dépense" } },
    "Catégorie": { select: { name: "Courses" } },
  });
});

test("les virgules sont retirées des noms d'option, refusés par Notion", () => {
  const props = N.entryToProperties(Object.assign({}, ENTRY, { category: "Maison, jardin" }));
  assert.equal(props["Catégorie"].select.name, "Maison  jardin");
  assert.equal(N.selectName("", "Divers"), "Divers");
});

test("le schéma de base contient les cinq colonnes", () => {
  const schema = N.databaseSchema();
  assert.deepEqual(Object.keys(schema).sort(), ["Catégorie", "Date", "Libellé", "Montant", "Type"]);
  assert.deepEqual(schema["Libellé"], { title: {} });
  assert.equal(schema.Montant.number.format, "euro");
  assert.deepEqual(schema.Type.select.options.map((o) => o.name), ["Dépense", "Recette"]);
});

/* --------------------------------------------------------------- requêtes */

test("createEntry envoie une page correctement formée", async () => {
  const fetch = fakeFetch([{ status: 200, body: { id: "page-1" } }]);
  const pageId = await client(fetch).createEntry("db-1", ENTRY);

  assert.equal(pageId, "page-1");
  assert.equal(fetch.calls.length, 1);
  const call = fetch.calls[0];
  assert.equal(call.url, "https://api.notion.com/v1/pages");
  assert.equal(call.method, "POST");
  assert.equal(call.headers.Authorization, "Bearer ntn_secret");
  assert.equal(call.headers["Notion-Version"], "2022-06-28");
  assert.deepEqual(call.body.parent, { type: "database_id", database_id: "db-1" });
  assert.equal(call.body.properties.Montant.number, -24.9);
});

test("updateEntry vise la page existante", async () => {
  const fetch = fakeFetch([{ status: 200, body: { id: "page-1" } }]);
  await client(fetch).updateEntry("page-1", ENTRY);
  assert.equal(fetch.calls[0].url, "https://api.notion.com/v1/pages/page-1");
  assert.equal(fetch.calls[0].method, "PATCH");
});

test("createDatabase place la base dans la page parente", async () => {
  const fetch = fakeFetch([{ status: 200, body: { id: "db-9", url: "https://notion.so/db-9" } }]);
  const res = await client(fetch).createDatabase("page-parent", "Livre de comptes");

  assert.deepEqual(res, { id: "db-9", url: "https://notion.so/db-9" });
  assert.deepEqual(fetch.calls[0].body.parent, { type: "page_id", page_id: "page-parent" });
  assert.equal(fetch.calls[0].body.title[0].text.content, "Livre de comptes");
});

test("checkDatabase rend le titre en texte simple", async () => {
  const fetch = fakeFetch([{
    status: 200,
    body: { id: "db-1", url: "https://notion.so/db-1", title: [{ plain_text: "Livre de " }, { plain_text: "comptes" }] },
  }]);
  const res = await client(fetch).checkDatabase("db-1");
  assert.equal(res.title, "Livre de comptes");
});

/* ---------------------------------------------------------------- erreurs */

test("les erreurs de Notion deviennent des phrases utiles", async () => {
  const cases = [
    [401, { code: "unauthorized" }, /Jeton refusé/],
    [403, { code: "restricted_resource" }, /Connexions/],
    [404, { code: "object_not_found" }, /partagée avec votre intégration/],
    [400, { code: "validation_error", message: "body failed validation" }, /refusé les données/],
    [503, {}, /indisponible/],
  ];
  for (const [status, body, pattern] of cases) {
    const fetch = fakeFetch([{ status, body }]);
    await assert.rejects(() => client(fetch).createEntry("db-1", ENTRY), (err) => {
      assert.equal(err.name, "NotionError");
      assert.equal(err.status, status);
      assert.match(err.message, pattern);
      return true;
    });
  }
});

test("un 429 est réessayé une fois", async () => {
  const fetch = fakeFetch([
    { status: 429, body: { code: "rate_limited" }, headers: { "Retry-After": "1" } },
    { status: 200, body: { id: "page-1" } },
  ]);
  const pageId = await client(fetch).createEntry("db-1", ENTRY);
  assert.equal(pageId, "page-1");
  assert.equal(fetch.calls.length, 2);
});

test("un second 429 abandonne", async () => {
  const fetch = fakeFetch([
    { status: 429, body: { code: "rate_limited" } },
    { status: 429, body: { code: "rate_limited" } },
  ]);
  await assert.rejects(() => client(fetch).createEntry("db-1", ENTRY), /ralentir/);
});

/* ------------------------------------------------------------------ envoi */

test("sync crée les nouvelles écritures et met à jour les autres", async () => {
  const entries = [
    Object.assign({}, ENTRY, { id: "a" }),
    Object.assign({}, ENTRY, { id: "b", notionPageId: "page-b" }),
  ];
  const fetch = fakeFetch([
    { status: 200, body: { id: "page-a" } },
    { status: 200, body: { id: "page-b" } },
  ]);

  const report = await N.sync(client(fetch), "db-1", entries);
  assert.equal(report.created, 1);
  assert.equal(report.updated, 1);
  assert.equal(report.failed, 0);
  assert.deepEqual(report.pages, { a: "page-a", b: "page-b" });
  assert.equal(fetch.calls[0].method, "POST");
  assert.equal(fetch.calls[1].method, "PATCH");
});

test("renvoyer deux fois le même livre ne crée pas de doublon", async () => {
  const entries = [Object.assign({}, ENTRY, { id: "a" })];
  const first = await N.sync(client(fakeFetch([{ status: 200, body: { id: "page-a" } }])), "db-1", entries);
  entries[0].notionPageId = first.pages.a;

  const fetch = fakeFetch([{ status: 200, body: { id: "page-a" } }]);
  const second = await N.sync(client(fetch), "db-1", entries);
  assert.equal(second.created, 0);
  assert.equal(second.updated, 1);
  assert.equal(fetch.calls[0].method, "PATCH");
});

test("une écriture en échec n'arrête pas les suivantes", async () => {
  const entries = [
    Object.assign({}, ENTRY, { id: "a", label: "Cassée" }),
    Object.assign({}, ENTRY, { id: "b" }),
  ];
  const fetch = fakeFetch([
    { status: 400, body: { code: "validation_error", message: "nope" } },
    { status: 200, body: { id: "page-b" } },
  ]);

  const report = await N.sync(client(fetch), "db-1", entries);
  assert.equal(report.failed, 1);
  assert.equal(report.created, 1);
  assert.deepEqual(report.pages, { b: "page-b" });
  assert.equal(report.errors[0].label, "Cassée");
});

test("une page supprimée dans Notion sera recréée au prochain envoi", async () => {
  const entries = [Object.assign({}, ENTRY, { id: "a", notionPageId: "page-disparue" })];
  const fetch = fakeFetch([{ status: 404, body: { code: "object_not_found" } }]);

  const report = await N.sync(client(fetch), "db-1", entries);
  assert.equal(report.failed, 1);
  assert.equal(report.pages.a, null);
});

test("un jeton refusé interrompt l'envoi au lieu d'insister", async () => {
  const entries = [
    Object.assign({}, ENTRY, { id: "a" }),
    Object.assign({}, ENTRY, { id: "b" }),
    Object.assign({}, ENTRY, { id: "c" }),
  ];
  const fetch = fakeFetch([{ status: 401, body: { code: "unauthorized" } }]);

  const report = await N.sync(client(fetch), "db-1", entries);
  assert.equal(fetch.calls.length, 1);
  assert.match(report.aborted, /Jeton refusé/);
});

test("sync rend compte de sa progression", async () => {
  const entries = [Object.assign({}, ENTRY, { id: "a" }), Object.assign({}, ENTRY, { id: "b" })];
  const fetch = fakeFetch([{ status: 200, body: { id: "p1" } }, { status: 200, body: { id: "p2" } }]);
  const steps = [];

  await N.sync(client(fetch), "db-1", entries, (p) => steps.push(p.done + "/" + p.total));
  assert.deepEqual(steps, ["0/2", "1/2", "2/2"]);
});

test("le débit est bridé entre deux requêtes", async () => {
  const waits = [];
  const fetch = fakeFetch([{ status: 200, body: { id: "p1" } }, { status: 200, body: { id: "p2" } }]);
  const throttled = new N.NotionClient("ntn_secret", {
    fetch,
    throttleMs: 350,
    wait: async (ms) => { waits.push(ms); },
  });

  await throttled.createEntry("db-1", ENTRY);
  await throttled.createEntry("db-1", ENTRY);
  assert.equal(waits.length, 1);
  assert.ok(waits[0] > 0 && waits[0] <= 350, "attente de " + waits[0] + " ms");
});
