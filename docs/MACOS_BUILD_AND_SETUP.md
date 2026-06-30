# eSign MICO360 — macOS Edition: Build & Setup Guide

The macOS app is **the same Electron application** as Windows, built from this one
repository with a macOS electron-builder target. The Windows build is unchanged —
`npm run dist` still produces the `.exe`; the new `npm run dist:mac` produces the
`.dmg` / `.zip`. No source code is forked or duplicated; both platforms share
100% of the screens, workflows, validations, reports, roles, permissions,
settings, database logic and business rules.

> ⚠️ **A macOS `.dmg` can only be produced on a Mac** (electron-builder must run on
> macOS to package and code-sign a Mac app). It cannot be cross-compiled from
> Windows. Run the commands below on a macOS machine (or macOS CI runner).

---

## 1. Prerequisites (on the Mac)

- macOS 11 (Big Sur) or later — Apple Silicon (arm64) or Intel (x64)
- [Node.js 18 LTS or newer](https://nodejs.org) and npm
- Xcode Command Line Tools: `xcode-select --install`
- (Optional, for true Office→PDF conversion) [LibreOffice](https://www.libreoffice.org/download/download/)
- (Optional, for notarized distribution) an Apple Developer ID certificate

---

## 2. macOS Terminal — install & build (copy/paste)

```bash
# 1) Get the code
git clone https://github.com/mico360om/eSign-MICO360.git
cd eSign-MICO360

# 2) Install all workspace dependencies
npm install

# 3) Generate the Prisma client + database engine for macOS
npm run -w server db:setup

# 4) Build the web UI (shared by both platforms)
npm run -w web build

# 5) Build the macOS desktop app (.dmg + .zip) — outputs to desktop/release/
npm run -w desktop dist:mac
```

The signed/zipped artifacts appear in `desktop/release/`:

```
eSign MICO360-1.0.0-arm64.dmg     # Apple Silicon installer
eSign MICO360-1.0.0-x64.dmg       # Intel installer (if built on/for x64)
eSign MICO360-1.0.0-arm64.zip     # used by the auto-updater
latest-mac.yml                    # auto-update manifest
```

### One-liner

```bash
git clone https://github.com/mico360om/eSign-MICO360.git && cd eSign-MICO360 && npm install && npm run -w server db:setup && npm run -w web build && npm run -w desktop dist:mac
```

### Build for a specific architecture

```bash
npm run -w desktop dist:mac -- --arm64      # Apple Silicon only
npm run -w desktop dist:mac -- --x64        # Intel only
npm run -w desktop dist:mac -- --universal  # universal binary
```

---

## 3. Installing the app (end user)

1. Open the `.dmg` and drag **eSign MICO360** into **Applications**.
2. First launch: right-click the app → **Open** (to bypass Gatekeeper for an
   unsigned/un-notarized build), then confirm. Signed+notarized builds open
   normally.
3. The app runs fully offline — it starts its own embedded API and a local
   SQLite database under `~/Library/Application Support/eSign MICO360/`.

Default admin login (from the seed): `admin@mico360.com` / `Admin@123`
(change immediately in production).

---

## 4. Code signing & notarization (production distribution)

Unsigned builds work for internal use but show a Gatekeeper warning. For public
distribution, sign and notarize:

```bash
export CSC_LINK="/path/to/DeveloperID.p12"
export CSC_KEY_PASSWORD="your-cert-password"
export APPLE_ID="you@apple.com"
export APPLE_APP_SPECIFIC_PASSWORD="xxxx-xxxx-xxxx-xxxx"
export APPLE_TEAM_ID="YOURTEAMID"
npm run -w desktop dist:mac
```

Then set `"hardenedRuntime": true` in `desktop/package.json` → `build.mac`
and add an `entitlements` plist. (Left off by default so unsigned internal
builds run without extra setup.)

---

## 5. Data location & safety

| | Windows | macOS |
|---|---|---|
| Database | `%APPDATA%\eSign MICO360\esign_mico360.db` | `~/Library/Application Support/eSign MICO360/esign_mico360.db` |
| Uploaded files | `…\eSign MICO360\storage\` | `…/eSign MICO360/storage/` |
| JWT secret | `…\eSign MICO360\.jwtsecret` | `…/eSign MICO360/.jwtsecret` |
| Update logs | `…\eSign MICO360\update-logs\updates.log` | `…/eSign MICO360/update-logs/updates.log` |

Updates never touch these folders, so all users, settings, profiles, records
and documents survive every update.

---

## 6. Office→PDF on macOS

As on Windows, DOC/DOCX/XLS/XLSX/PPT/PPTX get full-fidelity PDF conversion only
when LibreOffice is installed. The app auto-detects
`/Applications/LibreOffice.app/Contents/MacOS/soffice`, or set `SOFFICE_PATH`.
Without it, an honest cover-page PDF is generated and the original remains
downloadable. PDF/PNG/JPG/JPEG/TXT always convert natively.
