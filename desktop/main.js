const { app, BrowserWindow, shell, dialog, Menu } = require("electron");
const path = require("path");
const fs = require("fs");
const net = require("net");

// Use a clean, branded app-data folder (%APPDATA%\eSign MICO360) instead of the
// package name (@esign-mico360\desktop). Must be set before any getPath call.
app.setName("eSign MICO360");

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

function findEngine(dir) {
  try {
    const f = fs.readdirSync(dir).find((n) => n.startsWith("query_engine") && (n.endsWith(".node") || n.endsWith(".dll.node") || n.endsWith(".so.node") || n.endsWith(".dylib.node")));
    return f ? path.join(dir, f) : undefined;
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

  const { startEmbedded } = require(path.join(VENDOR, "server.js"));
  await startEmbedded({
    dbFile: path.join(userData, "esign_mico360.db"),
    storageDir: path.join(userData, "storage"),
    webDist: res("web"),
    migrationsDir: res("migrations"),
    stampImagePath: res("stamp.png"),
    port,
    jwtSecret,
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

app.whenReady().then(() => {
  Menu.setApplicationMenu(null);
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
