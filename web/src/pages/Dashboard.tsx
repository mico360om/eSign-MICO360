import { useEffect, useState } from "react";
import { Link, useNavigate } from "react-router-dom";
import { api, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Spinner, StatusBadge } from "../components/ui";
import { DocThumb } from "../components/DocThumb";

// ── Tiny pure-SVG charts ──────────────────────────────────────────────────

function BarChart({ data, label }: { data: { month: string; count: number }[]; label: string }) {
  const max = Math.max(...data.map((d) => d.count), 1);
  const H = 80, W = 240, pad = 4;
  const barW = (W - pad * (data.length + 1)) / Math.max(data.length, 1);
  return (
    <div>
      <div className="muted" style={{ fontSize: 11, marginBottom: 4 }}>{label}</div>
      <svg viewBox={`0 0 ${W} ${H + 20}`} style={{ width: "100%", maxWidth: W, display: "block" }}>
        {data.map((d, i) => {
          const barH = Math.max(4, (d.count / max) * H);
          const x = pad + i * (barW + pad);
          const y = H - barH;
          return (
            <g key={d.month}>
              <rect x={x} y={y} width={barW} height={barH} rx={2} fill="var(--primary)" opacity={0.75} />
              <text x={x + barW / 2} y={H + 13} textAnchor="middle" fontSize={8} fill="var(--muted)">{d.month.slice(5)}</text>
              {d.count > 0 && <text x={x + barW / 2} y={y - 2} textAnchor="middle" fontSize={8} fill="var(--primary)" fontWeight="700">{d.count}</text>}
            </g>
          );
        })}
      </svg>
    </div>
  );
}

function DonutChart({ data }: { data: Record<string, number> }) {
  const COLORS: Record<string, string> = {
    COMPLETED: "#2e7d32", PENDING_APPROVAL: "#c77700", PARTIALLY_APPROVED: "#e65100",
    PENDING_SIGNATURE: "#f9a825", REJECTED: "#b3261e", DRAFT: "#8a8c8a",
    UPLOADED: "#1565c0", PDF_CONVERTED: "#1565c0", CANCELLED: "#78909c",
  };
  const entries = Object.entries(data).filter(([, v]) => v > 0);
  const total = entries.reduce((s, [, v]) => s + v, 0);
  if (total === 0) return <div className="muted" style={{ fontSize: 12 }}>No documents yet.</div>;
  const R = 40, r = 24, cx = 50, cy = 50;
  let angle = -Math.PI / 2;
  const slices = entries.map(([status, count]) => {
    const sweep = (count / total) * 2 * Math.PI;
    const x1 = cx + R * Math.cos(angle), y1 = cy + R * Math.sin(angle);
    angle += sweep;
    const x2 = cx + R * Math.cos(angle), y2 = cy + R * Math.sin(angle);
    const xi1 = cx + r * Math.cos(angle - sweep), yi1 = cy + r * Math.sin(angle - sweep);
    const xi2 = cx + r * Math.cos(angle), yi2 = cy + r * Math.sin(angle);
    const large = sweep > Math.PI ? 1 : 0;
    return { status, count, path: `M${x1},${y1} A${R},${R},0,${large},1,${x2},${y2} L${xi2},${yi2} A${r},${r},0,${large},0,${xi1},${yi1} Z`, color: COLORS[status] || "#8a8c8a" };
  });
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
      <svg viewBox="0 0 100 100" style={{ width: 80, flexShrink: 0 }}>
        {slices.map((s) => <path key={s.status} d={s.path} fill={s.color} />)}
        <text x={cx} y={cy + 4} textAnchor="middle" fontSize={10} fontWeight="700" fill="var(--ink)">{total}</text>
      </svg>
      <div style={{ fontSize: 11, lineHeight: 1.8 }}>
        {slices.map((s) => (
          <div key={s.status} style={{ display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 8, height: 8, borderRadius: "50%", background: s.color, flexShrink: 0, display: "inline-block" }} />
            <span className="muted">{s.status.replace(/_/g, " ")} — <strong style={{ color: "var(--ink)" }}>{s.count}</strong></span>
          </div>
        ))}
      </div>
    </div>
  );
}

// ── Activity filter helpers ───────────────────────────────────────────────

const ACTION_COLORS: Record<string, string> = {
  UPLOAD_DOCUMENT: "#1565c0", SUBMIT_DOCUMENT: "#c77700", APPROVE_DOCUMENT: "#2e7d32",
  REJECT_DOCUMENT: "#b3261e", SIGN_DOCUMENT: "#2e7d32", CANCEL_DOCUMENT: "#8a8c8a",
  CREATE_USER: "#6a1b9a", UPDATE_USER: "#6a1b9a", FAILED_LOGIN: "#b3261e",
};
const ACTION_GROUPS = [
  { label: "All", value: "" },
  { label: "Documents", value: "UPLOAD_DOCUMENT,SUBMIT_DOCUMENT,APPROVE_DOCUMENT,REJECT_DOCUMENT,SIGN_DOCUMENT,CANCEL_DOCUMENT" },
  { label: "Users", value: "CREATE_USER,UPDATE_USER,FAILED_LOGIN" },
];
const TIME_FILTERS = [{ label: "Today", value: "today" }, { label: "This Week", value: "week" }, { label: "All", value: "all" }];
function isWithin(d: string, f: string) {
  const t = Date.now() - new Date(d).getTime();
  if (f === "today") return t < 86_400_000;
  if (f === "week") return t < 7 * 86_400_000;
  return true;
}

// ── Dashboard component ───────────────────────────────────────────────────

export default function Dashboard() {
  const { can } = useAuth();
  const [d, setD] = useState<any>(null);
  const [activityTime, setActivityTime] = useState("today");
  const [activityGroup, setActivityGroup] = useState("");
  const nav = useNavigate();

  useEffect(() => {
    const loadDash = async () => {
      try {
        const personal = await unwrap(api.get("/dashboard/me"));
        try {
          const admin = await unwrap(api.get("/dashboard"));
          setD({ personal, ...admin });
        } catch {
          // Non-admin: no access to admin dashboard
          setD({ personal, cards: null, recentDocs: [], recentActivity: [], monthlyUploads: [], avgApprovalHours: null, statusBreakdown: {} });
        }
      } catch {
        setD(false);
      }
    };
    loadDash();
  }, []);

  if (d === null) return <Spinner />;
  if (d === false) return <p className="muted">Dashboard unavailable.</p>;

  const p = d.personal;
  const isAdmin = !!d.cards;

  // ── Personal cards ────────────────────────────────────────────────
  const personalCards = [
    { n: p.pendingMyApproval, l: "Pending My Approval", link: "/documents", accent: p.pendingMyApproval > 0 ? "var(--warning)" : "var(--success)" },
    { n: p.myDocsPending,     l: "Pending Others",      link: "/documents", accent: p.myDocsPending > 0 ? "var(--warning)" : "var(--success)" },
    { n: p.overdueApprovals,  l: "Overdue Approvals",   link: "/documents", accent: p.overdueApprovals > 0 ? "var(--danger)" : "var(--success)" },
    { n: p.completedThisMonth, l: "Completed This Month", link: "/documents", accent: "var(--success)" },
  ];

  // ── Admin cards ───────────────────────────────────────────────────
  const adminCards = isAdmin ? [
    { n: d.cards.totalUsers,       l: "Total Users",        link: "/users",     accent: "var(--ink)" },
    { n: d.cards.activeUsers,      l: "Active Users",       link: "/users",     accent: "var(--success)" },
    { n: d.cards.inactiveUsers,    l: "Inactive Users",     link: "/users",     accent: "var(--muted)" },
    { n: d.cards.totalProfiles,    l: "Companies",          link: "/profiles",  accent: "var(--ink)" },
    { n: d.cards.totalDocuments,   l: "Total Documents",    link: "/documents", accent: "var(--primary)" },
    { n: d.cards.pendingApprovals, l: "Pending Approvals",  link: "/documents", accent: "var(--warning)" },
    { n: d.cards.completed,        l: "Completed",          link: "/documents", accent: "var(--success)" },
    { n: d.cards.rejected,         l: "Rejected",           link: "/documents", accent: "var(--danger)" },
  ] : [];

  const filteredActivity = (d.recentActivity || []).filter((a: any) => {
    const inTime = isWithin(a.createdAt, activityTime);
    const inGroup = !activityGroup || activityGroup.split(",").includes(a.action);
    return inTime && inGroup;
  });

  const avgH = d.avgApprovalHours;
  const avgLabel = avgH == null ? "—" : avgH < 1 ? `${Math.round(avgH * 60)}m` : `${avgH.toFixed(1)}h`;

  return (
    <div>
      <h1 className="page-title">Dashboard</h1>

      {/* ── Personal cards ── */}
      <div style={{ marginBottom: 8 }}>
        <div className="section-title">My Activity</div>
        <div className="stats" style={{ marginBottom: 18 }}>
          {personalCards.map((c) => (
            <div key={c.l} className="card stat" style={{ cursor: "pointer", borderLeft: `3px solid ${c.accent}` }} onClick={() => nav(c.link)} title={c.l}>
              <div className="n" style={{ color: c.accent }}>{c.n}</div>
              <div className="l">{c.l}</div>
            </div>
          ))}
        </div>
      </div>

      {/* ── Admin cards ── */}
      {isAdmin && (
        <div style={{ marginBottom: 22 }}>
          <div className="section-title">System Overview</div>
          <div className="stats">
            {adminCards.map((c) => (
              <div key={c.l} className="card stat" style={{ cursor: "pointer", borderLeft: `3px solid ${c.accent}` }} onClick={() => nav(c.link)} title={c.l}>
                <div className="n" style={{ color: c.accent }}>{c.n}</div>
                <div className="l">{c.l}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* ── Main grid: Recent Docs + Activity ── */}
      {isAdmin && (
        <div className="grid-main" style={{ marginBottom: 18 }}>
          {/* Recent Documents */}
          <div className="card card-pad">
            <div className="between" style={{ marginBottom: 12 }}>
              <h3 style={{ margin: 0 }}>Recent Documents</h3>
              <Link to="/documents" style={{ fontSize: 13 }}>View all →</Link>
            </div>
            <div className="table-wrap">
            <table className="table">
              <thead>
                <tr><th></th><th>Title</th><th>Status</th><th>Current Approver</th><th>Pending Since</th><th>Next Action</th></tr>
              </thead>
              <tbody>
                {(d.recentDocs as any[]).map((doc: any) => {
                  const pendingStep = doc.steps?.[0];
                  const isPending = ["PENDING_APPROVAL", "PARTIALLY_APPROVED", "PENDING_SIGNATURE"].includes(doc.status);
                  const pendingDays = isPending ? Math.round((Date.now() - new Date(doc.updatedAt).getTime()) / 86_400_000) : null;
                  const nextAction =
                    doc.status === "PDF_CONVERTED" ? "Submit for approval" :
                    doc.status === "PENDING_APPROVAL" || doc.status === "PARTIALLY_APPROVED" ? "Awaiting approval" :
                    doc.status === "PENDING_SIGNATURE" ? "Awaiting signature" :
                    doc.status === "APPROVED" ? "Ready to finalize" :
                    doc.status === "COMPLETED" ? "Done" :
                    doc.status === "REJECTED" ? "Review needed" : "—";
                  return (
                    <tr key={doc.id} style={{ cursor: "pointer" }} onClick={() => nav(`/documents/${doc.id}`)}>
                      <td style={{ width: 44 }}><DocThumb docId={doc.id} kind={doc.status === "COMPLETED" ? "final" : "converted"} size={36} /></td>
                      <td>
                        <strong style={{ display: "block" }}>{doc.title}</strong>
                        <span className="muted" style={{ fontSize: 11 }}>{doc.profile?.name} · {doc.uploadedBy?.fullName}</span>
                      </td>
                      <td><StatusBadge status={doc.status} /></td>
                      <td style={{ fontSize: 12 }}>
                        {pendingStep?.signatory?.fullName
                          ? <span style={{ color: "var(--warning)" }}>{pendingStep.signatory.fullName}</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td style={{ fontSize: 12 }}>
                        {pendingDays != null
                          ? <span style={{ color: pendingDays > 3 ? "var(--danger)" : "var(--warning)" }}>{pendingDays === 0 ? "Today" : `${pendingDays}d ago`}</span>
                          : <span className="muted">—</span>}
                      </td>
                      <td style={{ fontSize: 11, color: "var(--muted)" }}>{nextAction}</td>
                    </tr>
                  );
                })}
                {d.recentDocs.length === 0 && <tr><td colSpan={6} className="muted" style={{ textAlign: "center", padding: 24 }}>No documents yet.</td></tr>}
              </tbody>
            </table>
            </div>
          </div>

          {/* Recent Activity */}
          <div className="card card-pad" style={{ display: "flex", flexDirection: "column" }}>
            <div className="between" style={{ marginBottom: 10 }}>
              <h3 style={{ margin: 0 }}>Recent Activity</h3>
            </div>
            <div className="row" style={{ gap: 6, marginBottom: 10, flexWrap: "wrap" }}>
              {TIME_FILTERS.map((f) => (
                <button key={f.value} className={`btn btn-sm ${activityTime === f.value ? "btn-primary" : "btn-ghost"}`} onClick={() => setActivityTime(f.value)}>{f.label}</button>
              ))}
              <select value={activityGroup} onChange={(e) => setActivityGroup(e.target.value)} style={{ fontSize: 12, padding: "4px 8px", marginLeft: 4 }}>
                {ACTION_GROUPS.map((g) => <option key={g.value} value={g.value}>{g.label}</option>)}
              </select>
            </div>
            <ul style={{ listStyle: "none", padding: 0, margin: 0, flex: 1, overflowY: "auto", maxHeight: 360 }}>
              {filteredActivity.map((a: any) => (
                <li key={a.id} style={{ padding: "7px 0", borderBottom: "1px solid var(--border)", fontSize: 12 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                    <span style={{ width: 6, height: 6, borderRadius: "50%", background: ACTION_COLORS[a.action] || "var(--muted)", marginTop: 5, flexShrink: 0 }} />
                    <div>
                      <strong>{a.actor?.fullName || "System"}</strong>
                      <span className="muted"> · {a.action.replace(/_/g, " ").toLowerCase()}</span>
                      <div className="muted" style={{ fontSize: 10, marginTop: 2 }}>{new Date(a.createdAt).toLocaleString()}</div>
                    </div>
                  </div>
                </li>
              ))}
              {filteredActivity.length === 0 && <li className="muted" style={{ padding: "20px 0", textAlign: "center", fontSize: 12 }}>No activity for this filter.</li>}
            </ul>
          </div>
        </div>
      )}

      {/* ── Charts row ── */}
      {isAdmin && (
        <div className="grid-3">
          <div className="card card-pad">
            <h3 style={{ margin: "0 0 14px" }}>Monthly Uploads</h3>
            {d.monthlyUploads?.length > 0
              ? <BarChart data={d.monthlyUploads} label="Uploads per month (last 6 months)" />
              : <div className="muted" style={{ fontSize: 12 }}>No upload data yet.</div>}
          </div>
          <div className="card card-pad">
            <h3 style={{ margin: "0 0 14px" }}>Document Status</h3>
            <DonutChart data={d.statusBreakdown || {}} />
          </div>
          <div className="card card-pad">
            <h3 style={{ margin: "0 0 14px" }}>Approval Metrics</h3>
            <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--primary)", lineHeight: 1 }}>{avgLabel}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Avg. approval time</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: d.cards.pendingApprovals > 0 ? "var(--warning)" : "var(--success)", lineHeight: 1 }}>{d.cards.pendingApprovals}</div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Documents pending right now</div>
              </div>
              <div>
                <div style={{ fontSize: 28, fontWeight: 700, color: "var(--ink)", lineHeight: 1 }}>
                  {d.cards.totalDocuments > 0 ? Math.round((d.cards.completed / d.cards.totalDocuments) * 100) : 0}%
                </div>
                <div className="muted" style={{ fontSize: 12, marginTop: 4 }}>Completion rate</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
