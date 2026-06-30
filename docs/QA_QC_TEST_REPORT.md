# eSign MICO360 — QA/QC Test Report

**Date:** 1 July 2026
**Tester role:** Senior QA/QC (functional, UI/UX, security, workflow, performance)
**Build under test:** Web Admin Portal + Windows Desktop (Electron, embedded API + SQLite)
**Method:** Automated suites (135 checks) on a clean isolated DB + live browser inspection + source-level review.

> **Legend — Status:** ✅ Pass · ⚠️ Pass with limitation · ❌ Fail/Bug · 🛈 Observation
> **Priority:** 🔴 Critical · 🟠 High · 🟡 Medium · 🟢 Low

---

## A. Automated regression (clean database)

| Suite | Result |
|------|--------|
| Backend smoke (end-to-end workflow) | ✅ 19/19 |
| Backend QA (cross-client consistency) | ✅ 58/58 |
| Security & integrity (hashing, tamper, audit chain, lockout, password policy) | ✅ 17/17 |
| Features (notify, delegation, templates, versioning) | ✅ 16/16 |
| Saved marks + edit/re-approve | ✅ 15/15 |
| Approval types | ✅ 10/10 |
| **Total** | ✅ **135 / 135 passing, 0 failing** |

> One regression was found and fixed during this pass: the security suite's "policy-compliant password" sample (`abc123`) no longer satisfied the **strengthened default password policy** (min 8 + upper + lower + number). The sample was updated to `Abc12345` and a new assertion for the min-length rule was added. All other security failures seen initially were traced to a **polluted shared dev database** (1,859 accumulated audit rows) and a storage-path mismatch in the isolated harness — not logic defects; they pass cleanly on a fresh DB.

---

## B. Module-by-module results

| Module | Test Scenario | Expected Result | Actual Result | Status | Priority | Remarks |
|---|---|---|---|---|---|---|
| **Dashboard** | Personal cards (Pending My Approval / Others / Overdue / Completed) load for any user | Cards render with live counts | Renders via `/dashboard/me`; verified live | ✅ | — | Dual endpoint: `/dashboard/me` (all users) + `/dashboard` (VIEW_REPORTS) |
| Dashboard | Admin system cards clickable → filtered pages | Navigate to target | All 8 cards navigate | ✅ | — | |
| Dashboard | Monthly uploads chart / status donut / approval metrics | Charts render | Pure-SVG charts render; "No upload data yet" when empty | ✅ | — | |
| Dashboard | Recent activity Today/Week/All + action filter | Filters list | Works | ✅ | — | |
| Dashboard | "Failed Email Notifications" metric | Real count | **Placeholder only — not tracked** | ❌ | 🟡 | No failed-email persistence yet |
| **Documents** | List with advanced filters (status, priority, profile, date range) | Server-side filter | Works (query params → Prisma) | ✅ | — | |
| Documents | Admin sees documents outside own profile | Visible | Fixed via `isAdmin` bypass in `fetchVisible` | ✅ | — | |
| Documents | Priority / due-date / confidential badges | Shown in title cell | Works | ✅ | — | |
| Documents | Bulk actions (export/archive/assign/delete) | Available | **Not implemented** | ❌ | 🟡 | Listed in roadmap, not built |
| **Upload** | Upload PDF / PNG / JPG / JPEG / TXT | Converted to PDF, original kept | ✅ native conversion; originals untouched (separate `originals/converted/final` dirs) | ✅ | — | Verified in `pdf.ts` + integrity suite |
| Upload | Upload DOC/DOCX/XLS/XLSX/PPT/PPTX | Faithful PDF | ⚠️ **Real PDF only if LibreOffice/`soffice` is installed**; otherwise a placeholder "cover page" PDF is produced (original still downloadable) | ⚠️ | 🟠 | Desktop does **not** bundle LibreOffice — see Critical/High list |
| Upload | Invalid file type | Rejected | ✅ `fileFilter` rejects with clear message | ✅ | — | |
| Upload | Oversized file | Rejected | ✅ multer `limits.fileSize` (default 25 MB) | ✅ | — | |
| Upload | Empty title / missing profile | Validation error | ✅ server validates (admins may upload without profile by design) | ✅ | — | |
| Upload | Duplicate document title | Allowed (titles not unique) | 🛈 No uniqueness constraint — duplicates allowed by design | 🛈 | 🟢 | Add a soft "similar title" warning if desired |
| Upload | Drag-and-drop + priority/due/notes/confidential | Captured | ✅ Works | ✅ | — | |
| **Approval workflow** | Submit → assign approver → approve → sign → stamp → complete → download | Full chain + audit | ✅ Covered by smoke + qa suites | ✅ | — | |
| Workflow | Reject path | Document REJECTED, requester notified | ✅ | ✅ | — | |
| Workflow | Sequential vs parallel modes | Both honored | ✅ Tested in qa suite | ✅ | — | Default mode configurable in Settings |
| Workflow | Sign/stamp applied to all pages of multi-page PDF | Marks on every selected page | ✅ `applyPlacements` per-page (prior fix) | ✅ | — | |
| Workflow | Tamper a finalized PDF → detected | `verify.final.intact === false` | ✅ SHA-256 stored at finalize; mismatch detected | ✅ | — | |
| **Users** | Create / edit / deactivate / reset password / force PW change | All actions work | ✅ Verified in code + qa suite | ✅ | — | Dept/designation/last-login/created columns added |
| Users | Role + profile assignment | Persisted | ✅ | ✅ | — | |
| Users | ResetPassword modal still enforces only 6-char min client-side | Should match policy (8) | ❌ **Client min is 6**, server policy is 8 → confusing double-validation | ❌ | 🟡 | Cosmetic mismatch; server still enforces |
| **Profiles** | Create/edit, assign users, profile-based visibility | Works | ✅ | ✅ | — | View Profile Dashboard not built (roadmap) |
| **Roles & Permissions** | Grouped permission matrix, group toggle, indeterminate state | Works | ✅ Verified | ✅ | — | |
| Roles | Restricted role only sees permitted sidebar items | Hidden if no perm | ✅ `NAV.filter(can(perm))` | ✅ | — | |
| **Signature Groups** | CRUD, mandatory/optional/backup/delegation | CRUD works; advanced flags | ⚠️ CRUD ✅; mandatory/backup/limits not implemented | ⚠️ | 🟢 | Roadmap items |
| **Company Stamps** | Upload/CRUD, placement, resize, final output | Works | ✅ Core works; owner/validity/usage-history not built | ⚠️ | 🟢 | Roadmap items |
| **Approval Types** | Named catalog CRUD, per-signatory type at request | Works | ✅ 10/10 suite | ✅ | — | Per-type style/required-fields not built |
| **Reports** | Counts, filters, charts | Accurate | ✅ Renders | ✅ | — | |
| Reports | Export to Excel / PDF / CSV | Export files | ❌ **Not implemented** | ❌ | 🟠 | High-value gap |
| **Audit Log** | Records actor, time, action, doc; hash-chained | Tamper-evident | ✅ Hash chain verified (17/17) | ✅ | — | |
| Audit Log | IP address / device / old→new value capture | Recorded | ❌ **Not captured** | ❌ | 🟡 | Schema lacks IP/device columns |
| Audit Log | Export | Available | ❌ Not implemented | ❌ | 🟡 | |
| **Notifications** | Upload/approval/rejection/completion notices | Delivered in-app | ✅ Works | ✅ | — | |
| Notifications | Reminder + failed-email | Tracked | ⚠️ Reminder hours configurable; failed-email not tracked | ⚠️ | 🟡 | |
| **Settings** | Grouped sections, human labels, save | Persist | ✅ 6 groups, save top+bottom | ✅ | — | |
| Settings | SMTP host/port/secure/user/pass/from | Saved | ✅ Saved | ✅ | — | |
| Settings | **"Send test email" button** | Sends test | ❌ **No test-email action** | ❌ | 🟠 | SMTP can be misconfigured silently |
| **Security** | Password policy enforcement | Configurable, enforced | ✅ min/upper/lower/number/special | ✅ | — | |
| Security | Failed-login lockout | Lock after N | ✅ `security.maxFailedLogins` | ✅ | — | |
| Security | Direct URL access by unauthorized user | Blocked | ✅ API perms enforced server-side; sidebar hidden | ✅ | — | |
| Security | Inactive user login | Rejected | ✅ | ✅ | — | |
| Security | Session timeout / auto-logout inactive | Enforced | ⚠️ JWT expiry honored; **client-side idle auto-logout not wired** | ⚠️ | 🟡 | Setting exists, no client timer |
| **Legal / Help (new)** | T&C, Privacy, About open in-app, scrollable, last-updated, back, print | All present | ✅ Verified live on all 3 routes | ✅ | — | Added this pass |
| **Auto-update (new)** | Check on startup + manual button, versions/changelog/size/progress, verified install, rollback safety, logs | Functional | ✅ Code wired & load-tested; ⚠️ full GitHub-release round-trip needs a published release to test E2E | ⚠️ | 🟠 | Added this pass |
| **UI/UX** | Spacing, color, icons, responsive drawer, toasts, empty states | Consistent | ✅ Brand tokens (#8A1A1C / #1E1F1E), responsive ≤900/600px | ✅ | — | |
| **Performance** | 200 users / 232 docs / 95 profiles dashboard | Fast | ✅ Renders quickly; counts via indexed queries | ✅ | — | Client filtering on Users list is in-memory (fine at this scale) |

---

## C. Critical bugs (🔴)

None that block core signing/approval. The integrity, auth, and workflow cores are sound (135/135). The items below are the highest-impact gaps.

## D. High-priority improvements (🟠)

1. **Office→PDF fidelity.** DOC/XLS/PPT only render to a real PDF when LibreOffice (`soffice`) is on the host. The Windows desktop build does **not** ship it, so Office uploads become a cover-page placeholder. → Either bundle/portable-LibreOffice with the installer, document the `SOFFICE_PATH` requirement prominently, or render via a cloud/headless converter.
2. **Reports export (Excel/PDF/CSV).** Not implemented; a core expectation for an approval product.
3. **"Send test email" in SMTP settings.** Without it, admins can't validate SMTP; email failures are silent.
4. **Auto-update E2E.** Logic is in place; publish a GitHub release (`vX.Y.Z` + `latest.yml`) and verify the download→verify→install→relaunch cycle on a real Windows box.
5. **Failed-email tracking.** Persist send failures so the dashboard card and notifications are truthful.

## E. UI/UX improvement list

- Align the **Reset Password** modal's client min-length (currently 6) with the configured policy (8) and show the live policy rules.
- Add a **policy hint** under password fields ("8+ chars, upper, lower, number").
- Surface **per-field validation inline** on Upload rather than a single toast.
- Add a subtle **"duplicate title" advisory** on upload.
- **Idle auto-logout** countdown toast when `security.autoLogoutInactiveMinutes > 0`.
- Consider **code-splitting** the web bundle (currently ~690 KB single chunk; warning at build).

## F. Security improvement list

- **Capture IP + device + old/new values** in the audit log (schema columns + middleware).
- **Wire client-side session timeout / idle auto-logout** to the existing settings.
- **Rotate the GitHub PAT** shared in chat — treat as leaked (out-of-band).
- Consider **rate-limiting** auth endpoints in addition to lockout.
- Encrypt **SMTP password at rest** (currently plain in settings table).
- Add **2FA / OTP** option for admin accounts (future).

## G. Missing features (from product roadmap, not yet built)

- Reports: export + Stamp-Usage / Rejection / Pending-Aging / SLA reports
- Documents: bulk actions, version-history UI, status timeline, PDF preview before upload
- Approval Types: per-type default text / stamp style / required fields
- Signature Groups: mandatory/optional, backup approver, delegation, approval limits
- Company Stamps: owner, validity period, usage history, watermark preview, size lock
- Profiles: profile dashboard, profile templates, profile-based workflows
- Audit: export, IP/device capture
- Backend: server-side enforcement that signatories hold APPROVE permission on submit

## H. Production readiness rating

**8.0 / 10**

- **Core (auth, RBAC, upload, sequential/parallel approval, signing, stamping, finalize, tamper-evident audit, notifications): production-ready.** 135/135 automated checks green on a clean DB.
- **Held back from 9–10 by:** Office→PDF depending on an external binary, no Reports export, no SMTP test action, auto-update not yet exercised against a live release, and audit log missing IP/device. None compromise the signing core, but each is visible to end users/admins.
