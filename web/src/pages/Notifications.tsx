import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import { api, unwrap } from "../lib/api";
import { Spinner } from "../components/ui";

export default function Notifications() {
  const [data, setData] = useState<any>(null);
  const [q, setQ] = useState("");
  const [readFilter, setReadFilter] = useState("");

  const load = () => { setData(null); unwrap(api.get("/notifications")).then(setData).catch(() => setData({ notifications: [] })); };
  useEffect(() => { load(); }, []);

  const markAll = async () => { await api.post("/notifications/read-all"); load(); };
  const read = async (id: string) => { await api.post(`/notifications/${id}/read`); load(); };

  if (!data) return <Spinner />;

  const list = (data.notifications as any[]).filter((n) =>
    (!q || `${n.title} ${n.body ?? ""} ${n.type}`.toLowerCase().includes(q.toLowerCase())) &&
    (!readFilter || (readFilter === "unread") === !n.isRead),
  );

  return (
    <div>
      <div className="between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Notifications</h1>
        <button className="btn btn-ghost" onClick={markAll}>Mark all read</button>
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search notifications…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={readFilter} onChange={(e) => setReadFilter(e.target.value)}>
          <option value="">All</option>
          <option value="unread">Unread</option>
          <option value="read">Read</option>
        </select>
        <div className="spacer" />
        {(q || readFilter) && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(""); setReadFilter(""); }}>Clear</button>}
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>
      <div className="card">
        {list.length === 0 && <div className="empty-state">No notifications match your search.</div>}
        {list.map((n: any) => (
          <div key={n.id} className="card-pad" style={{ borderBottom: "1px solid var(--border)", background: n.isRead ? undefined : "var(--primary-soft)" }} onClick={() => read(n.id)}>
            <div className="between">
              <strong>{n.title}</strong>
              <span className="muted" style={{ fontSize: 12 }}>{new Date(n.createdAt).toLocaleString()}</span>
            </div>
            {n.body && <div className="muted">{n.body}</div>}
            {n.link?.startsWith("/documents/") && <Link to={n.link} style={{ fontSize: 13 }}>View document →</Link>}
          </div>
        ))}
      </div>
    </div>
  );
}
