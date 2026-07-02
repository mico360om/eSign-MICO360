import { useNavigate, useParams } from "react-router-dom";
import { APP_INFO, LEGAL_DOCS, LegalDoc } from "./legal/content";

function Paragraph({ text }: { text: string }) {
  if (text.startsWith("• ")) {
    return (
      <li style={{ marginBottom: 6, color: "var(--ink-soft)", lineHeight: 1.6 }}>{text.slice(2)}</li>
    );
  }
  return <p style={{ margin: "0 0 12px", color: "var(--ink-soft)", lineHeight: 1.7 }}>{text}</p>;
}

function Section({ heading, paras }: { heading?: string; paras: string[] }) {
  // Group consecutive bullet lines into a single <ul> for proper list semantics.
  const blocks: { type: "p" | "ul"; items: string[] }[] = [];
  for (const t of paras) {
    const isBullet = t.startsWith("• ");
    const last = blocks[blocks.length - 1];
    if (isBullet && last?.type === "ul") last.items.push(t);
    else blocks.push({ type: isBullet ? "ul" : "p", items: [t] });
  }
  return (
    <section style={{ marginBottom: 22 }}>
      {heading && <h2 style={{ fontSize: 16, color: "var(--ink)", margin: "0 0 10px" }}>{heading}</h2>}
      {blocks.map((b, i) =>
        b.type === "ul" ? (
          <ul key={i} style={{ margin: "0 0 12px", paddingLeft: 22 }}>
            {b.items.map((t, j) => <Paragraph key={j} text={t} />)}
          </ul>
        ) : (
          <Paragraph key={i} text={b.items[0]} />
        ),
      )}
    </section>
  );
}

function AboutMeta() {
  const rows: [string, string][] = [
    ["App name", APP_INFO.appName],
    ["Company", APP_INFO.companyName],
    ["App version", `v${APP_INFO.appVersion}`],
    ["Contact email", APP_INFO.contactEmail],
    ["Website", APP_INFO.website],
  ];
  return (
    <div className="card card-pad" style={{ background: "var(--bg)", marginBottom: 22 }}>
      <table style={{ width: "100%", borderCollapse: "collapse" }}>
        <tbody>
          {rows.map(([k, v]) => (
            <tr key={k}>
              <td style={{ padding: "7px 12px 7px 0", fontWeight: 600, color: "var(--ink-soft)", whiteSpace: "nowrap", verticalAlign: "top", width: 1 }}>{k}</td>
              <td style={{ padding: "7px 0", color: "var(--ink)", overflowWrap: "anywhere" }}>
                {k === "Contact email" ? <a href={`mailto:${v}`}>{v}</a>
                  : k === "Website" ? <a href={v} target="_blank" rel="noreferrer">{v}</a>
                  : v}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function Legal({ docKey }: { docKey?: LegalDoc["key"] }) {
  const params = useParams();
  const nav = useNavigate();
  const key = (docKey || (params.doc as LegalDoc["key"])) ?? "about";
  const doc = LEGAL_DOCS[key];

  if (!doc) {
    return (
      <div className="empty-state">Page not found. <button className="btn btn-ghost btn-sm" onClick={() => nav(-1)}>Go back</button></div>
    );
  }

  return (
    <div>
      <div className="between no-print" style={{ marginBottom: 18, gap: 10, flexWrap: "wrap" }}>
        <div className="row" style={{ gap: 10 }}>
          <button className="btn btn-ghost btn-sm" onClick={() => nav(-1)} title="Go back">← Back</button>
          <h1 className="page-title" style={{ margin: 0 }}>{doc.title}</h1>
        </div>
        <button className="btn btn-ghost btn-sm" onClick={() => window.print()} title="Print or save as PDF">🖨 Print / Save PDF</button>
      </div>

      <div className="card legal-doc" style={{ maxWidth: 860 }}>
        <div className="card-pad" style={{ maxHeight: "calc(100vh - 200px)", overflow: "auto" }}>
          <div className="legal-print-title" style={{ display: "none" }}>
            <h1 style={{ fontSize: 22 }}>{doc.title}</h1>
          </div>
          <div className="muted" style={{ fontSize: 12.5, marginBottom: 18 }}>
            {APP_INFO.appName} · v{APP_INFO.appVersion} &nbsp;·&nbsp; Last updated: <strong>{doc.lastUpdated}</strong>
          </div>

          {doc.intro && (
            <p style={{ margin: "0 0 22px", color: "var(--ink-soft)", lineHeight: 1.7, fontSize: 15 }}>{doc.intro}</p>
          )}

          {doc.key === "about" && <AboutMeta />}
          {doc.key === "about" && (
            <div className="no-print" style={{ marginBottom: 22 }}>
              <button className="btn btn-primary btn-sm" onClick={() => nav("/updates")}>🔄 Check for software updates</button>
            </div>
          )}

          {doc.sections.map((s, i) => <Section key={i} heading={s.h} paras={s.p} />)}

          <div className="muted" style={{ fontSize: 12, marginTop: 26, paddingTop: 14, borderTop: "1px solid var(--border)" }}>
            © {APP_INFO.companyName}. This document is a placeholder and should be reviewed by your legal team before production use.
          </div>
        </div>
      </div>
    </div>
  );
}
