import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { Spinner, useToast } from "../components/ui";

// ── Grouped setting definitions ───────────────────────────────────────────

type FieldDef = { key: string; label: string; type?: "bool" | "select" | "number" | "password"; options?: { value: string; label: string }[]; hint?: string; showIf?: (s: Record<string, string>) => boolean };

const SETTING_GROUPS: { title: string; fields: FieldDef[] }[] = [
  {
    title: "Password Policy",
    fields: [
      { key: "password.minLength",        label: "Minimum password length",         type: "number",  hint: "Recommended: 8 or more" },
      { key: "password.requireNumber",    label: "Require at least one number",      type: "bool" },
      { key: "password.requireUppercase", label: "Require uppercase letter",         type: "bool" },
      { key: "password.requireLowercase", label: "Require lowercase letter",         type: "bool" },
      { key: "password.requireSpecial",   label: "Require special character",        type: "bool" },
      { key: "password.expiryDays",       label: "Password expiry (days)",           type: "number",  hint: "0 = never expires" },
    ],
  },
  {
    title: "Upload Settings",
    fields: [
      { key: "upload.maxFileSizeMb",       label: "Max upload size (MB)",            type: "number" },
      { key: "upload.allowedExtensions",   label: "Allowed file extensions",          hint: "Comma-separated, e.g. pdf,docx,png" },
      { key: "pdf.autoConvert",            label: "Auto-convert uploads to PDF",      type: "bool" },
    ],
  },
  {
    title: "Signature & Stamp Settings",
    fields: [
      { key: "signature.allowResize",      label: "Allow signature / stamp resize",   type: "bool" },
      { key: "signature.method",           label: "Default signature type",           type: "select",
        options: [{ value: "IMAGE", label: "Image / visual" }, { value: "DIGITAL", label: "Digital certificate" }] },
    ],
  },
  {
    title: "Approval Workflow",
    fields: [
      { key: "workflow.defaultMode",                 label: "Default approval mode",            type: "select",
        options: [{ value: "SEQUENTIAL", label: "Sequential" }, { value: "PARALLEL", label: "Parallel (all at once)" }] },
      { key: "workflow.allowDownloadBeforeCompletion", label: "Allow download before completion",  type: "bool" },
      { key: "workflow.watermarkUnsigned",            label: "Watermark unsigned documents",      type: "bool" },
      { key: "workflow.documentRetentionDays",        label: "Document retention period (days)",  type: "number", hint: "0 = keep forever" },
    ],
  },
  {
    title: "Email Notification Settings",
    fields: [
      { key: "notifications.email",        label: "Enable email notifications",       type: "bool" },
      { key: "notifications.reminderHours", label: "Approval reminder interval (hours)", type: "number" },
      { key: "email.provider",             label: "Email provider",                   type: "select",
        options: [{ value: "smtp", label: "SMTP server" }, { value: "mailjet", label: "Mailjet API" }], hint: "How outgoing emails (OTP codes, notifications) are sent" },
      // ── SMTP ──
      { key: "smtp.host",                  label: "SMTP Host",                        hint: "e.g. smtp.gmail.com", showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      { key: "smtp.port",                  label: "SMTP Port",                        type: "number", hint: "Usually 587 (TLS) or 465 (SSL)", showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      { key: "smtp.secure",               label: "Use Secure SMTP (SSL)",             type: "bool", showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      { key: "smtp.user",                  label: "SMTP Username",                    hint: "Usually your full email address", showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      { key: "smtp.pass",                  label: "SMTP Password",                    type: "password", showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      { key: "smtp.from",                  label: "Sender Email (From address)",      hint: 'e.g. eSign MICO360 <noreply@company.com>', showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      // ── Mailjet ──
      { key: "mailjet.apiKey",             label: "Mailjet API Key",                  hint: "From Mailjet → Account → API Key Management", showIf: (s) => s["email.provider"] === "mailjet" },
      { key: "mailjet.apiSecret",          label: "Mailjet Secret Key",               type: "password", showIf: (s) => s["email.provider"] === "mailjet" },
      { key: "mailjet.fromEmail",          label: "Sender Email",                     hint: "Must be a verified sender in Mailjet", showIf: (s) => s["email.provider"] === "mailjet" },
      { key: "mailjet.fromName",           label: "Sender Name",                      showIf: (s) => s["email.provider"] === "mailjet" },
    ],
  },
  {
    title: "Security Settings",
    fields: [
      { key: "security.maxFailedLogins",          label: "Lock account after N failed logins",  type: "number" },
      { key: "security.lockoutMinutes",            label: "Account lockout duration (minutes)",  type: "number" },
      { key: "security.sessionTimeoutMinutes",     label: "Session timeout (minutes)",           type: "number", hint: "0 = never; 480 = 8 hours" },
      { key: "security.autoLogoutInactiveMinutes", label: "Auto-logout after inactivity (minutes)", type: "number", hint: "0 = disabled" },
    ],
  },
];

// ── Component ─────────────────────────────────────────────────────────────

export default function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [busy, setBusy] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [query, setQuery] = useState("");

  useEffect(() => { unwrap(api.get("/settings")).then(setSettings).catch(() => setSettings({})); }, []);

  const slug = (t: string) => "sec-" + t.toLowerCase().replace(/[^a-z0-9]+/g, "-");
  const q = query.trim().toLowerCase();
  const groups = SETTING_GROUPS
    .map((g) => ({
      ...g,
      fields: g.fields
        .filter((f) => !f.showIf || (settings && f.showIf(settings)))
        .filter((f) => !q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)),
    }))
    .filter((g) => g.fields.length > 0);

  const set = (key: string, value: string) => setSettings((s) => ({ ...s!, [key]: value }));

  const save = async () => {
    setBusy(true);
    try { await api.put("/settings", settings); toast("Settings saved"); }
    catch (e) { toast(apiError(e), true); } finally { setBusy(false); }
  };

  const sendTest = async () => {
    if (!testEmailTo.trim()) return toast("Enter a recipient email first", true);
    setTesting(true);
    try {
      await api.put("/settings", settings); // persist current SMTP values before testing
      const r = await unwrap<{ simulated: boolean }>(api.post("/admin/test-email", { to: testEmailTo.trim() }));
      toast(r.simulated ? "Sent (simulated — no SMTP host configured)" : "Test email sent successfully");
    } catch (e) { toast("Test failed: " + apiError(e), true); } finally { setTesting(false); }
  };

  if (!settings) return <Spinner />;

  return (
    <div>
      <div className="between" style={{ marginBottom: 14 }}>
        <h1 className="page-title" style={{ margin: 0 }}>System Settings</h1>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save Settings"}</button>
      </div>

      {/* Search + quick-jump section chips */}
      <div style={{ maxWidth: 700 }}>
        <input className="search" style={{ width: "100%", marginBottom: 12 }} placeholder="Search settings…" value={query} onChange={(e) => setQuery(e.target.value)} />
        {!q && (
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 18 }}>
            {SETTING_GROUPS.map((g) => (
              <button key={g.title} className="btn btn-ghost btn-sm" onClick={() => document.getElementById(slug(g.title))?.scrollIntoView({ behavior: "smooth", block: "start" })}>{g.title}</button>
            ))}
          </div>
        )}
      </div>

      <div style={{ display: "flex", flexDirection: "column", gap: 22, maxWidth: 700 }}>
        {groups.length === 0 && <div className="empty-state">No settings match “{query}”.</div>}
        {groups.map((group) => (
          <div key={group.title} id={slug(group.title)} className="card card-pad" style={{ scrollMarginTop: 12 }}>
            <h3 style={{ margin: "0 0 16px", fontSize: 15, borderBottom: "1px solid var(--border)", paddingBottom: 10 }}>{group.title}</h3>
            {group.fields.map((field) => {
              const val = settings[field.key] ?? "";
              return (
                <div className="field" key={field.key}>
                  <label>{field.label}</label>
                  {field.type === "bool" ? (
                    <select value={val} onChange={(e) => set(field.key, e.target.value)}>
                      <option value="true">Enabled</option>
                      <option value="false">Disabled</option>
                    </select>
                  ) : field.type === "select" ? (
                    <select value={val} onChange={(e) => set(field.key, e.target.value)}>
                      {(field.options || []).map((o) => <option key={o.value} value={o.value}>{o.label}</option>)}
                    </select>
                  ) : field.type === "password" ? (
                    <input type="password" value={val} placeholder="(unchanged)" onChange={(e) => set(field.key, e.target.value)} />
                  ) : (
                    <input type={field.type === "number" ? "number" : "text"} value={val} onChange={(e) => set(field.key, e.target.value)} />
                  )}
                  {field.hint && <span className="muted" style={{ fontSize: 11, marginTop: 3, display: "block" }}>{field.hint}</span>}
                </div>
              );
            })}
            {group.title === "Email Notification Settings" && (
              <div style={{ borderTop: "1px dashed var(--border)", marginTop: 6, paddingTop: 14 }}>
                <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--ink-soft)" }}>Send a test email</label>
                <div className="row" style={{ marginTop: 6, gap: 8 }}>
                  <input style={{ flex: 1 }} type="email" placeholder="recipient@example.com" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} />
                  <button className="btn btn-ghost" disabled={testing} onClick={sendTest}>{testing ? "Sending…" : "Send Test"}</button>
                </div>
                <span className="muted" style={{ fontSize: 11, marginTop: 4, display: "block" }}>Saves current SMTP settings, then attempts a real send and reports the actual result.</span>
              </div>
            )}
          </div>
        ))}
      </div>

      <div style={{ marginTop: 24 }}>
        <button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save Settings"}</button>
      </div>
    </div>
  );
}
