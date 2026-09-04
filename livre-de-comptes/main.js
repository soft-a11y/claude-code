"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");

const DATA_FILE = "comptes.json";
const EMPTY = { version: 1, entries: [] };

let win = null;

/* ------------------------------------------------------------------ store */

function dataPath() {
  return path.join(app.getPath("userData"), DATA_FILE);
}

async function readStore() {
  try {
    const raw = await fs.readFile(dataPath(), "utf8");
    const parsed = JSON.parse(raw);
    if (parsed && Array.isArray(parsed.entries)) return parsed;
    return { ...EMPTY };
  } catch (err) {
    if (err.code === "ENOENT") return { ...EMPTY };
    // Fichier illisible : on le met de côté plutôt que de l'écraser en silence.
    const rescued = dataPath() + ".corrompu-" + Date.now();
    await fs.rename(dataPath(), rescued).catch(() => {});
    return { ...EMPTY, rescuedFrom: rescued };
  }
}

// Écriture atomique : on écrit à côté puis on renomme, pour ne jamais
// laisser un fichier à moitié écrit si l'app est fermée pendant la sauvegarde.
async function writeStore(data) {
  const target = dataPath();
  const tmp = target + ".tmp";
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(tmp, JSON.stringify(data, null, 2), "utf8");
  await fs.copyFile(target, target + ".bak").catch(() => {});
  await fs.rename(tmp, target);
  return target;
}

/* ------------------------------------------------------------------ files */

const CSV_FILTER = [{ name: "Fichier CSV", extensions: ["csv"] }];
const JSON_FILTER = [{ name: "Sauvegarde JSON", extensions: ["json"] }];

async function saveTextFile(suggestedName, filters, text, { bom = false } = {}) {
  const { canceled, filePath } = await dialog.showSaveDialog(win, {
    defaultPath: suggestedName,
    filters,
  });
  if (canceled || !filePath) return { ok: false };
  // Le BOM évite les accents cassés quand le CSV est ouvert dans Excel.
  await fs.writeFile(filePath, (bom ? "\uFEFF" : "") + text, "utf8");
  return { ok: true, path: filePath };
}

async function openTextFile(filters) {
  const { canceled, filePaths } = await dialog.showOpenDialog(win, {
    properties: ["openFile"],
    filters,
  });
  if (canceled || !filePaths.length) return { ok: false };
  let text = await fs.readFile(filePaths[0], "utf8");
  if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
  return { ok: true, path: filePaths[0], text };
}

/* -------------------------------------------------------------------- ipc */

ipcMain.handle("store:load", readStore);
ipcMain.handle("store:save", (_e, data) => writeStore(data));
ipcMain.handle("store:path", dataPath);
ipcMain.handle("store:reveal", () => shell.showItemInFolder(dataPath()));

ipcMain.handle("file:saveCsv", (_e, name, text) =>
  saveTextFile(name, CSV_FILTER, text, { bom: true })
);
ipcMain.handle("file:openCsv", () => openTextFile(CSV_FILTER));
ipcMain.handle("file:saveJson", (_e, name, text) => saveTextFile(name, JSON_FILTER, text));
ipcMain.handle("file:openJson", () => openTextFile(JSON_FILTER));

ipcMain.handle("dialog:confirm", async (_e, { message, detail, confirmLabel }) => {
  const { response } = await dialog.showMessageBox(win, {
    type: "warning",
    buttons: [confirmLabel || "Confirmer", "Annuler"],
    defaultId: 1,
    cancelId: 1,
    message,
    detail,
  });
  return response === 0;
});

ipcMain.handle("dialog:info", async (_e, { message, detail }) => {
  await dialog.showMessageBox(win, { type: "info", buttons: ["OK"], message, detail });
});

/* ------------------------------------------------------------------- menu */

function send(command) {
  if (win) win.webContents.send("menu", command);
}

function buildMenu() {
  const isMac = process.platform === "darwin";

  const template = [
    ...(isMac
      ? [
          {
            label: app.name,
            submenu: [
              { role: "about", label: "À propos de Livre de comptes" },
              { type: "separator" },
              { role: "services", label: "Services" },
              { type: "separator" },
              { role: "hide", label: "Masquer Livre de comptes" },
              { role: "hideOthers", label: "Masquer les autres" },
              { role: "unhide", label: "Tout afficher" },
              { type: "separator" },
              { role: "quit", label: "Quitter Livre de comptes" },
            ],
          },
        ]
      : []),
    {
      label: "Fichier",
      submenu: [
        { label: "Nouvelle écriture", accelerator: "CmdOrCtrl+N", click: () => send("new") },
        { label: "Rechercher", accelerator: "CmdOrCtrl+F", click: () => send("search") },
        { type: "separator" },
        { label: "Importer un CSV…", click: () => send("import-csv") },
        { label: "Exporter le mois en CSV…", accelerator: "CmdOrCtrl+E", click: () => send("export-csv-month") },
        { label: "Exporter tout en CSV…", click: () => send("export-csv-all") },
        { type: "separator" },
        { label: "Enregistrer une sauvegarde…", accelerator: "CmdOrCtrl+S", click: () => send("backup") },
        { label: "Restaurer une sauvegarde…", click: () => send("restore") },
        { type: "separator" },
        { label: "Afficher le fichier de données", click: () => shell.showItemInFolder(dataPath()) },
        ...(isMac ? [{ role: "close", label: "Fermer la fenêtre" }] : [{ role: "quit", label: "Quitter" }]),
      ],
    },
    {
      label: "Édition",
      submenu: [
        { role: "undo", label: "Annuler" },
        { role: "redo", label: "Rétablir" },
        { type: "separator" },
        { role: "cut", label: "Couper" },
        { role: "copy", label: "Copier" },
        { role: "paste", label: "Coller" },
        { role: "selectAll", label: "Tout sélectionner" },
      ],
    },
    {
      label: "Aller",
      submenu: [
        { label: "Mois précédent", accelerator: "CmdOrCtrl+Left", click: () => send("prev") },
        { label: "Mois suivant", accelerator: "CmdOrCtrl+Right", click: () => send("next") },
        { label: "Ce mois-ci", accelerator: "CmdOrCtrl+T", click: () => send("today") },
      ],
    },
    {
      label: "Affichage",
      submenu: [
        { role: "reload", label: "Recharger" },
        { role: "toggleDevTools", label: "Outils de développement" },
        { type: "separator" },
        { role: "resetZoom", label: "Taille réelle" },
        { role: "zoomIn", label: "Agrandir" },
        { role: "zoomOut", label: "Réduire" },
        { type: "separator" },
        { role: "togglefullscreen", label: "Plein écran" },
      ],
    },
    {
      role: "window",
      label: "Fenêtre",
      submenu: [
        { role: "minimize", label: "Réduire" },
        ...(isMac ? [{ role: "zoom", label: "Zoom" }, { role: "front", label: "Tout ramener au premier plan" }] : []),
      ],
    },
    {
      role: "help",
      label: "Aide",
      submenu: [
        { label: "Où sont mes données ?", click: () => send("where") },
        { label: "Charger des données d'exemple", click: () => send("demo") },
      ],
    },
  ];

  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

/* ----------------------------------------------------------------- window */

function createWindow() {
  win = new BrowserWindow({
    width: 1200,
    height: 860,
    minWidth: 720,
    minHeight: 560,
    title: "Livre de comptes",
    backgroundColor: nativeTheme.shouldUseDarkColors ? "#121412" : "#edeee9",
    titleBarStyle: process.platform === "darwin" ? "hiddenInset" : "default",
    show: false,
    webPreferences: {
      preload: path.join(__dirname, "preload.js"),
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
    },
  });

  win.once("ready-to-show", () => win.show());
  win.loadFile(path.join(__dirname, "renderer", "index.html"));

  // Les liens externes s'ouvrent dans le navigateur, jamais dans l'app.
  win.webContents.setWindowOpenHandler(({ url }) => {
    if (/^https?:$/.test(new URL(url).protocol)) shell.openExternal(url);
    return { action: "deny" };
  });
}

app.whenReady().then(() => {
  buildMenu();
  createWindow();
  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
