import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Spinner, useToast } from "../components/ui";

const SOURCE_COLOR: Record<string, string> = { server: "var(--danger)", client: "var(--info)", desktop: "var(--warning)" };

export default function ErrorLog() {
  const { can } = useAuth();
  const toast = useToast();
  const [data, setData] = useState<{ reports: any[]; openCount: number; total: number } | null>(null);
  const [filter, setFilter] = useState<"false" | "true" | "all">("false");
  const [expanded, setExpanded] = useState<string | null>(null);

  const load = () => {
    setData(null);
    unwrap<any>(api.get("/error-reports", { params: filter === "all" ? {} : { resolved: filter } }))
      .then(setData).catch((e) => { toast(apiError(e), true); setData({ reports: [], openCount: 0, total: 0 }); });
  };
  useEffect(() => { load(); }, [filter]);

  const toggleResolved = async (r: any) => {
    try { await api.patch(`/error-reports/${r.id}`, { resolved: !r.resolved }); load(); }
    catch (e) { toast(apiError(e), true); }
  };
  const clearResolved = async () => {
    if (!confirm("Delete all resolved reports?")) return;
    try { const r = await unwrap<{ deleted: number }>(api.post("/error-reports/clear-resolved", {})); toast(`Deleted ${r.deleted}`); load(); }
    catch (e) { toast(apiError(e), true); }
  };
  const exportCsv = async () => {
    try {
      const res = await api.get("/error-reports/export", { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a"); a.href = url; a.download = `error-reports-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { toast(apiError(e), true); }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 18, flexWrap: "wrap", gap: 8 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Error Log {data && <span className="muted" style={{ fontSize: 14, fontWeight: 400 }}>· {data.openCount} open</span>}</h1>
        <div className="row" style={{ gap: 8 }}>
          <select value={filter} onChange={(e) => setFilter(e.target.value as any)}>
            <option value="false">Open</option>
            <option value="true">Resolved</option>
            <option value="all">All</option>
          </select>
          <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
          <button className="btn btn-ghost btn-sm" onClick={exportCsv}>⬇ Export CSV</button>
          {can("MANAGE_SETTINGS") && <button className="btn btn-ghost btn-sm" onClick={clearResolved}>Clear resolved</button>}
        </div>
      </div>

      {!data ? <Spinner /> : data.reports.length === 0 ? (
        <div className="card"><div className="empty-state">🎉 No {filter === "false" ? "open " : ""}error reports.</div></div>
      ) : (
        <div className="card">
          {data.reports.map((r) => (
            <div key={r.id} className="card-pad" style={{ borderBottom: "1px solid var(--border)" }}>
              <div className="between" style={{ gap: 10, flexWrap: "wrap" }}>
                <div style={{ minWidth: 0, flex: 1 }}>
                  <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
                    <span className="badge" style={{ background: SOURCE_COLOR[r.source] || "var(--muted)", fontSize: 10 }}>{r.source}{r.status ? ` ${r.status}` : ""}</span>
                    <strong className="cell-wrap" style={{ display: "inline-block" }}>{r.message}</strong>
                  </div>
                  <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>
                    {new Date(r.createdAt).toLocaleString()}
                    {r.userEmail && <> · {r.userEmail}</>}
                    {(r.method || r.url) && <> · {r.method} {r.url}</>}
                    {r.appVersion && <> · v{r.appVersion}</>}
                  </div>
                </div>
                <div className="row" style={{ gap: 6 }}>
                  {r.stack && <button className="btn btn-ghost btn-sm" onClick={() => setExpanded(expanded === r.id ? null : r.id)}>{expanded === r.id ? "Hide" : "Stack"}</button>}
                  <button className={`btn btn-sm ${r.resolved ? "btn-ghost" : "btn-primary"}`} onClick={() => toggleResolved(r)}>{r.resolved ? "Reopen" : "Resolve"}</button>
                </div>
              </div>
              {expanded === r.id && r.stack && (
                <pre style={{ whiteSpace: "pre-wrap", fontSize: 11.5, background: "var(--bg)", border: "1px solid var(--border)", borderRadius: 6, padding: "10px 12px", marginTop: 8, maxHeight: 260, overflow: "auto" }}>{r.stack}</pre>
              )}
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
