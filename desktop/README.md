# eSign MICO360 — Windows Desktop App

A **self-contained** Windows application: the Electron app embeds the API server
and a SQLite database and serves the UI, so the installed `.exe` runs with
**nothing else to install** — no separate server, no PostgreSQL.

On first launch it creates its database and demo data under the user's app-data
folder (`%APPDATA%\eSign MICO360`). Originals, converted PDFs, and final signed
PDFs are stored there too.

## Build the installer (.exe)

From the repo root, the server and web must be built first (the desktop vendors them):
```bash
npm run -w server build
npm run -w web build
npm install -w desktop
npm run -w desktop dist
```
Output: `desktop/release/eSign MICO360 Setup <version>.exe` (NSIS installer).

- `npm run -w desktop pack` — faster unpacked build (no installer) in `desktop/release/win-unpacked/` for quick testing.
- `npm run -w desktop dev` — run the app from source (vendors + launches Electron).

### How packaging works
`prepare.js` vendors everything into `desktop/vendor/`:
- `server.js` — the API+UI server bundled into one file with esbuild (Prisma kept external)
- `node_modules/.prisma` + `@prisma/client` — the Prisma client & native query engine
- `web/` — the built web SPA (served by the embedded server)
- `migration.sql` — replayed on first run to create the SQLite schema
- `stamp.png` — demo company stamp

electron-builder unpacks the Prisma engine from the asar (`asarUnpack`) so the
native binary is loadable at runtime; `main.js` points
`PRISMA_QUERY_ENGINE_LIBRARY` at it.

## Using the app
Sign in with a seeded account (e.g. `admin@mico360.com` / `Admin@123`). The
desktop app exposes the same screens as the web portal: select assigned profiles,
upload documents (auto-converted to PDF), create signature requests, preview the
PDF, approve/reject, place signatures & company stamps, track status, and download
the original / converted / final signed PDFs.

## Notes
- The installer uses the default Electron icon; drop a branded `build/icon.ico`
  and set `win.icon` in `package.json` to brand it.
- For a shared multi-user deployment instead of standalone, point the desktop
  app at a central server by loading its URL rather than the embedded one.
