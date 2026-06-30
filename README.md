# eSign MICO360

**Digital Document Signature & Approval Management System**

eSign MICO360 lets users upload documents, convert them to PDF, route them for
approval, apply digital signatures and company stamps, track status, and download
the final signed PDF — across **Web**, **Windows Desktop**, and **Android**.

> Brand palette (from the official logo): maroon `#8A1A1C`, near-black `#1E1F1E`, white `#FFFFFF`.

---

## Architecture

```
                         ┌─────────────────────────┐
   Web Admin Portal ────▶│                         │
   (React + Vite)        │   Backend API (Node)    │──── PostgreSQL
                         │   Express + TypeScript  │
   Windows Desktop ─────▶│   Prisma + JWT + RBAC   │──── File storage
   (Electron)            │   PDF engine (pdf-lib)  │     (originals / PDFs /
                         │                         │      signed PDFs)
   Android Mobile ──────▶│                         │
   (React Native)        └─────────────────────────┘
```

All three clients share **one** backend. Build order: **backend → web → desktop → mobile**.

## Repository layout

| Folder      | What it is                              | Output        |
|-------------|-----------------------------------------|---------------|
| `server/`   | REST API, DB, auth, workflow, PDF engine | runs on :4000 |
| `web/`      | Web Admin Portal                        | static site   |
| `desktop/`  | Windows desktop app                     | `.exe` installer |
| `mobile/`   | Android app                             | `.apk`        |
| `shared/`   | Brand tokens + logo assets              | —             |

## Quick start (backend + web)

### 1. Database
With Docker:
```bash
docker compose up -d        # PostgreSQL on localhost:5432
```
Or install PostgreSQL 16 natively and create a database `esign_mico360`.

### 2. Backend
```bash
cd server
cp .env.example .env        # adjust DATABASE_URL / JWT_SECRET if needed
npm install
npm run db:setup            # prisma generate + migrate
npm run seed                # demo users, roles, profiles
npm run dev                 # http://localhost:4000
```

### 3. Web Admin Portal
```bash
cd web
npm install
npm run dev                 # http://localhost:5173
```

### Demo accounts (after seeding)
| Role        | Email                     | Password   |
|-------------|---------------------------|------------|
| Admin       | admin@mico360.com         | Admin@123  |
| Approver    | approver@mico360.com      | User@123   |
| Requester   | requester@mico360.com     | User@123   |

## Core rule
The **original uploaded document is never modified**. The system creates a
separate converted PDF, and all signatures/stamps are applied only to a
generated copy that becomes the **final signed PDF**. Originals, converted PDFs,
and signed PDFs are stored as distinct artifacts with a full audit trail.

## Build status
- [x] Monorepo + shared brand theme
- [x] Backend API — verified (19/19 e2e tests: `npm run -w server smoke`)
- [x] Web Admin Portal — builds & runs
- [x] Windows Desktop (.exe) — **self-contained installer built & launch-verified** → `desktop/release/eSign MICO360 Setup 1.0.0.exe`
- [ ] Android Mobile (.apk) — app code + build config (needs Android SDK to produce the .apk)

See each subfolder's README for platform-specific build instructions.
