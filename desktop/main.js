const { app, BrowserWindow, shell, dialog, Menu, ipcMain } = require("electron");
const os = require("os");
const path = require("path");
const fs = require("fs");
const net = require("net");
const { spawn } = require("child_process");

// Use a clean, branded app-data folder (%APPDATA%\eSign MICO360) instead of the
// package name (@esign-mico360\desktop). Must be set before any getPath call.
app.setName("eSign MICO360");

// Auto-capture uncaught main-process errors to a crash log for later debugging.
function logCrash(kind, err) {
  try {
    const dir = path.join(app.getPath("userData"), "crash-logs");
    fs.mkdirSync(dir, { recursive: true });
    fs.appendFileSync(path.join(dir, "crashes.log"), `[${new Date().toISOString()}] [${kind}] ${String(err?.stack || err)}\n`);
  } catch { /* ignore */ }
}
process.on("uncaughtException", (err) => logCrash("uncaughtException", err));
process.on("unhandledRejection", (err) => logCrash("unhandledRejection", err));

// ── LibreOffice (soffice) detection + one-click install ─────────────────────
// Exact Word/Excel/PowerPoint → PDF conversion uses LibreOffice. If it isn't
// installed, the UI prompts the admin and this opens an elevated PowerShell that
// installs it via winget. The server auto-detects it once present.
function sofficePath() {
  if (process.env.SOFFICE_PATH && fs.existsSync(process.env.SOFFICE_PATH)) return process.env.SOFFICE_PATH;
  const candidates =
    process.platform === "win32"
      ? [
          path.join(process.env["ProgramFiles"] || "C:/Program Files", "LibreOffice/program/soffice.exe"),
          path.join(process.env["ProgramFiles(x86)"] || "C:/Program Files (x86)", "LibreOffice/program/soffice.exe"),
          path.join(process.env["LOCALAPPDATA"] || "", "Programs/LibreOffice/program/soffice.exe"), // per-user winget install
          "C:/Program Files/LibreOffice/program/soffice.exe",
          "C:/Program Files (x86)/LibreOffice/program/soffice.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications/LibreOffice.app/Contents/MacOS/soffice", path.join(os.homedir(), "Applications/LibreOffice.app/Contents/MacOS/soffice")]
        : ["/usr/bin/soffice", "/usr/local/bin/soffice", "/opt/libreoffice/program/soffice", "/snap/bin/libreoffice"];
  for (const c of candidates) if (c && fs.existsSync(c)) return c;
  // Last resort: look soffice up on PATH (covers custom install locations).
  try {
    const { execFileSync } = require("child_process");
    const finder = process.platform === "win32" ? "where" : "which";
    const bin = process.platform === "win32" ? "soffice.exe" : "soffice";
    const found = execFileSync(finder, [bin], { stdio: ["ignore", "pipe", "ignore"], timeout: 4000 }).toString().trim().split(/\r?\n/)[0];
    if (found && fs.existsSync(found)) return found;
  } catch { /* not on PATH */ }
  return null;
}

function installLibreOffice() {
  const downloadUrl = "https://www.libreoffice.org/download/download/";
  // Already installed? Nothing to do (all platforms).
  if (sofficePath()) return { ok: true, alreadyInstalled: true };

  // macOS: one-click via Homebrew cask when Homebrew is present — mirrors the
  // Windows winget flow — opening a Terminal window so the user sees progress.
  // Without Homebrew, fall back to the download page.
  if (process.platform === "darwin") {
    const brew = ["/opt/homebrew/bin/brew", "/usr/local/bin/brew"].find((p) => fs.existsSync(p));
    if (!brew) { shell.openExternal(downloadUrl); return { ok: true, opened: "browser" }; }
    try {
      const sh = [
        "#!/bin/bash",
        "echo 'Installing LibreOffice for eSign MICO360 (exact Word/Excel/PowerPoint conversion)...'",
        "echo",
        `'${brew}' install --cask libreoffice`,
        "echo",
        "echo 'When installation finishes, restart eSign MICO360 and re-upload your document.'",
        "echo 'You can close this window.'",
      ].join("\n");
      const tmp = path.join(os.tmpdir(), "esign-install-libreoffice.command");
      fs.writeFileSync(tmp, sh, "utf8");
      fs.chmodSync(tmp, 0o755);
      // `open` a .command file launches it in Terminal and runs it.
      const child = spawn("open", [tmp], { detached: true, stdio: "ignore" });
      child.on("error", (e) => logCrash("office-install", e));
      child.unref();
      return { ok: true };
    } catch (e) {
      logCrash("office-install", e);
      shell.openExternal(downloadUrl);
      return { ok: false, opened: "browser", error: String(e && e.message ? e.message : e) };
    }
  }

  // Linux and other: open the download page.
  if (process.platform !== "win32") {
    shell.openExternal(downloadUrl);
    return { ok: true, opened: "browser" };
  }

  // Use the absolute path to powershell.exe — the packaged app may not have it
  // on PATH, which would make a bare spawn("powershell.exe") fail silently.
  const psExe = path.join(process.env.SystemRoot || "C:\\Windows", "System32", "WindowsPowerShell", "v1.0", "powershell.exe");
  if (!fs.existsSync(psExe)) {
    shell.openExternal(downloadUrl);
    return { ok: false, opened: "browser", error: "PowerShell not found." };
  }

  const ps = [
    "$ErrorActionPreference='Continue'",
    "Write-Host 'Installing LibreOffice for eSign MICO360 (exact Word/Excel/PowerPoint conversion)...' -ForegroundColor Cyan",
    "Write-Host ''",
    "if (Get-Command winget -ErrorAction SilentlyContinue) {",
    "  winget install -e --id TheDocumentFoundation.LibreOffice --accept-source-agreements --accept-package-agreements",
    "} else {",
    "  Write-Host 'winget was not found. Opening the LibreOffice download page instead...' -ForegroundColor Yellow",
    "  Start-Process '" + downloadUrl + "'",
    "}",
    "Write-Host ''",
    "Write-Host 'When installation finishes, restart eSign MICO360 and re-upload your document.' -ForegroundColor Green",
    "Write-Host 'You can close this window.' -ForegroundColor DarkGray",
  ].join("\r\n");
  const tmp = path.join(os.tmpdir(), "esign-install-libreoffice.ps1");
  try {
    fs.writeFileSync(tmp, ps, "utf8");
    // A brief hidden launcher opens a VISIBLE elevated PowerShell (UAC) that runs
    // the install script. Start-Process -Verb RunAs shows the elevated window.
    const inner = `Start-Process -FilePath '${psExe}' -Verb RunAs -ArgumentList @('-NoExit','-NoProfile','-ExecutionPolicy','Bypass','-File','${tmp.replace(/'/g, "''")}')`;
    const child = spawn(psExe, ["-NoProfile", "-ExecutionPolicy", "Bypass", "-WindowStyle", "Hidden", "-Command", inner], { detached: true, stdio: "ignore", windowsHide: true });
    child.on("error", (e) => logCrash("office-install", e));
    child.unref();
    return { ok: true };
  } catch (e) {
    logCrash("office-install", e);
    shell.openExternal(downloadUrl);
    return { ok: false, opened: "browser", error: String(e && e.message ? e.message : e) };
  }
}

ipcMain.handle("office:status", () => ({ supported: true, available: !!sofficePath(), platform: process.platform }));
ipcMain.handle("office:install", () => installLibreOffice());

// ── Paths (work both in dev and packaged) ───────────────────────────
const VENDOR = path.join(__dirname, "vendor");
// extraResources land in process.resourcesPath when packaged; in dev they're in vendor/
const res = (name) => (app.isPackaged ? path.join(process.resourcesPath, name) : path.join(VENDOR, name));

// The Prisma client + engine ship as extraResources (raw, outside the asar).
// "runtime" acts as a node_modules root: make bare `require('@prisma/client')`
// (and its internal `require('.prisma/client')`) resolve there via NODE_PATH.
const runtimeDir = res("runtime");
const Module = require("module");
process.env.NODE_PATH = runtimeDir + path.delimiter + (process.env.NODE_PATH || "");
Module._initPaths();

// Point Prisma at the native query engine binary explicitly.
const prismaClientDir = path.join(runtimeDir, ".prisma", "client");
if (fs.existsSync(prismaClientDir)) {
  const engine = findEngine(prismaClientDir);
  if (engine) process.env.PRISMA_QUERY_ENGINE_LIBRARY = engine;
}

// Pick the Prisma query engine matching THIS machine's platform + arch. A
// universal macOS build ships both darwin (Intel) and darwin-arm64 engines, so
// we must select the correct one rather than the first file found.
function findEngine(dir) {
  try {
    const files = fs.readdirSync(dir).filter((n) => /query_engine/i.test(n) && /\.node$/i.test(n));
    if (!files.length) return undefined;
    let match;
    if (process.platform === "darwin") {
      match = process.arch === "arm64"
        ? files.find((f) => f.includes("darwin-arm64"))
        : files.find((f) => f.includes("darwin") && !f.includes("arm64"));
    } else if (process.platform === "win32") {
      match = files.find((f) => f.includes("windows"));
    } else {
      match = files.find((f) => !f.includes("darwin") && !f.includes("windows"));
    }
    return path.join(dir, match || files[0]);
  } catch {
    return undefined;
  }
}

function freePort(start) {
  return new Promise((resolve) => {
    const srv = net.createServer();
    srv.once("error", () => resolve(freePort(start + 1)));
    srv.listen(start, "127.0.0.1", () => {
      const p = srv.address().port;
      srv.close(() => resolve(p));
    });
  });
}

let mainWindow;

// Render arbitrary HTML to a PDF Buffer using an offscreen window. Used by the
// embedded server to convert Word documents without LibreOffice.
async function htmlToPdf(html) {
  const tmp = path.join(os.tmpdir(), `esign-conv-${Date.now()}-${Math.random().toString(36).slice(2)}.html`);
  fs.writeFileSync(tmp, html, "utf8");
  const win = new BrowserWindow({
    show: false,
    webPreferences: { offscreen: true, sandbox: true, javascript: false },
  });
  try {
    await win.loadFile(tmp);
    const data = await win.webContents.printToPDF({ printBackground: true });
    return data; // Buffer
  } finally {
    try { win.destroy(); } catch {}
    try { fs.unlinkSync(tmp); } catch {}
  }
}

async function start() {
  const userData = app.getPath("userData");
  const port = await freePort(4555);

  // Persist a JWT secret per install.
  const secretFile = path.join(userData, ".jwtsecret");
  let jwtSecret;
  try {
    jwtSecret = fs.readFileSync(secretFile, "utf8");
  } catch {
    jwtSecret = require("crypto").randomBytes(32).toString("hex");
    fs.mkdirSync(userData, { recursive: true });
    fs.writeFileSync(secretFile, jwtSecret);
  }

  // Let the embedded server use LibreOffice for exact Office→PDF conversion.
  const so = sofficePath();
  if (so) process.env.SOFFICE_PATH = so;

  const { startEmbedded } = require(path.join(VENDOR, "server.js"));
  await startEmbedded({
    dbFile: path.join(userData, "esign_mico360.db"),
    storageDir: path.join(userData, "storage"),
    webDist: res("web"),
    migrationsDir: res("migrations"),
    stampImagePath: res("stamp.png"),
    port,
    jwtSecret,
    htmlToPdf, // enables Word→PDF conversion without LibreOffice
  });

  mainWindow = new BrowserWindow({
    width: 1280,
    height: 820,
    minWidth: 960,
    minHeight: 640,
    title: "eSign MICO360",
    backgroundColor: "#1e1f1e",
    webPreferences: { preload: path.join(__dirname, "preload.js"), contextIsolation: true },
  });

  // Open external links in the system browser, not inside the app.
  mainWindow.webContents.setWindowOpenHandler(({ url }) => {
    shell.openExternal(url);
    return { action: "deny" };
  });

  await mainWindow.loadURL(`http://127.0.0.1:${port}/`);
  if (!app.isPackaged) mainWindow.webContents.openDevTools({ mode: "detach" });

  // Wire the auto-updater to this window and run a silent startup check.
  // The updater is bundled (electron-updater inlined) into vendor/updater.js.
  try {
    const updater = require(path.join(VENDOR, "updater.js"));
    updater.setup(mainWindow);
    updater.checkOnStartup();
  } catch (err) {
    dialog.showErrorBox && console.error("Updater init failed:", err);
  }
}

// macOS expects a real application menu — without it Cmd+Q, Cmd+C/V/X, Cmd+M
// and Select-All stop working. Windows/Linux drive everything from the in-app
// UI, so they keep no native menu.
function applyMenu() {
  if (process.platform !== "darwin") { Menu.setApplicationMenu(null); return; }
  const template = [
    { role: "appMenu" },
    { role: "editMenu" },
    { label: "View", submenu: [{ role: "resetZoom" }, { role: "zoomIn" }, { role: "zoomOut" }, { type: "separator" }, { role: "togglefullscreen" }] },
    { role: "windowMenu" },
  ];
  Menu.setApplicationMenu(Menu.buildFromTemplate(template));
}

app.whenReady().then(() => {
  applyMenu();
  start().catch((err) => {
    dialog.showErrorBox("eSign MICO360 — startup error", String(err?.stack || err));
    app.quit();
  });

  app.on("activate", () => {
    if (BrowserWindow.getAllWindows().length === 0) start();
  });
});

app.on("window-all-closed", () => {
  if (process.platform !== "darwin") app.quit();
});
