# eSign MICO360 — User Manual

Applies to the **Windows** desktop app and the **web** portal
(the UI is identical).

## 1. Signing in
Launch the app (or open the web portal). Enter your email and password. Default
admin seed: `admin@mico360.com` / `Admin@123` — change this immediately.

## 2. The sidebar
- **Dashboard** — your pending approvals, overdue items, and (for admins) system stats and charts.
- **Documents** — upload, filter, open, approve/sign documents.
- **Users / Profiles / Roles** — administration (permission-gated).
- **Signature Groups / Company Stamps / Approval Types** — signing configuration.
- **Reports / Audit Log** — analytics and the tamper-evident history.
- **Settings** — system configuration (admins).
- **Help & Legal** — About Us, Privacy Policy, Terms & Conditions, and (desktop) software updates.

## 3. Uploading a document
1. Go to **Documents → + Upload** (or drag a file onto the drop area).
2. Enter a **title**, choose a **profile**, optionally set **priority**, **due date**,
   **notes**, and mark **confidential**.
3. Allowed types: PDF, DOC, DOCX, XLS, XLSX, PPT, PPTX, PNG, JPG, JPEG, TXT
   (max size configurable, default 25 MB).
4. The app keeps your **original untouched** and creates a **PDF copy** for signing.
   *Office files need LibreOffice installed for full-fidelity conversion; otherwise
   a placeholder cover page is generated and the original stays downloadable.*

## 4. Approval workflow
1. Open a document and **Submit for approval**, choosing signatories and
   **Sequential** (one after another) or **Parallel** (all at once).
2. Each approver opens the document, places their **signature** and/or
   **company stamp** on the required page(s), and chooses **Approve** or **Reject**.
3. When all approvals are complete the document is **finalized**: a SHA-256 hash is
   stored so any later tampering is detected, and the action is written to the
   hash-chained **audit log**.
4. Download the final signed PDF from the document page.

## 5. Notifications & email
In-app notifications appear for approval requests, approvals, rejections and
completions. Admins can enable email in **Settings → Email Notification Settings**,
fill in SMTP details, and click **Send Test** to confirm delivery before relying on it.

## 6. Reports & audit
**Reports** shows counts, charts and filters. **Audit Log** lists every important
action (who, when, what) and can be verified for integrity.

## 7. Software updates (desktop)
Open **Help & Legal → About Us → Software Updates** and click **Check for Updates**.
If a new version exists you'll see its version, changelog and size; download shows a
progress bar; the package is integrity-verified before installing on restart. Your
data, settings and records are always preserved.

## 8. Legal pages
**About Us**, **Privacy Policy** and **Terms & Conditions** are available under
**Help & Legal**, open inside the app, are scrollable, show a *Last updated* date,
and can be **Printed / saved as PDF**.

## 9. Troubleshooting
- *Office file shows a cover page:* install LibreOffice (see setup guide) or set `SOFFICE_PATH`.
- *Email test fails:* re-check SMTP host/port/secure/user/password; the test now shows the real error.
- *Forgot admin password:* a second admin can reset it under **Users → Reset PW**.
