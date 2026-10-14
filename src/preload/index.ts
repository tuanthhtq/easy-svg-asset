import { contextBridge, ipcRenderer } from "electron";
import type { StudioApi } from "../shared/types";
const api: StudioApi = {
  openFolder: () => ipcRenderer.invoke("project:open"),
  openRecent: (root) => ipcRenderer.invoke("project:open-recent", root),
  saveProjectSettings: (settings) =>
    ipcRenderer.invoke("project:settings", settings),
  listAiStylePresets: () => ipcRenderer.invoke("ai-styles:list"),
  saveAiStylePreset: (preset) => ipcRenderer.invoke("ai-styles:save", preset),
  duplicateAiStylePreset: (id) => ipcRenderer.invoke("ai-styles:duplicate", id),
  deleteAiStylePreset: (id) => ipcRenderer.invoke("ai-styles:delete", id),
  addAiStyleReference: (presetId, name, image) =>
    ipcRenderer.invoke("ai-styles:reference-add", presetId, name, image),
  removeAiStyleReference: (presetId, referenceId) =>
    ipcRenderer.invoke("ai-styles:reference-remove", presetId, referenceId),
  loadAiStyleReference: (presetId, referenceId) =>
    ipcRenderer.invoke("ai-styles:reference-load", presetId, referenceId),
  recentFolders: () => ipcRenderer.invoke("project:recent"),
  listDocuments: () => ipcRenderer.invoke("document:list"),
  loadDocument: (name) => ipcRenderer.invoke("document:load", name),
  saveDocument: (name, svg) => ipcRenderer.invoke("document:save", name, svg),
  importSvg: () => ipcRenderer.invoke("document:import"),
  exportPng: (name, svg) => ipcRenderer.invoke("document:png", name, svg),
  listLibrary: () => ipcRenderer.invoke("library:list"),
  saveLibraryShape: (name, svg) =>
    ipcRenderer.invoke("library:save", name, svg),
  useLibraryShape: (path) => ipcRenderer.invoke("library:use", path),
  getAppSettings: () => ipcRenderer.invoke("settings:get"),
  saveAppSettings: (settings) => ipcRenderer.invoke("settings:save", settings),
  runAi: (request) => ipcRenderer.invoke("ai:run", request),
};
contextBridge.exposeInMainWorld("studio", api);
