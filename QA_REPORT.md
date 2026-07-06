# eSign MICO360 — QA/QC Report

_Automated + manual QA pass across Backend, Web Admin Portal, Windows Desktop, and Android._

## Summary

| Area | Result |
|------|--------|
| Backend automated QA suite | ✅ **58 / 58 passing** (`npm run -w server qa`) |
| Security & integrity suite | ✅ **16 / 16 passing** (`npm run -w server qa:security`) |
| Feature suite (notify/delegation/templates/versioning) | ✅ **16 / 16 passing** (`npm run -w server qa:features`) |
| Saved-marks + edit/re-approve suite | ✅ **15 / 15 passing** (`npm run -w server qa:marks`) |
| Approval-types suite | ✅ **10 / 10 passing** (`npm run -w server qa:types`) |
| Backend smoke (workflow) | ✅ 19 / 19 (`npm run -w server smoke`) |
| **Total automated checks** | ✅ **134 passing** |

### Approval types (latest)
- **Approval types** are a named catalog (Approved / Reviewed / Verified / Witnessed, admin-managed at **Approval Types** → `/api/approval-types`).
- **Each approver** tags their preconfigured signatures to a type (saved mark `approvalTypeId`).
- **At request time** the requester picks, per signatory, **which kind of approval** they want (`signatoryTypes` map → `ApprovalStep.approvalType`); it shows as a badge on the workflow.
- When that signatory opens the Apply dialog, it shows the **requested type** and **auto-selects** their matching saved signature.

### Approver saved marks + edit/re-approve (latest)
- **Preconfigured images + settings** — approvers keep a library of signature/initials images (`SavedMark`), each with a default position + size. The Apply modal shows a gallery to pick from (or add a new one via the draw-pad/upload); selecting a mark applies its saved placement settings. `GET/POST/PATCH/DELETE /api/account/marks` (+ `/image`); placement accepts `savedMarkId`.
- **Edit & re-approve** — after approving, the approver can reopen their step (`POST /api/documents/:id/reopen`), remove/re-place their signature/stamp, and re-approve; if the document had completed, its final signed PDF is cleared and regenerated. Guarded so only the signatory who approved can reopen.
| Web portal — typecheck & build | ✅ clean |
| Web portal — responsiveness | ✅ verified at 1366, 1920, 768, 375 — **no horizontal overflow** at any width |
| Web portal — search/filter/sort/pagination | ✅ on all list pages |
| Windows Desktop `.exe` | ✅ self-contained installer, launch-verified |
| Android `.apk` | ✅ builds (`app-debug.apk`) |

## Defects found & fixed during QA
1. **Invalid/expired JWT returned HTTP 500 instead of 401.** A malformed or expired token threw an unhandled `jwt` error. Fixed in `server/src/middleware/auth.ts` — now returns 401. _(Caught by the QA suite.)_
2. **Failed logins were not audited.** The spec requires failed-login in the audit trail; only successful logins were recorded. Added `FAILED_LOGIN` audit entries (wrong password + inactive account) in `server/src/routes/auth.ts`.
3. **No audit-log viewer.** Added `GET /api/audit` (search + action/actor/date filters) and an **Audit Log** page in the web portal.
4. **List pages lacked search/filter/pagination/sort.** Added a reusable `DataTable` (toolbar search, filter dropdowns, sortable headers, pagination, refresh, loading/empty/error states) and applied it to Users, Documents, Profiles, Roles, Signature Groups (plus search/filter on Stamps & Notifications).
5. **Web layout not responsive.** Fixed-width sidebar overflowed on tablet/phone. Added a collapsible drawer (hamburger + backdrop), scrollable table containers, responsive two-column grids, and long-text truncation/wrap so names/emails/comments never break the layout.
6. **Mobile PDF viewing.** Added `?token=` support to the PDF view/download endpoints so the Android app can open PDFs in the device viewer (an `<img>`/external intent can't send an auth header).

## What the automated QA suite covers (58 checks)
- **Auth & security:** valid login, wrong password → 401, no token → 401, garbage/expired token → 401.
- **RBAC matrix:** requester blocked from users/profiles/roles/signature-groups/dashboard/audit (403) and settings writes; admin allowed.
- **User management:** create, edit, deactivate (and blocked login while inactive), reactivate, reset password (+ login with new password), search by name, activity history.
- **Validation:** invalid email (400), missing password (400), duplicate email (409).
- **Profile access rules:** signatory must share the requester's profile (403 otherwise); signature group must belong to the document's profile (403 otherwise).
- **Document workflow & statuses:** upload → auto **PDF conversion**, unsupported file type rejected, submit-without-signatory rejected, **sequential** order enforcement, **parallel** approval, approve/reject, cancel, and the full status path through **PENDING_APPROVAL → PARTIALLY_APPROVED → COMPLETED** and **REJECTED**.
- **Original-document protection:** original preserved byte-for-byte; signatures/stamps applied only to the generated copy; final signed PDF downloads with a valid `%PDF` header.
- **Permissions on signing/stamping:** stamp placement requires `USE_STAMP` (403 otherwise).
- **Audit trail:** failed logins + all key actions (upload, submit, approve, reject, create-user, …) recorded; audit list + filters.
- **Reports & dashboard:** admin report shape + counters; per-user report.
- **Notifications:** request, approval, rejection, and completion notifications; mark-as-read.
- **Integration:** an action by one client (signatory) is immediately visible to another (admin) — single shared backend.

## Responsiveness verification (live DOM inspection)
| Width | Result |
|-------|--------|
| 1920×1080 | sidebar visible, hamburger hidden, 0 overflow |
| 1366×768 | dashboard + audit render, 0 overflow |
| 768 (tablet) | sidebar → off-canvas drawer, hamburger shown, table scrolls in-container, 0 page overflow |
| 375 (mobile) | drawer off-canvas, hamburger shown, table scrolls in-container, 0 page overflow |

_Note: visual screenshots could not be captured in this headless environment (the capture tool times out), so layout was verified by measuring the live DOM geometry — viewport vs. scroll width, element positions, and applied CSS — which is stricter than eyeballing a screenshot._

## Security & integrity upgrade (added after the first QA pass)
Verified by `npm run -w server qa:security` (16 checks):
- **Digital signatures — user's choice per request.** At submit the requester picks **Image** (visual signature/stamp) or **Digital certificate**. DIGITAL embeds a cryptographic **PKCS#7 / PAdES** signature (self-signed cert auto-generated with node-forge; replaceable with a CA/eIDAS `.p12`) so any later edit invalidates it. Verified: the final PDF carries a `/ByteRange` signature and opens as a valid PDF.
- **Document integrity hashing.** SHA-256 of the **original** is captured at upload and of the **final** PDF at completion. `GET /api/documents/:id/verify` recomputes and reports **Verified / unaltered** or **Tampered**. Tamper detection was proven by appending a byte to the stored final PDF → verify flips to `intact:false`.
- **Hash-chained audit log.** Every entry stores `hash = SHA-256(prevHash + fields)`. `GET /api/audit/verify` walks the chain and reports the first broken link. The Audit page shows a green "chain verified" / red "BROKEN" banner.
- **Brute-force lockout.** Per-IP login rate-limit (`express-rate-limit`) **plus** per-account lockout after N failed attempts (configurable; default 5 → 15-min lock). Proven: 5 wrong attempts lock the account so even the correct password is refused; an admin password reset clears it.
- **Server-side password policy.** `password.minLength` + `password.requireNumber` enforced on user create, admin reset, and self-service change (previously the settings existed but weren't applied).
- **Office→PDF.** Robust LibreOffice (`soffice`) detection — `SOFFICE_PATH` env, common Windows/Linux install paths, then PATH; falls back to a cover PDF (original always preserved) when not installed.

All six were re-verified **inside the packaged desktop bundle** (esbuild-bundled `@signpdf`/`node-forge`, all DB migrations applied on a fresh SQLite file).

## Collaboration & workflow features (added 3rd pass)
Verified by `npm run -w server qa:features` (16 checks):
- **Email notifications** — nodemailer; sends when `notifications.email=true` + SMTP configured, otherwise captures to an inspectable outbox. `POST /api/admin/test-email`, `GET /api/admin/outbox`.
- **Mobile push** — FCM-ready sender (`FCM_SERVER_KEY`), device-token registration (`POST /api/notifications/register-device`); captures when no key set.
- **Scheduled approval reminders** — periodic sweep + `POST /api/admin/run-reminders`; reminds signatories whose approvals exceed `notifications.reminderHours` (once per window).
- **Delegation / out-of-office** — `PUT /api/account/availability`; requests route to a delegate and the delegate can approve/reject on the absent signatory's behalf.
- **Bulk actions** — `POST /api/documents/bulk-decision` approves/rejects many documents at once with per-item results.
- **Document templates** — reusable signature-request presets (`/api/templates`); `submit` accepts `templateId` to pre-fill signatories/group/mode/method.
- **Document versioning** — `POST /api/documents/:id/revise` creates a linked new version; `GET /api/documents/:id/versions` lists the chain.

## Branding
Generated branded icons (white logo on brand maroon) for all three apps:
Windows `.exe` (`desktop/build/icon.ico`), web favicon (`web/public/favicon.ico`),
and Android launcher mipmaps (`mobile/.../res/mipmap-*/ic_launcher.png`). Regenerate
with `node scripts/make-icons.js`.

## How to re-run
```bash
# backend must be running (npm run -w server dev)
npm run -w server qa            # 58-check functional/RBAC/workflow suite
npm run -w server qa:security   # 16-check security & integrity suite
npm run -w server qa:features   # 16-check collaboration/workflow features
npm run -w server smoke         # 19-check workflow smoke
npm run -w web build            # web typecheck + production build
```

## Known limitations / follow-ups
- Office (`.docx`/`.xlsx`) → PDF fidelity needs LibreOffice (`soffice`) on the server; otherwise a cover PDF is produced and the original is preserved.
- Desktop/mobile installers use default icons (brandable via `build/icon.ico` and Android `mipmap`).
- On-device Android UI and large-scale performance/load testing require a physical device / emulator and a load tool, which weren't available in this environment.
