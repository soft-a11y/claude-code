/*
 * Logique du livre : montants, agrégats, CSV.
 * Aucun accès au DOM ici — ce fichier est testable seul (voir test/).
 * Les montants sont manipulés en centimes (entiers) pour que les totaux
 * restent exacts ; l'affichage et le CSV repassent en euros.
 */
(function (root, factory) {
  "use strict";
  var api = factory();
  if (typeof module === "object" && module.exports) module.exports = api;
  else root.Ledger = api;
})(typeof self !== "undefined" ? self : this, function () {
  "use strict";

  var CATEGORIES = {
    d: ["Courses", "Loyer", "Énergie", "Transports", "Restaurants", "Abonnements", "Santé", "Loisirs", "Vêtements", "Divers"],
    r: ["Salaire", "Freelance", "Remboursement", "Aides", "Vente", "Divers"]
  };

  /* ----------------------------------------------------------- montants */

  // Accepte « 24,90 », « 24.90 », « 1 234,56 », « 12 € ». Renvoie des
  // centimes, ou NaN si ce n'est pas un nombre exploitable.
  function parseAmount(input) {
    var s = String(input == null ? "" : input)
      .replace(/[\s  ]/g, "")
      .replace(/€/g, "");
    if (!s) return NaN;

    var lastComma = s.lastIndexOf(",");
    var lastDot = s.lastIndexOf(".");
    var cut = Math.max(lastComma, lastDot);
    if (lastComma >= 0 && lastDot >= 0) {
      // Deux séparateurs : le dernier est le décimal, l'autre sépare les milliers.
      s = s.slice(0, cut).replace(/[.,]/g, "") + "." + s.slice(cut + 1);
    } else if (cut >= 0) {
      s = s.slice(0, cut) + "." + s.slice(cut + 1);
    }

    if (!/^-?\d*\.?\d*$/.test(s) || !/\d/.test(s)) return NaN;
    var value = parseFloat(s);
    if (!isFinite(value)) return NaN;
    return Math.round(value * 100);
  }

  function toEuros(cents) {
    return Math.round(cents) / 100;
  }

  // Chaîne décimale à la française, pour le CSV : 2490 -> "24,90".
  function centsToCsv(cents) {
    var sign = cents < 0 ? "-" : "";
    var abs = Math.abs(Math.round(cents));
    return sign + Math.floor(abs / 100) + "," + String(abs % 100).padStart(2, "0");
  }

  /* --------------------------------------------------------------- dates */

  function pad(n) { return n < 10 ? "0" + n : String(n); }

  function isoOf(date) {
    return date.getFullYear() + "-" + pad(date.getMonth() + 1) + "-" + pad(date.getDate());
  }

  function monthKey(iso) { return String(iso).slice(0, 7); }

  function dateOfKey(key) {
    return new Date(Number(key.slice(0, 4)), Number(key.slice(5, 7)) - 1, 1);
  }

  function shiftMonth(key, delta) {
    var d = dateOfKey(key);
    d.setMonth(d.getMonth() + delta);
    return d.getFullYear() + "-" + pad(d.getMonth() + 1);
  }

  function isValidIso(iso) {
    if (!/^\d{4}-\d{2}-\d{2}$/.test(String(iso))) return false;
    var parts = String(iso).split("-").map(Number);
    var d = new Date(parts[0], parts[1] - 1, parts[2]);
    return d.getFullYear() === parts[0] && d.getMonth() === parts[1] - 1 && d.getDate() === parts[2];
  }

  // Accepte 2026-09-04, 04/09/2026 et 4-9-2026.
  function parseDate(input) {
    var s = String(input == null ? "" : input).trim();
    var iso = /^(\d{4})[-/](\d{1,2})[-/](\d{1,2})$/.exec(s);
    if (iso) {
      var a = iso[1] + "-" + pad(Number(iso[2])) + "-" + pad(Number(iso[3]));
      return isValidIso(a) ? a : null;
    }
    var fr = /^(\d{1,2})[-/.](\d{1,2})[-/.](\d{4})$/.exec(s);
    if (fr) {
      var b = fr[3] + "-" + pad(Number(fr[2])) + "-" + pad(Number(fr[1]));
      return isValidIso(b) ? b : null;
    }
    return null;
  }

  /* ------------------------------------------------------------ agrégats */

  function inMonth(entries, key) {
    return entries.filter(function (e) { return monthKey(e.date) === key; });
  }

  function totals(entries) {
    var rec = 0, dep = 0;
    entries.forEach(function (e) {
      if (e.type === "r") rec += e.amount; else dep += e.amount;
    });
    return { rec: rec, dep: dep, solde: rec - dep, count: entries.length };
  }

  // Dépenses par catégorie, décroissant, avec regroupement en « Autres »
  // au-delà de `max` lignes pour que le graphique reste lisible.
  function byCategory(entries, max) {
    var sums = Object.create(null);
    entries.forEach(function (e) {
      if (e.type !== "d") return;
      sums[e.category] = (sums[e.category] || 0) + e.amount;
    });
    var rows = Object.keys(sums)
      .map(function (name) { return { name: name, value: sums[name] }; })
      .sort(function (a, b) { return b.value - a.value || a.name.localeCompare(b.name, "fr"); });

    if (max && rows.length > max) {
      var rest = rows.slice(max - 1).reduce(function (s, r) { return s + r.value; }, 0);
      rows = rows.slice(0, max - 1).concat([{ name: "Autres", value: rest }]);
    }
    return rows;
  }

  // Sans accents ni casse, pour que « energie » trouve « Énergie ».
  function normalize(s) {
    return String(s == null ? "" : s)
      .normalize("NFD")
      .replace(/[̀-ͯ]/g, "")
      .toLowerCase();
  }

  function search(entries, query) {
    var q = normalize(query).trim();
    if (!q) return entries;
    return entries.filter(function (e) {
      return normalize(e.label).indexOf(q) >= 0 || normalize(e.category).indexOf(q) >= 0;
    });
  }

  function sortByDateDesc(entries) {
    return entries.slice().sort(function (a, b) {
      if (a.date !== b.date) return a.date < b.date ? 1 : -1;
      return (b.created || 0) - (a.created || 0);
    });
  }

  /* ---------------------------------------------------------- catégories */

  var FALLBACK_CATEGORY = "Divers";

  function defaultCategories() {
    return { d: CATEGORIES.d.slice(), r: CATEGORIES.r.slice() };
  }

  // Nettoie ce qui vient du fichier : on n'a aucune garantie sur son contenu.
  function sanitizeCategories(stored) {
    var out = { d: [], r: [] };
    ["d", "r"].forEach(function (type) {
      var list = stored && Array.isArray(stored[type]) ? stored[type] : CATEGORIES[type];
      var seen = Object.create(null);
      list.forEach(function (name) {
        var clean = String(name == null ? "" : name).trim().slice(0, 40);
        if (!clean || seen[normalize(clean)]) return;
        seen[normalize(clean)] = true;
        out[type].push(clean);
      });
      if (!out[type].length) out[type] = CATEGORIES[type].slice();
    });
    return out;
  }

  function cloneCategories(categories) {
    return { d: categories.d.slice(), r: categories.r.slice() };
  }

  // La liste utilisable : celles que l'on a enregistrées, plus celles portées
  // par des écritures (un import CSV peut en apporter de nouvelles).
  function listCategories(book, type) {
    var seen = Object.create(null);
    var out = [];
    function push(name) {
      var clean = String(name == null ? "" : name).trim();
      if (!clean || seen[normalize(clean)]) return;
      seen[normalize(clean)] = true;
      out.push(clean);
    }
    (book.categories && book.categories[type] ? book.categories[type] : CATEGORIES[type]).forEach(push);
    (book.entries || []).forEach(function (e) { if (e.type === type) push(e.category); });
    return out.sort(function (a, b) { return a.localeCompare(b, "fr"); });
  }

  function countByCategory(entries, type) {
    var counts = Object.create(null);
    (entries || []).forEach(function (e) {
      if (e.type !== type) return;
      var key = normalize(e.category);
      counts[key] = (counts[key] || 0) + 1;
    });
    return function (name) { return counts[normalize(name)] || 0; };
  }

  function findCategory(book, type, name) {
    var wanted = normalize(String(name == null ? "" : name).trim());
    return listCategories(book, type).find(function (c) { return normalize(c) === wanted; }) || null;
  }

  function addCategory(book, type, name) {
    var clean = String(name == null ? "" : name).trim().slice(0, 40);
    if (!clean) return { ok: false, message: "Donnez un nom à la catégorie." };
    var existing = findCategory(book, type, clean);
    if (existing) return { ok: false, message: "« " + existing + " » existe déjà dans cette liste." };

    var categories = cloneCategories(book.categories);
    categories[type] = categories[type].concat([clean]);
    return { ok: true, categories: categories, entries: book.entries, name: clean };
  }

  // Renommer suit les écritures : rien ne se retrouve orphelin.
  function renameCategory(book, type, from, to) {
    var clean = String(to == null ? "" : to).trim().slice(0, 40);
    if (!clean) return { ok: false, message: "Donnez un nom à la catégorie." };
    if (!findCategory(book, type, from)) return { ok: false, message: "Cette catégorie n'existe plus." };
    if (normalize(clean) !== normalize(from) && findCategory(book, type, clean)) {
      return { ok: false, message: "« " + clean + " » existe déjà dans cette liste." };
    }

    var categories = cloneCategories(book.categories);
    var replaced = false;
    categories[type] = categories[type].map(function (c) {
      if (normalize(c) !== normalize(from)) return c;
      replaced = true;
      return clean;
    });
    if (!replaced) categories[type] = categories[type].concat([clean]);

    var moved = 0;
    var entries = (book.entries || []).map(function (e) {
      if (e.type !== type || normalize(e.category) !== normalize(from)) return e;
      moved++;
      return Object.assign({}, e, { category: clean });
    });
    return { ok: true, categories: categories, entries: entries, moved: moved, name: clean };
  }

  // Supprimer ne perd aucune écriture : celles qui l'utilisaient repassent
  // dans la catégorie par défaut.
  function removeCategory(book, type, name) {
    var target = findCategory(book, type, name);
    if (!target) return { ok: false, message: "Cette catégorie n'existe plus." };
    if (normalize(target) === normalize(FALLBACK_CATEGORY)) {
      return { ok: false, message: "« " + FALLBACK_CATEGORY + " » sert de catégorie de repli, elle ne peut pas être supprimée." };
    }

    var categories = cloneCategories(book.categories);
    categories[type] = categories[type].filter(function (c) { return normalize(c) !== normalize(target); });
    if (!categories[type].some(function (c) { return normalize(c) === normalize(FALLBACK_CATEGORY); })) {
      categories[type] = categories[type].concat([FALLBACK_CATEGORY]);
    }

    var moved = 0;
    var entries = (book.entries || []).map(function (e) {
      if (e.type !== type || normalize(e.category) !== normalize(target)) return e;
      moved++;
      return Object.assign({}, e, { category: FALLBACK_CATEGORY });
    });
    return { ok: true, categories: categories, entries: entries, moved: moved, name: target };
  }

  /* ------------------------------------------------------------ écriture */

  function validate(draft) {
    var amount = parseAmount(draft.amount);
    if (isNaN(amount) || amount <= 0) {
      return { ok: false, field: "amount", message: "Indiquez un montant supérieur à zéro, par exemple 24,90." };
    }
    var label = String(draft.label || "").trim();
    if (!label) {
      return { ok: false, field: "label", message: "Ajoutez un libellé pour retrouver cette écriture plus tard." };
    }
    if (!isValidIso(draft.date)) {
      return { ok: false, field: "date", message: "Choisissez une date pour cette écriture." };
    }
    return {
      ok: true,
      entry: {
        type: draft.type === "r" ? "r" : "d",
        amount: amount,
        label: label.slice(0, 80),
        category: (String(draft.category || "").trim() || "Divers").slice(0, 40),
        date: draft.date
      }
    };
  }

  /* ----------------------------------------------------------------- CSV */

  var CSV_HEADER = ["Date", "Type", "Libellé", "Catégorie", "Montant"];

  function csvCell(value) {
    var s = String(value == null ? "" : value);
    return /[";\n\r]/.test(s) ? '"' + s.replace(/"/g, '""') + '"' : s;
  }

  function toCsv(entries) {
    var lines = [CSV_HEADER.join(";")];
    sortByDateDesc(entries).slice().reverse().forEach(function (e) {
      lines.push([
        e.date,
        e.type === "r" ? "Recette" : "Dépense",
        csvCell(e.label),
        csvCell(e.category),
        centsToCsv(e.amount)
      ].join(";"));
    });
    return lines.join("\r\n") + "\r\n";
  }

  function splitCsvLine(line, delimiter) {
    var out = [], field = "", quoted = false;
    for (var i = 0; i < line.length; i++) {
      var c = line[i];
      if (quoted) {
        if (c === '"') {
          if (line[i + 1] === '"') { field += '"'; i++; }
          else quoted = false;
        } else field += c;
      } else if (c === '"') {
        quoted = true;
      } else if (c === delimiter) {
        out.push(field); field = "";
      } else {
        field += c;
      }
    }
    out.push(field);
    return out.map(function (f) { return f.trim(); });
  }

  function splitCsvRows(text) {
    // Un saut de ligne à l'intérieur de guillemets fait partie du champ.
    var rows = [], row = "", quoted = false;
    for (var i = 0; i < text.length; i++) {
      var c = text[i];
      if (c === '"') { quoted = !quoted; row += c; continue; }
      if (!quoted && (c === "\n" || c === "\r")) {
        if (c === "\r" && text[i + 1] === "\n") i++;
        rows.push(row); row = "";
        continue;
      }
      row += c;
    }
    if (row) rows.push(row);
    return rows;
  }

  var FIELD_ALIASES = {
    date: "date",
    type: "type",
    nature: "type",
    sens: "type",
    libelle: "label",
    label: "label",
    description: "label",
    intitule: "label",
    categorie: "category",
    category: "category",
    montant: "amount",
    amount: "amount",
    somme: "amount"
  };

  // Renvoie { entries, errors } : les lignes valides sont gardées même si
  // d'autres sont rejetées, et chaque rejet est expliqué avec son numéro.
  function fromCsv(text) {
    var rows = splitCsvRows(String(text || "")).filter(function (r) { return r.trim() !== ""; });
    if (!rows.length) return { entries: [], errors: [{ line: 0, reason: "le fichier est vide" }] };

    var delimiter = (rows[0].split(";").length >= rows[0].split(",").length) ? ";" : ",";
    var header = splitCsvLine(rows[0], delimiter).map(function (h) {
      return FIELD_ALIASES[normalize(h)] || normalize(h);
    });

    var missing = ["date", "label", "amount"].filter(function (f) { return header.indexOf(f) < 0; });
    if (missing.length) {
      return {
        entries: [],
        errors: [{ line: 1, reason: "en-tête non reconnu, colonnes attendues : " + CSV_HEADER.join(" ; ") }]
      };
    }

    var entries = [], errors = [];
    for (var i = 1; i < rows.length; i++) {
      var cells = splitCsvLine(rows[i], delimiter);
      var raw = {};
      header.forEach(function (name, col) { raw[name] = cells[col]; });

      var date = parseDate(raw.date);
      var amount = parseAmount(raw.amount);
      if (!date) {
        errors.push({ line: i + 1, reason: "date illisible (« " + (raw.date || "") + " »)" });
        continue;
      }
      if (isNaN(amount) || amount === 0) {
        errors.push({ line: i + 1, reason: "montant illisible (« " + (raw.amount || "") + " »)" });
        continue;
      }

      // Le sens vient de la colonne Type ; sans elle, le signe décide
      // (convention des relevés bancaires : négatif = dépense).
      var typeCell = normalize(raw.type);
      var type = typeCell ? (typeCell.charAt(0) === "r" ? "r" : "d") : (amount < 0 ? "d" : "r");

      entries.push({
        type: type,
        amount: Math.abs(amount),
        label: String(raw.label || "Sans libellé").slice(0, 80),
        category: String(raw.category || "Divers").slice(0, 40),
        date: date
      });
    }
    return { entries: entries, errors: errors };
  }

  /* ------------------------------------------------------------- exemple */

  // Six mois d'écritures plausibles et déterministes, pour la démonstration.
  function buildDemo(today) {
    var seed = 20260904;
    function rnd() { seed = (seed * 1103515245 + 12345) % 2147483648; return seed / 2147483648; }
    function jitter(base, spread) { return Math.max(100, Math.round(base + (rnd() - 0.5) * 2 * spread)); }

    var model = [
      [2, "r", "Salaire", "Virement de salaire", 238000, 4500],
      [3, "d", "Loyer", "Loyer et charges", 89000, 0],
      [4, "d", "Énergie", "Électricité et gaz", 7800, 2200],
      [6, "d", "Courses", "Supermarché", 9400, 2600],
      [7, "d", "Transports", "Abonnement transports", 7500, 0],
      [9, "d", "Abonnements", "Forfait mobile", 1999, 0],
      [10, "d", "Restaurants", "Déjeuner au bureau", 2800, 1100],
      [12, "d", "Courses", "Marché du dimanche", 4600, 1500],
      [14, "d", "Loisirs", "Cinéma", 2300, 800],
      [16, "d", "Santé", "Pharmacie", 2600, 1200],
      [17, "d", "Courses", "Supermarché", 8800, 2400],
      [19, "d", "Abonnements", "Plateforme vidéo", 1399, 0],
      [21, "r", "Freelance", "Mission de conseil", 42000, 18000],
      [22, "d", "Restaurants", "Dîner entre amis", 5400, 1900],
      [24, "d", "Transports", "Plein d'essence", 6200, 1600],
      [26, "d", "Courses", "Supermarché", 8100, 2100],
      [27, "d", "Vêtements", "Chaussures", 6900, 3000],
      [28, "d", "Divers", "Cadeau d'anniversaire", 4200, 1800]
    ];

    var out = [];
    for (var back = 5; back >= 0; back--) {
      var month = new Date(today.getFullYear(), today.getMonth() - back, 1);
      for (var i = 0; i < model.length; i++) {
        var row = model[i];
        var lastDay = new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate();
        var when = new Date(month.getFullYear(), month.getMonth(), Math.min(row[0], lastDay));
        if (when > today) continue;
        if (row[2] === "Freelance" && back % 2 === 1) continue;
        if (row[2] === "Vêtements" && back % 3 !== 0) continue;
        out.push({
          type: row[1],
          amount: jitter(row[4], row[5]),
          label: row[3],
          category: row[2],
          date: isoOf(when)
        });
      }
    }
    return out;
  }

  return {
    CATEGORIES: CATEGORIES,
    CSV_HEADER: CSV_HEADER,
    FALLBACK_CATEGORY: FALLBACK_CATEGORY,
    defaultCategories: defaultCategories,
    sanitizeCategories: sanitizeCategories,
    listCategories: listCategories,
    countByCategory: countByCategory,
    findCategory: findCategory,
    addCategory: addCategory,
    renameCategory: renameCategory,
    removeCategory: removeCategory,
    parseAmount: parseAmount,
    toEuros: toEuros,
    centsToCsv: centsToCsv,
    isoOf: isoOf,
    monthKey: monthKey,
    dateOfKey: dateOfKey,
    shiftMonth: shiftMonth,
    isValidIso: isValidIso,
    parseDate: parseDate,
    inMonth: inMonth,
    totals: totals,
    byCategory: byCategory,
    normalize: normalize,
    search: search,
    sortByDateDesc: sortByDateDesc,
    validate: validate,
    toCsv: toCsv,
    fromCsv: fromCsv,
    buildDemo: buildDemo
  };
});
