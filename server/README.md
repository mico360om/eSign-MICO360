# eSign MICO360 — Backend API

Node.js + Express + TypeScript + Prisma + PostgreSQL. This API powers all three
clients (web, desktop, mobile).

## Run it

You need a PostgreSQL 16 database. Pick one:

**A) Docker (easiest)** — from the repo root:
```bash
docker compose up -d
```

**B) Native PostgreSQL** — install PostgreSQL 16, create a database, and set
`DATABASE_URL` in `.env` accordingly, e.g.
`postgresql://USER:PASS@localhost:5432/esign_mico360?schema=public`.

Then:
```bash
cd server
cp .env.example .env          # already done if .env exists; edit secrets
npm install
npm run db:setup              # prisma generate + create tables (migrate)
npm run seed                  # demo roles / users / profile / group / stamp
npm run dev                   # http://localhost:4000/api/health
```

Production:
```bash
npm run build && npm start
```

## Demo accounts (after `npm run seed`)
| Role          | Email                   | Password  |
|---------------|-------------------------|-----------|
| Administrator | admin@mico360.com       | Admin@123 |
| Approver      | approver@mico360.com    | User@123  |
| Approver      | manager@mico360.com     | User@123  |
| Requester     | requester@mico360.com   | User@123  |

## API surface

All routes are under `/api`. Send `Authorization: Bearer <token>` (from `/auth/login`).

| Area | Routes |
|------|--------|
| Auth | `POST /auth/login`, `GET /auth/me`, `POST /auth/change-password` |
| Users | `GET/POST /users`, `GET/PATCH /users/:id`, `POST /users/:id/activate`, `POST /users/:id/reset-password`, `PUT /users/:id/profiles`, `GET /users/:id/activity` |
| Profiles | `GET/POST /profiles`, `GET/PATCH /profiles/:id`, `PUT /profiles/:id/members` |
| Roles | `GET /roles`, `GET /roles/permissions`, `POST/PATCH/DELETE /roles[/:id]` |
| Signature groups | `GET/POST /signature-groups`, `PATCH/DELETE /signature-groups/:id` |
| Stamps | `GET/POST /stamps`, `PATCH/DELETE /stamps/:id`, `GET /stamps/:id/usages` |
| Documents | `POST /documents/upload`, `POST /documents/:id/submit`, `POST /documents/:id/decision`, `POST /documents/:id/placements`, `GET /documents`, `GET /documents/pending`, `GET /documents/:id`, `GET /documents/:id/history`, `GET /documents/:id/view/:kind`, `GET /documents/:id/download/:kind`, `POST /documents/me/signature` |
| Notifications | `GET /notifications`, `POST /notifications/:id/read`, `POST /notifications/read-all` |
| Dashboard | `GET /dashboard` |
| Reports | `GET /reports/admin`, `GET /reports/me` |
| Settings | `GET /settings`, `PUT /settings` |
| Lookups | `GET /lookups/profiles/:id/{signatories,groups,stamps}` |

## Workflow & rules enforced server-side
- **Original never modified.** Upload stores the untouched file in `storage/originals/`;
  a PDF copy is generated in `storage/converted/`; signatures/stamps are applied to a
  fresh copy saved in `storage/final/`.
- **Profile access** — users only act within profiles they belong to.
- **Signatory selection** — requester & signatory must share a profile.
- **Signature group** — must be linked to the document's profile.
- **Stamp usage** — requires the `USE_STAMP` permission; every use is logged.
- **Sequential vs parallel** approval, with status auto-recomputed and the final
  PDF generated on full approval.
- Full **audit log** + per-document **event history**.

## Office → PDF conversion
PDFs, images, and `.txt` convert natively. For `.doc/.docx/.xls/.pptx`, the server
shells out to LibreOffice (`soffice`) if installed; otherwise it produces a cover
PDF and keeps the untouched original available. Install LibreOffice on the server
for full-fidelity Office conversion.
