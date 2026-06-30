# eSign MICO360 — Web Admin Portal

React + Vite + TypeScript. Brand-themed admin portal for the full system.

## Run
```bash
# 1) backend must be running first (see ../server/README.md) on port 4400
cd web
npm install
npm run dev          # http://localhost:5173  (proxies /api -> :4400)
```
Production build: `npm run build` → static files in `web/dist/` (serve behind any
web server; set `VITE_API_BASE` to the API URL at build time if not same-origin).

## Sign in
Use a seeded account, e.g. `admin@mico360.com` / `Admin@123`.

## Screens
- **Dashboard** — totals (users, profiles, documents, pending/completed/rejected), recent docs & activity
- **Documents** — list + status filter, upload (auto-converts to PDF), detail view with embedded PDF preview, submit-for-approval (pick signatories or a signature group, sequential/parallel), approve/reject with comments, place company stamp, download original/converted/final, history & audit trail
- **Users** — add/edit, activate/deactivate, assign role, assign profiles, reset password
- **Profiles** — create, activate, manage members
- **Roles & Permissions** — create/edit roles with a permission checklist
- **Signature Groups** — create groups linked to a profile, ordered signatories, sequential/parallel
- **Company Stamps** — upload/remove stamp images, scope to a profile
- **Reports** — my activity + admin reports (by status, by profile, stamp usage, top uploaders, avg approval time)
- **Settings** — password policy, upload rules, conversion & workflow defaults, notifications
- **Notifications** — in-app notifications with mark-as-read

The portal shows only the nav items the signed-in role has permission for.

## Theme
Brand colors live in `src/theme.css` (`--primary: #8a1a1c`, `--ink: #1e1f1e`),
sampled from the official logo. Logos are in `public/`.
