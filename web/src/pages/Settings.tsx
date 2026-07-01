import { useEffect, useMemo, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { Spinner, useToast } from "../components/ui";

// ── Grouped setting definitions ───────────────────────────────────────────

type FieldDef = { key: string; label: string; type?: "bool" | "select" | "number" | "password"; options?: { value: string; label: string }[]; hint?: string; wide?: boolean; showIf?: (s: Record<string, string>) => boolean };
type Group = { title: string; icon: string; desc: string; fields: FieldDef[] };

const SETTING_GROUPS: Group[] = [
  {
    title: "Password Policy", icon: "🔑", desc: "Rules new and changed passwords must meet.",
    fields: [
      { key: "password.minLength",        label: "Minimum password length",         type: "number",  hint: "Recommended: 8 or more" },
      { key: "password.expiryDays",       label: "Password expiry (days)",           type: "number",  hint: "0 = never expires" },
      { key: "password.requireNumber",    label: "Require at least one number",      type: "bool" },
      { key: "password.requireUppercase", label: "Require uppercase letter",         type: "bool" },
      { key: "password.requireLowercase", label: "Require lowercase letter",         type: "bool" },
      { key: "password.requireSpecial",   label: "Require special character",        type: "bool" },
    ],
  },
  {
    title: "Upload Settings", icon: "📤", desc: "Limits and conversion for uploaded documents.",
    fields: [
      { key: "upload.maxFileSizeMb",       label: "Max upload size (MB)",            type: "number" },
      { key: "pdf.autoConvert",            label: "Auto-convert uploads to PDF",      type: "bool" },
      { key: "upload.allowedExtensions",   label: "Allowed file extensions",          hint: "Comma-separated, e.g. pdf,docx,png", wide: true },
    ],
  },
  {
    title: "Signature & Stamp", icon: "✍", desc: "Defaults for signing and stamping.",
    fields: [
      { key: "signature.allowResize",      label: "Allow signature / stamp resize",   type: "bool" },
      { key: "signature.method",           label: "Default signature type",           type: "select",
        options: [{ value: "IMAGE", label: "Image / visual" }, { value: "DIGITAL", label: "Digital certificate" }] },
    ],
  },
  {
    title: "Approval Workflow", icon: "✅", desc: "How documents move through approval.",
    fields: [
      { key: "workflow.defaultMode",                 label: "Default approval mode",            type: "select",
        options: [{ value: "SEQUENTIAL", label: "Sequential" }, { value: "PARALLEL", label: "Parallel (all at once)" }] },
      { key: "workflow.documentRetentionDays",        label: "Document retention period (days)",  type: "number", hint: "0 = keep forever" },
      { key: "workflow.allowDownloadBeforeCompletion", label: "Allow download before completion",  type: "bool" },
      { key: "workflow.watermarkUnsigned",            label: "Watermark unsigned documents",      type: "bool" },
    ],
  },
  {
    title: "Email Notifications", icon: "✉", desc: "Outgoing email for OTP codes and notifications.",
    fields: [
      { key: "notifications.email",        label: "Enable email notifications",       type: "bool" },
      { key: "notifications.reminderHours", label: "Approval reminder interval (hours)", type: "number" },
      { key: "email.provider",             label: "Email provider",                   type: "select",
        options: [{ value: "smtp", label: "SMTP server" }, { value: "mailjet", label: "Mailjet API" }], hint: "How outgoing emails are sent", wide: true },
      // ── SMTP ──
      { key: "smtp.host",                  label: "SMTP Host",                        hint: "e.g. smtp.gmail.com", showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      { key: "smtp.port",                  label: "SMTP Port",                        type: "number", hint: "587 (TLS) or 465 (SSL)", showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      { key: "smtp.user",                  label: "SMTP Username",                    hint: "Usually your full email address", showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      { key: "smtp.pass",                  label: "SMTP Password",                    type: "password", showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      { key: "smtp.secure",               label: "Use Secure SMTP (SSL)",             type: "bool", showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      { key: "smtp.from",                  label: "Sender Email (From address)",      hint: 'e.g. eSign MICO360 <noreply@company.com>', wide: true, showIf: (s) => (s["email.provider"] || "smtp") === "smtp" },
      // ── Mailjet ──
      { key: "mailjet.apiKey",             label: "Mailjet API Key",                  hint: "Mailjet → Account → API Key Management", showIf: (s) => s["email.provider"] === "mailjet" },
      { key: "mailjet.apiSecret",          label: "Mailjet Secret Key",               type: "password", showIf: (s) => s["email.provider"] === "mailjet" },
      { key: "mailjet.fromEmail",          label: "Sender Email",                     hint: "Must be a verified sender in Mailjet", showIf: (s) => s["email.provider"] === "mailjet" },
      { key: "mailjet.fromName",           label: "Sender Name",                      showIf: (s) => s["email.provider"] === "mailjet" },
    ],
  },
  {
    title: "Security", icon: "🛡", desc: "Login protection and session limits.",
    fields: [
      { key: "security.maxFailedLogins",          label: "Lock account after N failed logins",  type: "number" },
      { key: "security.lockoutMinutes",            label: "Account lockout duration (minutes)",  type: "number" },
      { key: "security.sessionTimeoutMinutes",     label: "Session timeout (minutes)",           type: "number", hint: "0 = never; 480 = 8 hours" },
      { key: "security.autoLogoutInactiveMinutes", label: "Auto-logout after inactivity (minutes)", type: "number", hint: "0 = disabled" },
    ],
  },
];

const slug = (t: string) => "sec-" + t.toLowerCase().replace(/[^a-z0-9]+/g, "-");

// ── Component ─────────────────────────────────────────────────────────────

export default function Settings() {
  const toast = useToast();
  const [settings, setSettings] = useState<Record<string, string> | null>(null);
  const [initial, setInitial] = useState<string>("");
  const [busy, setBusy] = useState(false);
  const [testEmailTo, setTestEmailTo] = useState("");
  const [testing, setTesting] = useState(false);
  const [query, setQuery] = useState("");
  const [active, setActive] = useState(slug(SETTING_GROUPS[0].title));

  useEffect(() => {
    unwrap<Record<string, string>>(api.get("/settings")).then((s) => { setSettings(s); setInitial(JSON.stringify(s)); }).catch(() => setSettings({}));
  }, []);

  const q = query.trim().toLowerCase();
  const groups = useMemo(() => SETTING_GROUPS
    .map((g) => ({
      ...g,
      fields: g.fields
        .filter((f) => !f.showIf || (settings && f.showIf(settings)))
        .filter((f) => !q || f.label.toLowerCase().includes(q) || f.key.toLowerCase().includes(q)),
    }))
    .filter((g) => g.fields.length > 0), [settings, q]);

  const dirty = settings != null && JSON.stringify(settings) !== initial;

  // Highlight the section currently at the top of the scroll area.
  useEffect(() => {
    if (!settings || q) return;
    const c = document.querySelector(".content") as HTMLElement | null;
    if (!c) return;
    const onScroll = () => {
      const top = c.getBoundingClientRect().top;
      let cur = slug(SETTING_GROUPS[0].title);
      for (const g of SETTING_GROUPS) {
        const el = document.getElementById(slug(g.title));
        if (el && el.getBoundingClientRect().top - top <= 90) cur = slug(g.title);
      }
      setActive(cur);
    };
    c.addEventListener("scroll", onScroll, { passive: true });
    onScroll();
    return () => c.removeEventListener("scroll", onScroll);
  }, [settings, q]);

  // Scroll the .content container directly to the section — reliable across
  // browsers (scrollIntoView's smooth option no-ops on this nested scroller).
  const jump = (t: string) => {
    const el = document.getElementById(slug(t));
    const c = document.querySelector(".content") as HTMLElement | null;
    if (el && c) {
      // Instant assignment — smooth scrolling silently fails on this nested
      // overflow container in some Chromium builds.
      c.scrollTop = el.getBoundingClientRect().top - c.getBoundingClientRect().top + c.scrollTop - 8;
      setActive(slug(t)); // programmatic scroll may not fire a scroll event here
    }
  };
  const set = (key: string, value: string) => setSettings((s) => ({ ...s!, [key]: value }));

  const save = async () => {
    setBusy(true);
    try { await api.put("/settings", settings); setInitial(JSON.stringify(settings)); toast("Settings saved"); }
    catch (e) { toast(apiError(e), true); } finally { setBusy(false); }
  };

  const sendTest = async () => {
    if (!testEmailTo.trim()) return toast("Enter a recipient email first", true);
    setTesting(true);
    try {
      await api.put("/settings", settings); setInitial(JSON.stringify(settings));
      const r = await unwrap<{ simulated: boolean }>(api.post("/admin/test-email", { to: testEmailTo.trim() }));
      toast(r.simulated ? "Sent (simulated — no email provider configured)" : "Test email sent successfully");
    } catch (e) { toast("Test failed: " + apiError(e), true); } finally { setTesting(false); }
  };

  if (!settings) return <Spinner />;

  const renderField = (field: FieldDef) => {
    const val = settings[field.key] ?? "";
    return (
      <div className={`field${field.wide ? " settings-wide" : ""}`} key={field.key}>
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
  };

  return (
    <div className="settings-page">
      <div className="between" style={{ marginBottom: 14, flexWrap: "wrap", gap: 10 }}>
        <h1 className="page-title" style={{ margin: 0 }}>System Settings</h1>
        <input className="search" style={{ maxWidth: 300, width: "100%" }} placeholder="Search settings…" value={query} onChange={(e) => setQuery(e.target.value)} />
      </div>

      <div className="settings-layout">
        {/* Section nav (desktop) */}
        {!q && (
          <aside className="settings-nav">
            {SETTING_GROUPS.map((g) => (
              <button key={g.title} className={active === slug(g.title) ? "active" : ""} onClick={() => jump(g.title)}>
                <span className="settings-nav-ico">{g.icon}</span> {g.title}
              </button>
            ))}
          </aside>
        )}

        {/* Content */}
        <div className="settings-content">
          {groups.length === 0 && <div className="card"><div className="empty-state">No settings match “{query}”.</div></div>}
          {groups.map((group) => (
            <div key={group.title} id={slug(group.title)} className="card card-pad" style={{ scrollMarginTop: 12 }}>
              <div className="settings-group-head">
                <span className="settings-group-ico">{group.icon}</span>
                <div>
                  <h3 style={{ margin: 0, fontSize: 15 }}>{group.title}</h3>
                  <span className="muted" style={{ fontSize: 12 }}>{group.desc}</span>
                </div>
              </div>
              <div className="settings-fields">
                {group.fields.map(renderField)}
              </div>
              {group.title === "Email Notifications" && (
                <div className="settings-testemail">
                  <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--ink-soft)" }}>Send a test email</label>
                  <div className="row" style={{ marginTop: 6, gap: 8, flexWrap: "wrap" }}>
                    <input style={{ flex: 1, minWidth: 180 }} type="email" placeholder="recipient@example.com" value={testEmailTo} onChange={(e) => setTestEmailTo(e.target.value)} />
                    <button className="btn btn-ghost" disabled={testing} onClick={sendTest}>{testing ? "Sending…" : "Send Test"}</button>
                  </div>
                  <span className="muted" style={{ fontSize: 11, marginTop: 4, display: "block" }}>Saves current email settings, then attempts a real send and reports the result.</span>
                </div>
              )}
            </div>
          ))}
        </div>
      </div>

      {/* Sticky save bar */}
      <div className="settings-savebar">
        <span className={dirty ? "settings-dirty" : "muted"} style={{ fontSize: 13 }}>
          {dirty ? "● You have unsaved changes" : "All changes saved"}
        </span>
        <button className="btn btn-primary" disabled={busy || !dirty} onClick={save}>{busy ? "Saving…" : "Save Settings"}</button>
      </div>
    </div>
  );
}
