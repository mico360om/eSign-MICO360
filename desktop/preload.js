const { contextBridge, ipcRenderer } = require("electron");

// Expose a tiny, safe bridge. The UI is the same React app served by the
// embedded server, so it talks to the API over http on localhost — no extra
// surface needed here beyond identifying the desktop runtime and exposing the
// auto-updater controls.
contextBridge.exposeInMainWorld("mico360", {
  platform: "desktop",
  version: process.versions.electron,

  // ── Auto-update bridge ──────────────────────────────────────────────
  updates: {
    status: () => ipcRenderer.invoke("updates:status"),
    check: () => ipcRenderer.invoke("updates:check"),
    download: () => ipcRenderer.invoke("updates:download"),
    install: () => ipcRenderer.invoke("updates:install"),
    // Subscribe to checking/available/progress/downloaded/error events.
    onEvent: (cb) => {
      const handler = (_e, payload) => cb(payload);
      ipcRenderer.on("updates:event", handler);
      return () => ipcRenderer.removeListener("updates:event", handler);
    },
  },
});
