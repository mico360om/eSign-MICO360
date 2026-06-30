# Windows vs macOS — Feature Comparison Checklist

Both editions are built from the **same codebase** (Electron + embedded API +
SQLite + React UI), so functional parity is inherent, not re-implemented.

| Area | Feature | Windows | macOS | Notes |
|---|---|:--:|:--:|---|
| **Auth** | Login / JWT session | ✅ | ✅ | Identical |
| | Role-based access (Admin/Approver/Requester/Viewer) | ✅ | ✅ | Same RBAC engine |
| | Password policy + lockout | ✅ | ✅ | |
| **Dashboard** | Personal + system cards, charts | ✅ | ✅ | |
| **Documents** | Upload, list, advanced filters | ✅ | ✅ | |
| | PDF/PNG/JPG/TXT → PDF conversion | ✅ | ✅ | Native (pdf-lib) |
| | DOC/XLS/PPT → PDF | ⚠️ LibreOffice | ⚠️ LibreOffice | Same dependency on both |
| | Original file preserved | ✅ | ✅ | |
| **Workflow** | Sequential & parallel approval | ✅ | ✅ | |
| | Approve / reject / sign / stamp / complete | ✅ | ✅ | |
| | Multi-page sign/stamp placement | ✅ | ✅ | |
| | Tamper-evident SHA-256 + hash-chained audit | ✅ | ✅ | |
| **Users/Profiles/Roles** | Full CRUD, assignment | ✅ | ✅ | |
| **Signature Groups / Stamps / Approval Types** | CRUD + apply | ✅ | ✅ | |
| **Reports** | Counts, filters, charts | ✅ | ✅ | Export = roadmap (both) |
| **Audit Log** | Hash-chained log + verify | ✅ | ✅ | |
| **Notifications** | In-app + email (SMTP) + test email | ✅ | ✅ | |
| **Settings** | All grouped settings | ✅ | ✅ | |
| **Help/Legal** | T&C, Privacy, About (in-app, print) | ✅ | ✅ | |
| **Auto-update** | GitHub releases, progress, verify, rollback-safe | ✅ NSIS | ✅ ZIP/DMG | `latest.yml` / `latest-mac.yml` |
| **Data storage** | `%APPDATA%\eSign MICO360` | `~/Library/Application Support/eSign MICO360` | Local SQLite both |
| **Packaging** | NSIS `.exe` installer | `.dmg` + `.zip` | electron-builder |
| **Menu/UX/Branding** | Maroon/black brand, responsive | ✅ | ✅ | Pixel-identical UI |
| **Window controls** | Win min/max/close | macOS traffic lights | ✅ | OS-native chrome |
| **Code signing** | Optional (signtool) | Optional (Developer ID + notarize) | Platform-specific |

**Parity verdict:** Feature-complete parity. The only behavioral differences are
OS-native (window chrome, data folder location, installer format) — not
functional. Office→PDF fidelity depends on LibreOffice on **both** platforms
identically.
