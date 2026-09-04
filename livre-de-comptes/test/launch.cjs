/*
 * Démarrage réel de l'application, sans intervention : Electron ouvre la
 * fenêtre, la page s'exécute, on écrit une écriture par les canaux IPC, on
 * vérifie le fichier sur disque, puis on quitte.
 * Lancement : xvfb-run -a node test/launch.cjs
 */
"use strict";

const { app, BrowserWindow } = require("electron");
const fs = require("node:fs");
const os = require("node:os");
const path = require("node:path");

// Un profil jetable : le test ne touche jamais aux vraies données.
const userData = fs.mkdtempSync(path.join(os.tmpdir(), "livre-test-"));
app.setPath("userData", userData);

const failures = [];
function check(name, condition, detail) {
  if (condition) console.log("ok   " + name);
  else {
    console.log("FAIL " + name + (detail ? " — " + detail : ""));
    failures.push(name);
  }
}

// Un blocage doit se solder par un échec visible, pas par une attente sans fin.
const watchdog = setTimeout(() => {
  console.log("FAIL le test ne s'est pas terminé en 90 s");
  process.exit(1);
}, 90000);
watchdog.unref();

require("../main.js");

app.whenReady().then(async () => {
  // main.js a créé sa fenêtre dans le même tick « ready ».
  const win = BrowserWindow.getAllWindows()[0];
  check("la fenêtre est créée", Boolean(win));
  if (!win) return finish();

  const errors = [];
  win.webContents.on("console-message", (event) => {
    if (event.level === "error" || event.level === 3) errors.push(event.message);
  });
  win.webContents.on("render-process-gone", (_e, details) => errors.push("processus perdu : " + details.reason));

  await new Promise((resolve) => win.webContents.once("did-finish-load", resolve));

  const { Menu } = require("electron");
  const menu = Menu.getApplicationMenu();
  check("le menu de l'application est en place", Boolean(menu));
  const fichier = menu && menu.items.find((i) => i.label === "Fichier");
  check("le menu Fichier contient l'import et l'export", Boolean(fichier) &&
    fichier.submenu.items.some((i) => i.label === "Importer un CSV…") &&
    fichier.submenu.items.some((i) => i.label.startsWith("Exporter le mois")));

  const livre = menu && menu.items.find((i) => i.label === "Livre");
  check("le menu Livre ouvre la gestion des catégories", Boolean(livre) &&
    livre.submenu.items.some((i) => i.label === "Gérer les catégories…"));

  const run = (js) => win.webContents.executeJavaScript(js, true);
  // executeJavaScript évalue une expression : pas d'await à la racine, mais il
  // attend la promesse rendue. On enveloppe donc les appels asynchrones.
  const runAsync = (js) => run("(async () => { return " + js + "; })()");

  check("le pont preload est exposé", await run("typeof window.compta === 'object'"));
  check("la logique du livre est chargée", await run("typeof window.Ledger.totals === 'function'"));
  check("le livre démarre vide", (await run("document.querySelectorAll('#ledgerBody tr').length")) === 0);

  // Saisie complète, comme un utilisateur : montant, libellé, catégorie, envoi.
  await run(`
    document.getElementById('fAmount').value = '24,90';
    document.getElementById('fLabel').value = 'Courses du soir';
    document.getElementById('fCat').value = 'Courses';
    document.getElementById('entryForm').dispatchEvent(new Event('submit', { cancelable: true }));
    true;
  `);
  await new Promise((r) => setTimeout(r, 400));

  check("l'écriture apparaît dans le tableau", (await run("document.querySelectorAll('#ledgerBody tr').length")) === 1);

  const file = path.join(userData, "comptes.json");
  check("le fichier de données est écrit", fs.existsSync(file));
  if (fs.existsSync(file)) {
    const saved = JSON.parse(fs.readFileSync(file, "utf8"));
    check("le montant est stocké en centimes", saved.entries.length === 1 && saved.entries[0].amount === 2490,
      JSON.stringify(saved.entries[0]));
    check("le libellé est conservé", saved.entries[0].label === "Courses du soir");
  }

  // Les commandes de menu passent par le même canal que les vrais menus.
  win.webContents.send("menu", "prev");
  await new Promise((r) => setTimeout(r, 250));
  check("la commande de menu « mois précédent » est prise en compte",
    (await run("document.querySelectorAll('#ledgerBody tr').length")) === 0);

  /* ---- Notion : réglages et garde-fous, sans appeler l'API ---- */

  const livreMenu = menu && menu.items.find((i) => i.label === "Fichier");
  check("le menu Fichier propose l'envoi vers Notion", Boolean(livreMenu) &&
    livreMenu.submenu.items.some((i) => i.label === "Envoyer vers Notion…"));

  check("le pont Notion est exposé", await run("typeof window.compta.notion.sync === 'function'"));

  const before = JSON.parse(await runAsync("JSON.stringify(await window.compta.notion.load())"));
  check("aucun réglage Notion au départ", before.hasToken === false && before.databaseId === "");

  const SECRET = "ntn_jeton_de_test_0123456789";
  await runAsync(`window.compta.notion.save({ token: ${JSON.stringify(SECRET)} })`);

  const after = JSON.parse(await runAsync("JSON.stringify(await window.compta.notion.load())"));
  check("le jeton est enregistré", after.hasToken === true);
  check("le jeton ne revient jamais vers la page", !JSON.stringify(after).includes(SECRET),
    JSON.stringify(after));

  const notionFile = path.join(userData, "notion.json");
  check("le jeton vit dans son propre fichier", fs.existsSync(notionFile));
  if (fs.existsSync(notionFile)) {
    const mode = fs.statSync(notionFile).mode & 0o777;
    check("le fichier du jeton est lisible par le seul propriétaire", mode === 0o600, "mode " + mode.toString(8));
  }

  const ledger = JSON.parse(fs.readFileSync(file, "utf8"));
  check("le jeton n'est pas dans le livre", !JSON.stringify(ledger).includes(SECRET));

  const noDb = JSON.parse(await runAsync("JSON.stringify(await window.compta.notion.sync({ entries: [] }))"));
  check("sans base configurée, l'envoi refuse proprement", noDb.ok === false && /base/i.test(noDb.message),
    JSON.stringify(noDb));

  const badTarget = JSON.parse(await runAsync(
    "JSON.stringify(await window.compta.notion.useDatabase({ target: 'https://exemple.fr/pas-notion' }))"
  ));
  check("une adresse non reconnue est refusée sans appel réseau",
    badTarget.ok === false && /non reconnue/.test(badTarget.message), JSON.stringify(badTarget));

  const forgotten = JSON.parse(await runAsync("JSON.stringify(await window.compta.notion.forget())"));
  check("oublier les réglages efface le fichier", forgotten.hasToken === false && !fs.existsSync(notionFile));

  check("aucune erreur dans la page", errors.length === 0, errors.join(" | "));
  finish();
});

function finish() {
  fs.rmSync(userData, { recursive: true, force: true });
  console.log(failures.length ? "\n" + failures.length + " vérification(s) en échec" : "\nDémarrage réel : tout est vert");
  app.exit(failures.length ? 1 : 0);
}
