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

  confirm: (opts) => ipcRenderer.invoke("dialog:confirm", opts),
  info: (opts) => ipcRenderer.invoke("dialog:info", opts),

  onMenu: (handler) => {
    ipcRenderer.on("menu", (_event, command) => handler(command));
  },
});
