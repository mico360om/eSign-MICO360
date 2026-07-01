// ─────────────────────────────────────────────────────────────────────────────
// eSign MICO360 — Desktop auto-updater
//
// Uses electron-updater against GitHub Releases (repo: mico360om/eSign-MICO360).
// Flow:
//   1. On startup (and on demand) check the repo's latest release vs installed.
//   2. Surface current version, new version, changelog and download size.
//   3. Download with a progress bar (events streamed to the renderer).
//   4. electron-updater verifies the package sha512 (from latest.yml) before
//      it is ever applied — a corrupt/incomplete download is rejected and the
//      running app is left untouched (implicit rollback / safety).
//   5. Install on restart via quitAndInstall().
//
// User data, settings, the SQLite database and storage live in %APPDATA%\eSign
// MICO360 and are never touched by the updater, so records survive updates.
//
// A plain-text log of every check/download/install is kept at
//   %APPDATA%\eSign MICO360\update-logs\updates.log
// with old version, new version, timestamp, status and any error detail.
// ─────────────────────────────────────────────────────────────────────────────

const { app, ipcMain, dialog, BrowserWindow } = require("electron");
const path = require("path");
const fs = require("fs");

let autoUpdater;
try {
  ({ autoUpdater } = require("electron-updater"));
} catch (e) {
  autoUpdater = null; // dependency missing — updater becomes a no-op (logged below)
}

// ── File logger ──────────────────────────────────────────────────────
let logFile;
function logLine(level, msg) {
  try {
    if (!logFile) {
      const dir = path.join(app.getPath("userData"), "update-logs");
      fs.mkdirSync(dir, { recursive: true });
      logFile = path.join(dir, "updates.log");
    }
    const ts = new Date().toISOString();
    fs.appendFileSync(logFile, `[${ts}] [${level}] ${msg}\n`);
  } catch {
    /* never let logging crash the app */
  }
}
function logEvent(obj) {
  logLine("EVENT", JSON.stringify({ installedVersion: app.getVersion(), ...obj }));
}
const fileLogger = {
  info: (m) => logLine("INFO", typeof m === "string" ? m : JSON.stringify(m)),
  warn: (m) => logLine("WARN", typeof m === "string" ? m : JSON.stringify(m)),
  error: (m) => logLine("ERROR", typeof m === "string" ? m : JSON.stringify(m)),
  debug: () => {},
  transports: {},
};

let mainWindow = null;
let checking = false;
let availableInfo = null; // last UpdateInfo we offered to the user

function send(channel, payload) {
  try {
    if (mainWindow && !mainWindow.isDestroyed()) mainWindow.webContents.send(channel, payload);
  } catch { /* renderer gone */ }
}

// Detect a "forced" release: put the token [forced] anywhere in the GitHub
// release notes to require users to update before continuing.
function isForced(info) {
  const notes = typeof info?.releaseNotes === "string" ? info.releaseNotes
    : Array.isArray(info?.releaseNotes) ? info.releaseNotes.map((n) => n.note).join("\n") : "";
  return /\[forced\]/i.test(notes || "");
}

function changelogText(info) {
  if (!info) return "";
  if (typeof info.releaseNotes === "string") return info.releaseNotes.replace(/<[^>]+>/g, "").trim();
  if (Array.isArray(info.releaseNotes)) return info.releaseNotes.map((n) => `v${n.version}\n${(n.note || "").replace(/<[^>]+>/g, "")}`).join("\n\n");
  return "";
}

function totalBytes(info) {
  try { return (info.files || []).reduce((s, f) => s + (f.size || 0), 0); } catch { return 0; }
}

function setup(win) {
  mainWindow = win;

  if (!autoUpdater) {
    logLine("WARN", "electron-updater not available — auto-update disabled");
    ipcMain.handle("updates:status", () => ({ supported: false, currentVersion: app.getVersion() }));
    ipcMain.handle("updates:check", () => ({ supported: false, currentVersion: app.getVersion() }));
    ipcMain.handle("updates:download", () => ({ ok: false, error: "Updater not available" }));
    ipcMain.handle("updates:install", () => ({ ok: false, error: "Updater not available" }));
    return;
  }

  autoUpdater.autoDownload = false;           // we present changelog/size first
  autoUpdater.autoInstallOnAppQuit = true;    // apply a downloaded update on next quit
  autoUpdater.logger = fileLogger;
  autoUpdater.allowDowngrade = false;

  autoUpdater.on("checking-for-update", () => { send("updates:event", { type: "checking" }); });

  autoUpdater.on("update-available", (info) => {
    availableInfo = info;
    const payload = {
      type: "available",
      currentVersion: app.getVersion(),
      version: info.version,
      changelog: changelogText(info),
      sizeBytes: totalBytes(info),
      forced: isForced(info),
      releaseDate: info.releaseDate,
    };
    logEvent({ event: "update-available", newVersion: info.version, forced: payload.forced, status: "available" });
    send("updates:event", payload);
    if (payload.forced) startDownload(); // forced: begin immediately
  });

  autoUpdater.on("update-not-available", (info) => {
    logEvent({ event: "update-not-available", status: "up-to-date" });
    send("updates:event", { type: "up-to-date", currentVersion: app.getVersion(), version: info?.version });
  });

  autoUpdater.on("download-progress", (p) => {
    send("updates:event", { type: "progress", percent: p.percent, transferred: p.transferred, total: p.total, bytesPerSecond: p.bytesPerSecond });
  });

  autoUpdater.on("update-downloaded", (info) => {
    logEvent({ event: "update-downloaded", newVersion: info.version, status: "downloaded" });
    send("updates:event", { type: "downloaded", version: info.version, forced: isForced(info) });
  });

  autoUpdater.on("error", (err) => {
    // "No release published yet" is not an error — it just means the user is on
    // the latest available build. Report it as up-to-date, not a red failure.
    if (isNoRelease(err)) {
      logEvent({ event: "no-release", status: "up-to-date" });
      send("updates:event", { type: "up-to-date", currentVersion: app.getVersion() });
      return;
    }
    const message = classifyError(err);
    logEvent({ event: "error", status: "error", error: String(err?.stack || err), friendly: message });
    send("updates:event", { type: "error", error: message });
  });

  ipcMain.handle("updates:status", () => ({ supported: true, currentVersion: app.getVersion() }));
  ipcMain.handle("updates:check", async () => doCheck(false));
  ipcMain.handle("updates:download", async () => startDownload());
  ipcMain.handle("updates:install", async () => {
    logEvent({ event: "install-requested", status: "installing" });
    setImmediate(() => autoUpdater.quitAndInstall(false, true));
    return { ok: true };
  });
}

// Distinguish "the repo has no published release yet" from real failures.
function isNoRelease(err) {
  const s = String(err?.message || err || "").toLowerCase();
  return (
    s.includes("404") ||
    s.includes("no published versions") ||
    s.includes("latest.yml") ||
    s.includes("cannot find latest") ||
    s.includes("unable to find latest") ||
    s.includes("no release")
  );
}

function classifyError(err) {
  const s = String(err?.message || err || "").toLowerCase();
  if (s.includes("net::") || s.includes("enotfound") || s.includes("getaddrinfo") || s.includes("etimedout") || s.includes("network")) return "No internet connection or the update server is unreachable.";
  if (s.includes("sha512") || s.includes("checksum") || s.includes("hash")) return "The downloaded update failed integrity verification and was discarded. Your app was not changed.";
  if (s.includes("eacces") || s.includes("eperm") || s.includes("permission")) return "Permission denied while applying the update. Try running the app as administrator.";
  if (s.includes("enospc") || s.includes("disk")) return "Not enough disk space to download the update.";
  if (s.includes("404") || s.includes("no published versions") || s.includes("latest.yml")) return "No published release was found in the update repository yet.";
  return "Update failed: " + (err?.message || String(err));
}

async function doCheck(silent) {
  if (!autoUpdater) return { supported: false, currentVersion: app.getVersion() };
  if (checking) return { ok: false, busy: true };
  checking = true;
  logEvent({ event: "check-started", status: "checking", silent });
  try {
    const r = await autoUpdater.checkForUpdates();
    checking = false;
    const info = r?.updateInfo;
    const updateAvailable = info && info.version && info.version !== app.getVersion();
    return {
      supported: true,
      ok: true,
      currentVersion: app.getVersion(),
      updateAvailable: !!updateAvailable,
      version: info?.version,
      changelog: changelogText(info),
      sizeBytes: totalBytes(info),
      forced: isForced(info),
    };
  } catch (err) {
    checking = false;
    // No release published yet → treat as "up to date", not a red error.
    if (isNoRelease(err)) {
      logEvent({ event: "no-release", status: "up-to-date" });
      send("updates:event", { type: "up-to-date", currentVersion: app.getVersion() });
      return { supported: true, ok: true, updateAvailable: false, noRelease: true, currentVersion: app.getVersion() };
    }
    const message = classifyError(err);
    logEvent({ event: "check-failed", status: "error", error: String(err), friendly: message });
    send("updates:event", { type: "error", error: message });
    return { supported: true, ok: false, error: message, currentVersion: app.getVersion() };
  }
}

async function startDownload() {
  if (!autoUpdater) return { ok: false, error: "Updater not available" };
  try {
    logEvent({ event: "download-started", newVersion: availableInfo?.version, status: "downloading" });
    await autoUpdater.downloadUpdate();
    return { ok: true };
  } catch (err) {
    const message = classifyError(err);
    logEvent({ event: "download-failed", status: "error", error: String(err), friendly: message });
    send("updates:event", { type: "error", error: message });
    return { ok: false, error: message };
  }
}

// Silent check shortly after startup (won't interrupt the user unless an update exists).
function checkOnStartup() {
  if (!autoUpdater) return;
  if (!app.isPackaged) { logLine("INFO", "dev mode — skipping startup update check"); return; }
  setTimeout(() => { doCheck(true).catch(() => {}); }, 8000);
}

module.exports = { setup, checkOnStartup };
