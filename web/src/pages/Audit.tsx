import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { DataTable } from "../components/DataTable";

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

  return (
    <div>
      <h1 className="page-title">Audit Log</h1>
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
        ]}
      />
    </div>
  );
}
