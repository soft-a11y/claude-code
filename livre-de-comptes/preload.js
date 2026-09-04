"use strict";

const { contextBridge, ipcRenderer } = require("electron");

// Seule surface exposée à la page : pas d'accès direct au système de fichiers
// ni à Node depuis le renderer.
contextBridge.exposeInMainWorld("compta", {
  load: () => ipcRenderer.invoke("store:load"),
  save: (data) => ipcRenderer.invoke("store:save", data),
  dataPath: () => ipcRenderer.invoke("store:path"),
  revealData: () => ipcRenderer.invoke("store:reveal"),

  saveCsv: (name, text) => ipcRenderer.invoke("file:saveCsv", name, text),
  openCsv: () => ipcRenderer.invoke("file:openCsv"),
  saveJson: (name, text) => ipcRenderer.invoke("file:saveJson", name, text),
  openJson: () => ipcRenderer.invoke("file:openJson"),

  notion: {
    load: () => ipcRenderer.invoke("notion:load"),
    save: (config) => ipcRenderer.invoke("notion:save", config),
    forget: () => ipcRenderer.invoke("notion:forget"),
    check: () => ipcRenderer.invoke("notion:check"),
    useDatabase: (opts) => ipcRenderer.invoke("notion:useDatabase", opts),
    createDatabase: (opts) => ipcRenderer.invoke("notion:createDatabase", opts),
    sync: (opts) => ipcRenderer.invoke("notion:sync", opts),
    onProgress: (handler) => {
      ipcRenderer.on("notion:progress", (_event, progress) => handler(progress));
    },
  },

  confirm: (opts) => ipcRenderer.invoke("dialog:confirm", opts),
  info: (opts) => ipcRenderer.invoke("dialog:info", opts),

  onMenu: (handler) => {
    ipcRenderer.on("menu", (_event, command) => handler(command));
  },
});
