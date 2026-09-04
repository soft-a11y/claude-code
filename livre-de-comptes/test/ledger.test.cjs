"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");
const L = require("../renderer/ledger.js");

test("parseAmount accepte les écritures françaises et anglaises", () => {
  assert.equal(L.parseAmount("24,90"), 2490);
  assert.equal(L.parseAmount("24.90"), 2490);
  assert.equal(L.parseAmount("1 234,56"), 123456);
  assert.equal(L.parseAmount("1 234,56"), 123456);
  assert.equal(L.parseAmount("1.234,56"), 123456);
  assert.equal(L.parseAmount("1,234.56"), 123456);
  assert.equal(L.parseAmount("12 €"), 1200);
  assert.equal(L.parseAmount("-45,10"), -4510);
  assert.equal(L.parseAmount("0,07"), 7);
});

test("parseAmount rejette ce qui n'est pas un montant", () => {
  assert.ok(Number.isNaN(L.parseAmount("")));
  assert.ok(Number.isNaN(L.parseAmount("abc")));
  assert.ok(Number.isNaN(L.parseAmount("12a")));
  assert.ok(Number.isNaN(L.parseAmount(null)));
});

test("les totaux en centimes ne dérivent pas", () => {
  const entries = [];
  for (let i = 0; i < 300; i++) entries.push({ type: "d", amount: 10, date: "2026-09-01", category: "Divers" });
  const t = L.totals(entries);
  assert.equal(t.dep, 3000);
  assert.equal(t.solde, -3000);
  assert.equal(t.count, 300);
});

test("totals sépare recettes et dépenses", () => {
  const t = L.totals([
    { type: "r", amount: 238000 },
    { type: "d", amount: 89000 },
    { type: "d", amount: 1999 }
  ]);
  assert.deepEqual(t, { rec: 238000, dep: 90999, solde: 147001, count: 3 });
});

test("byCategory trie et regroupe le reste dans « Autres »", () => {
  const entries = [
    { type: "d", amount: 500, category: "A" },
    { type: "d", amount: 400, category: "B" },
    { type: "d", amount: 300, category: "C" },
    { type: "d", amount: 200, category: "D" },
    { type: "r", amount: 9999, category: "Salaire" }
  ];
  const rows = L.byCategory(entries, 3);
  assert.deepEqual(rows, [
    { name: "A", value: 500 },
    { name: "B", value: 400 },
    { name: "Autres", value: 500 }
  ]);
});

test("navigation entre les mois, y compris aux bascules d'année", () => {
  assert.equal(L.shiftMonth("2026-01", -1), "2025-12");
  assert.equal(L.shiftMonth("2026-12", 1), "2027-01");
  assert.equal(L.shiftMonth("2026-03", -6), "2025-09");
});

test("inMonth ne garde que le mois demandé", () => {
  const entries = [
    { date: "2026-09-01", type: "d", amount: 1 },
    { date: "2026-09-30", type: "d", amount: 1 },
    { date: "2026-10-01", type: "d", amount: 1 }
  ];
  assert.equal(L.inMonth(entries, "2026-09").length, 2);
});

test("parseDate accepte l'ISO et le format français, rejette l'impossible", () => {
  assert.equal(L.parseDate("2026-09-04"), "2026-09-04");
  assert.equal(L.parseDate("04/09/2026"), "2026-09-04");
  assert.equal(L.parseDate("4-9-2026"), "2026-09-04");
  assert.equal(L.parseDate("31/02/2026"), null);
  assert.equal(L.parseDate("n'importe quoi"), null);
});

test("la recherche ignore accents et casse", () => {
  const entries = [
    { label: "Électricité et gaz", category: "Énergie", type: "d", amount: 1 },
    { label: "Supermarché", category: "Courses", type: "d", amount: 1 }
  ];
  assert.equal(L.search(entries, "electricite").length, 1);
  assert.equal(L.search(entries, "ENERGIE").length, 1);
  assert.equal(L.search(entries, "cour").length, 1);
  assert.equal(L.search(entries, "").length, 2);
});

test("validate refuse les brouillons incomplets", () => {
  assert.equal(L.validate({ amount: "0", label: "x", date: "2026-09-04" }).field, "amount");
  assert.equal(L.validate({ amount: "-3", label: "x", date: "2026-09-04" }).field, "amount");
  assert.equal(L.validate({ amount: "10", label: "   ", date: "2026-09-04" }).field, "label");
  assert.equal(L.validate({ amount: "10", label: "x", date: "" }).field, "date");
  assert.equal(L.validate({ amount: "10", label: "x", date: "2026-02-31" }).field, "date");
});

test("validate normalise l'écriture retenue", () => {
  const res = L.validate({ type: "r", amount: "1 200,50", label: "  Salaire  ", category: "", date: "2026-09-04" });
  assert.ok(res.ok);
  assert.deepEqual(res.entry, {
    type: "r",
    amount: 120050,
    label: "Salaire",
    category: "Divers",
    date: "2026-09-04"
  });
});

test("un aller-retour CSV conserve les écritures", () => {
  const entries = [
    { type: "d", amount: 2490, label: "Courses; du soir", category: "Courses", date: "2026-09-04" },
    { type: "r", amount: 238000, label: 'Salaire "net"', category: "Salaire", date: "2026-09-02" }
  ];
  const back = L.fromCsv(L.toCsv(entries));
  assert.deepEqual(back.errors, []);
  assert.equal(back.entries.length, 2);
  const courses = back.entries.find((e) => e.category === "Courses");
  assert.deepEqual(courses, {
    type: "d",
    amount: 2490,
    label: "Courses; du soir",
    category: "Courses",
    date: "2026-09-04"
  });
  assert.equal(back.entries.find((e) => e.type === "r").label, 'Salaire "net"');
});

test("fromCsv lit un export bancaire à virgules et montants signés", () => {
  const csv = [
    "date,libelle,montant",
    "04/09/2026,Supermarché,-24.90",
    "02/09/2026,Virement salaire,2380.00"
  ].join("\n");
  const res = L.fromCsv(csv);
  assert.deepEqual(res.errors, []);
  assert.deepEqual(res.entries[0], {
    type: "d",
    amount: 2490,
    label: "Supermarché",
    category: "Divers",
    date: "2026-09-04"
  });
  assert.equal(res.entries[1].type, "r");
  assert.equal(res.entries[1].amount, 238000);
});

test("fromCsv garde les lignes valides et signale les autres", () => {
  const csv = [
    "Date;Type;Libellé;Catégorie;Montant",
    "2026-09-04;Dépense;Courses;Courses;24,90",
    "pas une date;Dépense;Bug;Divers;10,00",
    "2026-09-05;Dépense;Bug;Divers;pas un montant"
  ].join("\n");
  const res = L.fromCsv(csv);
  assert.equal(res.entries.length, 1);
  assert.equal(res.errors.length, 2);
  assert.deepEqual(res.errors.map((e) => e.line), [3, 4]);
});

test("fromCsv refuse un fichier sans en-tête exploitable", () => {
  const res = L.fromCsv("a;b;c\n1;2;3");
  assert.equal(res.entries.length, 0);
  assert.match(res.errors[0].reason, /en-tête/);
});

test("les données d'exemple couvrent six mois et restent dans le passé", () => {
  const today = new Date(2026, 8, 4);
  const demo = L.buildDemo(today);
  const months = new Set(demo.map((e) => L.monthKey(e.date)));
  assert.equal(months.size, 6);
  demo.forEach((e) => {
    assert.ok(L.isValidIso(e.date));
    assert.ok(new Date(e.date + "T12:00:00") <= new Date(today.getTime() + 86400000));
    assert.ok(Number.isInteger(e.amount) && e.amount > 0);
  });
});

test("centsToCsv écrit toujours deux décimales", () => {
  assert.equal(L.centsToCsv(2490), "24,90");
  assert.equal(L.centsToCsv(7), "0,07");
  assert.equal(L.centsToCsv(100000), "1000,00");
  assert.equal(L.centsToCsv(-4510), "-45,10");
});
