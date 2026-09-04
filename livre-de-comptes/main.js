"use strict";

const { app, BrowserWindow, Menu, dialog, ipcMain, shell, nativeTheme } = require("electron");
const fs = require("node:fs/promises");
const path = require("node:path");
const notion = require("./notion.js");

const DATA_FILE = "comptes.json";
const NOTION_FILE = "notion.json";
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

/* ----------------------------------------------------------------- Notion */

// Le jeton d'intégration vit dans son propre fichier, en lecture pour le seul
// propriétaire : il ne doit se retrouver ni dans le livre, ni dans une
// sauvegarde, ni dans un export que l'on partage.
function notionPath() {
  return path.join(app.getPath("userData"), NOTION_FILE);
}

async function readNotionConfig() {
  try {
    const parsed = JSON.parse(await fs.readFile(notionPath(), "utf8"));
    return {
      token: typeof parsed.token === "string" ? parsed.token : "",
      databaseId: typeof parsed.databaseId === "string" ? parsed.databaseId : "",
    };
  } catch (err) {
    return { token: "", databaseId: "" };
  }
}

async function writeNotionConfig(config) {
  const target = notionPath();
  await fs.mkdir(path.dirname(target), { recursive: true });
  await fs.writeFile(target, JSON.stringify(config, null, 2), { encoding: "utf8", mode: 0o600 });
  await fs.chmod(target, 0o600).catch(() => {});
}

function notionClient(token) {
  return new notion.NotionClient(token, { fetch: globalThis.fetch });
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

/* Le jeton ne repart jamais vers la page : elle sait seulement s'il existe. */
ipcMain.handle("notion:load", async () => {
  const config = await readNotionConfig();
  return { hasToken: Boolean(config.token), databaseId: config.databaseId };
});

ipcMain.handle("notion:save", async (_e, { token, databaseId }) => {
  const current = await readNotionConfig();
  const next = {
    // Un champ jeton laissé vide veut dire « garde celui déjà enregistré ».
    token: typeof token === "string" && token.trim() ? token.trim() : current.token,
    databaseId: typeof databaseId === "string" ? databaseId : current.databaseId,
  };
  await writeNotionConfig(next);
  return { hasToken: Boolean(next.token), databaseId: next.databaseId };
});

// Reçoit ce que l'utilisateur a collé (URL ou identifiant), en tire la base,
// vérifie qu'elle est accessible, puis l'enregistre.
ipcMain.handle("notion:useDatabase", async (_e, { target }) => {
  const config = await readNotionConfig();
  if (!config.token) return { ok: false, message: "Enregistrez d'abord votre jeton d'intégration." };
  const databaseId = notion.parseNotionId(target);
  if (!databaseId) return { ok: false, message: "Adresse de base Notion non reconnue." };
  try {
    const database = await notionClient(config.token).checkDatabase(databaseId);
    await writeNotionConfig({ token: config.token, databaseId: databaseId });
    return { ok: true, databaseId: databaseId, title: database.title, url: database.url };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle("notion:forget", async () => {
  await fs.rm(notionPath(), { force: true });
  return { hasToken: false, databaseId: "" };
});

ipcMain.handle("notion:check", async () => {
  const config = await readNotionConfig();
  if (!config.token) return { ok: false, message: "Aucun jeton enregistré." };
  if (!config.databaseId) return { ok: false, message: "Aucune base indiquée." };
  try {
    const database = await notionClient(config.token).checkDatabase(config.databaseId);
    return { ok: true, title: database.title, url: database.url };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle("notion:createDatabase", async (_e, { parent, title }) => {
  const config = await readNotionConfig();
  if (!config.token) return { ok: false, message: "Enregistrez d'abord votre jeton d'intégration." };
  const parentId = notion.parseNotionId(parent);
  if (!parentId) return { ok: false, message: "Adresse de page Notion non reconnue." };
  try {
    const database = await notionClient(config.token).createDatabase(parentId, title);
    await writeNotionConfig({ token: config.token, databaseId: database.id });
    return { ok: true, databaseId: database.id, url: database.url };
  } catch (err) {
    return { ok: false, message: err.message };
  }
});

ipcMain.handle("notion:sync", async (event, { entries }) => {
  const config = await readNotionConfig();
  if (!config.token || !config.databaseId) {
    return { ok: false, message: "Configurez le jeton et la base avant d'envoyer." };
  }
  try {
    const report = await notion.sync(
      notionClient(config.token),
      config.databaseId,
      entries || [],
      (progress) => event.sender.send("notion:progress", progress)
    );
    return { ok: true, report };
  } catch (err) {
    return { ok: false, message: err.message };
  }
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
        { label: "Importer un CSV…", click: () => send("import-csv") },
        { label: "Exporter le mois en CSV…", accelerator: "CmdOrCtrl+E", click: () => send("export-csv-month") },
        { label: "Exporter tout en CSV…", click: () => send("export-csv-all") },
        { type: "separator" },
        { label: "Envoyer vers Notion…", accelerator: "CmdOrCtrl+Shift+N", click: () => send("notion") },
        { type: "separator" },
        { label: "Enregistrer une sauvegarde…", accelerator: "CmdOrCtrl+S", click: () => send("backup") },
        { label: "Restaurer une sauvegarde…", click: () => send("restore") },
        { type: "separator" },
        { label: "Afficher le fichier de données", click: () => shell.showItemInFolder(dataPath()) },
        ...(isMac ? [{ role: "close", label: "Fermer la fenêtre" }] : [{ role: "quit", label: "Quitter" }]),
      ],
    },
    {
      label: "Livre",
      submenu: [
        { label: "Nouvelle écriture", accelerator: "CmdOrCtrl+N", click: () => send("new") },
        { label: "Rechercher", accelerator: "CmdOrCtrl+F", click: () => send("search") },
        { type: "separator" },
        { label: "Gérer les catégories…", accelerator: "CmdOrCtrl+K", click: () => send("categories") },
        { type: "separator" },
        { label: "Charger des données d'exemple", click: () => send("demo") },
        { label: "Effacer toutes les données…", click: () => send("wipe") },
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
