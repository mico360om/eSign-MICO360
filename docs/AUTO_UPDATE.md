# eSign MICO360 — Auto-Update Guide

The desktop app updates itself from **GitHub Releases** of
`mico360om/eSign-MICO360` using `electron-updater`.

## How it works
- **On startup** (packaged builds only) the app silently checks for a newer release ~8s after launch.
- **Manually** via **Help & Legal → About Us → Software Updates → Check for Updates**.
- The panel shows **current version, new version, changelog and download size**.
- Download shows a **progress bar**. electron-updater **verifies the package SHA-512**
  (from `latest.yml` / `latest-mac.yml`) before it is ever applied.
- The update installs **on restart** (`Restart & Install`). User data, settings,
  profiles, the SQLite database and all records are untouched.
- **Safety / rollback:** the running app is only replaced *after* a fully downloaded,
  hash-verified package — a corrupt or interrupted download is rejected and the
  installed version keeps running.
- **Error handling:** no-internet, failed download, corrupted file, permission and
  low-disk conditions are caught and shown as plain-language messages.
- **Logs:** every check/download/install (old version, new version, timestamp,
  status, error detail) is appended to
  `…/eSign MICO360/update-logs/updates.log`.
- **Optional vs forced:** add the token `[forced]` anywhere in a GitHub release's
  notes to make that update mandatory (auto-downloads and is marked *Required*).

## Publishing an update (maintainer)
1. Bump `version` in `desktop/package.json` (e.g. `1.0.1`).
2. Build the installers:
   - Windows: `npm run -w desktop dist`
   - macOS: `npm run -w desktop dist:mac`
3. Create a **GitHub Release** tagged `v1.0.1` and upload the artifacts from
   `desktop/release/` — **including** the generated `latest.yml` (Windows) and
   `latest-mac.yml` (macOS) and the `.blockmap` files. These manifests are what
   the updater reads.
4. To publish directly from electron-builder instead, set a `GH_TOKEN` env var
   with `repo` scope and run the dist command with `--publish always`.

> The repo is public, so **clients need no token** to check or download updates.
> A token is only needed by the maintainer to *publish* releases.

## Testing the full flow (Windows)
1. Install `eSign MICO360 Setup 1.0.0.exe`.
2. Publish a `v1.0.1` release as above.
3. Launch the installed 1.0.0 app → it should detect 1.0.1 (startup or manual check),
   show the changelog/size, download with progress, verify, and install on restart.
4. Confirm your existing documents/users/settings are intact after the update, and
   review `update-logs/updates.log`.
