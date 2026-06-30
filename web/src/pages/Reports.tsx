import { useEffect, useState } from "react";
import { api, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Spinner } from "../components/ui";

export default function Reports() {
  const { can } = useAuth();
  const [admin, setAdmin] = useState<any>(null);
  const [mine, setMine] = useState<any>(null);

  useEffect(() => {
    if (can("VIEW_REPORTS")) unwrap(api.get("/reports/admin")).then(setAdmin).catch(() => {});
    unwrap(api.get("/reports/me")).then(setMine).catch(() => {});
  }, []);

  const Bar = ({ label, val, max }: { label: string; val: number; max: number }) => (
    <div style={{ marginBottom: 8 }}>
      <div className="between" style={{ fontSize: 13 }}><span>{label}</span><strong>{val}</strong></div>
      <div style={{ background: "var(--bg)", borderRadius: 4, height: 8 }}>
        <div style={{ width: `${max ? (val / max) * 100 : 0}%`, background: "var(--primary)", height: 8, borderRadius: 4 }} />
      </div>
    </div>
  );

  return (
    <div>
      <h1 className="page-title">Reports</h1>

      {mine && (
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <h3>My Activity</h3>
          <div className="stats" style={{ marginBottom: 0 }}>
            <Stat n={mine.uploaded} l="Uploaded by me" />
            <Stat n={mine.pendingMyApproval} l="Pending my approval" />
            <Stat n={mine.signedByMe} l="Signed by me" />
            <Stat n={mine.rejectedByMe} l="Rejected by me" />
            <Stat n={mine.completed} l="Completed" />
          </div>
        </div>
      )}

      {can("VIEW_REPORTS") && (admin === null ? <Spinner /> : (
        <div className="grid-2">
          <div className="card card-pad">
            <h3>Documents by Status</h3>
            {Object.entries(admin.byStatus || {}).map(([k, v]: any) => (
              <Bar key={k} label={k.replace(/_/g, " ")} val={v} max={admin.uploaded} />
            ))}
          </div>
          <div className="card card-pad">
            <h3>By Profile</h3>
            {admin.byProfile.map((p: any, i: number) => <Bar key={`${p.profile}-${i}`} label={p.profile} val={p.count} max={admin.uploaded} />)}
            <h3 style={{ marginTop: 18 }}>Stamp Usage</h3>
            {admin.stampUsage.map((s: any, i: number) => <Bar key={`${s.stamp}-${i}`} label={s.stamp} val={s.count} max={admin.uploaded} />)}
            {admin.stampUsage.length === 0 && <p className="muted">No stamp usage yet.</p>}
          </div>
          <div className="card card-pad">
            <h3>Top Uploaders</h3>
            {admin.topUploaders.map((u: any, i: number) => <Bar key={`${u.user}-${i}`} label={u.user} val={u.count} max={admin.uploaded} />)}
          </div>
          <div className="card card-pad">
            <h3>Approval Performance</h3>
            <div className="stat"><div className="n">{admin.avgApprovalDelayHours}h</div><div className="l">Avg time to completion</div></div>
            <div className="row" style={{ gap: 24, marginTop: 12 }}>
              <Stat n={admin.completed} l="Completed" />
              <Stat n={admin.rejected} l="Rejected" />
              <Stat n={admin.pendingApprovals} l="Pending" />
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

const Stat = ({ n, l }: { n: number; l: string }) => (
  <div className="stat" style={{ padding: 0 }}><div className="n" style={{ fontSize: 24 }}>{n}</div><div className="l">{l}</div></div>
);
