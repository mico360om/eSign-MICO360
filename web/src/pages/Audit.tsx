import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { DataTable } from "../components/DataTable";

// Turn a raw user-agent into a short, human label (best-effort).
function shortDevice(ua?: string): string {
  if (!ua) return "";
  if (/Electron/i.test(ua)) return "Desktop app";
  const os = /Windows/i.test(ua) ? "Windows" : /Macintosh|Mac OS/i.test(ua) ? "macOS" : /Android/i.test(ua) ? "Android" : /iPhone|iPad|iOS/i.test(ua) ? "iOS" : /Linux/i.test(ua) ? "Linux" : "";
  const browser = /Edg\//i.test(ua) ? "Edge" : /Chrome\//i.test(ua) ? "Chrome" : /Firefox\//i.test(ua) ? "Firefox" : /Safari\//i.test(ua) ? "Safari" : "";
  return [browser, os].filter(Boolean).join(" · ") || ua.slice(0, 24);
}

export default function Audit() {
  const [data, setData] = useState<{ logs: any[]; actions: string[] } | null>(null);
  const [err, setErr] = useState("");
  const [action, setAction] = useState("");
  const [chain, setChain] = useState<any>(null);

  const load = () => {
    setData(null); setErr("");
    unwrap(api.get("/audit")).then(setData).catch((e) => { setErr(apiError(e)); setData({ logs: [], actions: [] }); });
    unwrap(api.get("/audit/verify")).then(setChain).catch(() => setChain(null));
  };
  useEffect(() => { load(); }, []);

  const shown = (data?.logs ?? []).filter((l) => !action || l.action === action);

  const exportCsv = async () => {
    try {
      const res = await api.get("/audit/export", { params: action ? { action } : {}, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url; a.download = `audit-log-${new Date().toISOString().slice(0, 10)}.csv`; a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { setErr(apiError(e)); }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Audit Log</h1>
        <button className="btn btn-ghost" onClick={exportCsv}>⬇ Export CSV</button>
      </div>
      {chain && (
        <div className="card card-pad" style={{ marginBottom: 14, borderLeft: `4px solid ${chain.intact ? "var(--success)" : "var(--danger)"}` }}>
          {chain.intact
            ? <span style={{ color: "var(--success)", fontWeight: 600 }}>🛡 Audit chain verified — {chain.chainedEntries} tamper-evident entries intact</span>
            : <span style={{ color: "var(--danger)", fontWeight: 600 }}>⚠ Audit chain BROKEN at entry #{chain.brokenAtIndex} — possible tampering</span>}
          {chain.legacyUnhashed > 0 && <span className="muted" style={{ marginLeft: 8 }}>({chain.legacyUnhashed} legacy entries predate chaining)</span>}
        </div>
      )}
      <DataTable
        rows={shown}
        loading={data === null}
        error={err}
        onRefresh={load}
        rowKey={(l: any) => l.id}
        searchPlaceholder="Search action, entity, detail…"
        searchValue={(l: any) => `${l.action} ${l.entity ?? ""} ${l.detail ?? ""} ${l.actor?.fullName ?? ""}`}
        filters={[
          { label: "Action", value: action, onChange: setAction, options: [{ label: "All actions", value: "" }, ...(data?.actions ?? []).map((a) => ({ label: a.replace(/_/g, " "), value: a }))] },
        ]}
        pageSize={15}
        emptyText="No audit entries match your search."
        columns={[
          { key: "createdAt", header: "When", value: (l: any) => l.createdAt, render: (l: any) => <span className="muted">{new Date(l.createdAt).toLocaleString()}</span> },
          { key: "actor", header: "Actor", value: (l: any) => l.actor?.fullName ?? "", render: (l: any) => l.actor?.fullName || <span className="muted">System</span> },
          { key: "action", header: "Action", render: (l: any) => <strong>{l.action.replace(/_/g, " ")}</strong> },
          { key: "entity", header: "Entity", render: (l: any) => l.entity || <span className="muted">—</span> },
          { key: "detail", header: "Detail", sortable: false, render: (l: any) => <span className="cell-wrap" style={{ display: "inline-block" }}>{l.detail || "—"}</span> },
          { key: "ip", header: "IP", value: (l: any) => l.ip ?? "", render: (l: any) => <span className="muted" style={{ fontSize: 12 }}>{l.ip || "—"}</span> },
          { key: "device", header: "Device", sortable: false, render: (l: any) => <span className="muted cell-truncate" style={{ display: "inline-block", fontSize: 11, maxWidth: 160 }} title={l.device || ""}>{shortDevice(l.device) || "—"}</span> },
        ]}
      />
    </div>
  );
}
