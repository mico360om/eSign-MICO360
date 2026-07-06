// Vendors everything the desktop app needs into ./vendor:
//   - server.js     : the API+UI server bundled into one CJS file (Prisma external)
//   - node_modules/ : just the Prisma client + engine (can't be bundled)
//   - web/          : the built web SPA
//   - migration.sql : schema for first-run DB creation
//   - stamp.png     : demo company stamp
// Run before `electron .` (dev) and before electron-builder (dist).
const fs = require("fs");
const path = require("path");
const { execFileSync } = require("child_process");

const ROOT = path.resolve(__dirname, "..");
const VENDOR = path.join(__dirname, "vendor");
const exists = (p) => fs.existsSync(p);
// Resilient recursive delete — retries transient EBUSY/EPERM locks (e.g. from
// Dropbox/antivirus syncing the freshly-written vendor files on Windows).
function rm(p) {
  for (let i = 0; i < 10; i++) {
    try { fs.rmSync(p, { recursive: true, force: true, maxRetries: 5, retryDelay: 300 }); return; }
    catch (e) { if (i === 9) throw e; const until = Date.now() + 800; while (Date.now() < until) {} }
  }
}

function ensureBuilt(rel, hint) {
  if (!exists(path.join(ROOT, rel))) {
    console.error(`\n[prepare] Missing ${rel}. Run: ${hint}\n`);
    process.exit(1);
  }
}

console.log("[prepare] cleaning vendor/");
rm(VENDOR);
fs.mkdirSync(VENDOR, { recursive: true });

// 1) Ensure web is built (server is bundled from TS source below)
ensureBuilt("web/dist/index.html", "npm run -w web build");

// 2) Bundle the server from TS source (Prisma stays external — native engine
//    can't be bundled; @signpdf/node-forge ARE bundled so ESM dynamic imports
//    resolve inside the packaged app without node_modules).
console.log("[prepare] bundling server with esbuild");
const esbuild = require(path.join(ROOT, "node_modules", "esbuild"));
esbuild.buildSync({
  entryPoints: [path.join(ROOT, "server/src/bootstrap.ts")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: path.join(VENDOR, "server.js"),
  external: ["@prisma/client", ".prisma/client", "prisma"],
  logLevel: "warning",
});

// 2b) Bundle the auto-updater (electron-updater + deps inlined; electron stays
//     external since it's provided by the runtime). Mirrors the server bundle so
//     no node_modules need to ship inside the asar.
console.log("[prepare] bundling updater with esbuild");
esbuild.buildSync({
  entryPoints: [path.join(__dirname, "updater.js")],
  bundle: true,
  platform: "node",
  format: "cjs",
  target: "node18",
  outfile: path.join(VENDOR, "updater.js"),
  external: ["electron"],
  logLevel: "warning",
});

// 3) Vendor the Prisma client + generated engine into vendor/runtime.
//    This folder acts as a node_modules root resolved at runtime via NODE_PATH.
//    It is shipped as extraResources (raw copy, OUTSIDE the asar) so the native
//    query engine is a real file on disk and electron-builder's node_modules
//    pruning can't drop it.
console.log("[prepare] copying Prisma client + engine -> vendor/runtime");
const runtime = path.join(VENDOR, "runtime");
fs.mkdirSync(runtime, { recursive: true });
for (const dep of ["@prisma/client", ".prisma"]) {
  const src = path.join(ROOT, "node_modules", dep);
  if (!exists(src)) {
    console.error(`[prepare] Missing node_modules/${dep}. Run: npm run -w server db:setup`);
    process.exit(1);
  }
  fs.cpSync(src, path.join(runtime, dep), { recursive: true });
}

// The schema may generate engines for multiple targets. Keep only the Windows
// engine so the installer doesn't ship engines for other platforms.
try {
  const clientDir = path.join(runtime, ".prisma", "client");
  const keepToken = process.platform === "win32" ? "windows" : null;
  if (keepToken && exists(clientDir)) {
    for (const f of fs.readdirSync(clientDir)) {
      const isEngine = /query_engine/i.test(f) && /\.node$/i.test(f);
      if (isEngine && !f.includes(keepToken)) {
        fs.rmSync(path.join(clientDir, f), { force: true });
        console.log(`[prepare] pruned non-${keepToken} engine ${f}`);
      }
    }
  }
} catch (e) {
  console.warn("[prepare] engine prune skipped:", e.message);
}

// 4) Web SPA, ALL migrations, demo stamp
console.log("[prepare] copying web build, migrations, assets");
fs.cpSync(path.join(ROOT, "web/dist"), path.join(VENDOR, "web"), { recursive: true });

// Copy the whole migrations directory (the embedded runner applies all in order).
fs.cpSync(path.join(ROOT, "server/prisma/migrations"), path.join(VENDOR, "migrations"), { recursive: true });

fs.copyFileSync(path.join(ROOT, "shared/assets/logo.png"), path.join(VENDOR, "stamp.png"));

console.log("[prepare] vendor ready ✓");
