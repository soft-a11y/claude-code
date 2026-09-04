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
  check("le menu Fichier contient ses entrées", Boolean(fichier) && fichier.submenu.items.length >= 10,
    fichier ? fichier.submenu.items.length + " entrées" : "menu absent");

  const run = (js) => win.webContents.executeJavaScript(js, true);

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

  check("aucune erreur dans la page", errors.length === 0, errors.join(" | "));
  finish();
});

function finish() {
  fs.rmSync(userData, { recursive: true, force: true });
  console.log(failures.length ? "\n" + failures.length + " vérification(s) en échec" : "\nDémarrage réel : tout est vert");
  app.exit(failures.length ? 1 : 0);
}
