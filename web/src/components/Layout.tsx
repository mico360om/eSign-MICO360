import { ReactNode, useEffect, useState } from "react";
import { NavLink, useLocation, useNavigate } from "react-router-dom";
import { useAuth } from "../lib/auth";
import { api, unwrap } from "../lib/api";

interface NavItem { to: string; label: string; ico: string; perm?: string }
const NAV: NavItem[] = [
  { to: "/", label: "Dashboard", ico: "▦", perm: "VIEW_REPORTS" },
  { to: "/documents", label: "Documents", ico: "📄" },
  { to: "/users", label: "Users", ico: "👤", perm: "MANAGE_USERS" },
  { to: "/profiles", label: "Profiles", ico: "🗂", perm: "MANAGE_PROFILES" },
  { to: "/roles", label: "Roles & Permissions", ico: "🔑", perm: "MANAGE_ROLES" },
  { to: "/signature-groups", label: "Signature Groups", ico: "✍", perm: "MANAGE_SIGNATURE_GROUPS" },
  { to: "/stamps", label: "Company Stamps", ico: "🏷", perm: "MANAGE_STAMPS" },
  { to: "/approval-types", label: "Approval Types", ico: "✅", perm: "MANAGE_SETTINGS" },
  { to: "/reports", label: "Reports", ico: "📊", perm: "VIEW_REPORTS" },
  { to: "/audit", label: "Audit Log", ico: "🛡", perm: "VIEW_REPORTS" },
  { to: "/settings", label: "Settings", ico: "⚙", perm: "MANAGE_SETTINGS" },
];

// Help & Legal — available to every authenticated user (no permission gate).
const HELP_NAV: NavItem[] = [
  { to: "/legal/about", label: "About Us", ico: "ℹ" },
  { to: "/legal/privacy", label: "Privacy Policy", ico: "🔒" },
  { to: "/legal/terms", label: "Terms & Conditions", ico: "📜" },
];

export default function Layout({ children }: { children: ReactNode }) {
  const { me, logout, can } = useAuth();
  const nav = useNavigate();
  const location = useLocation();
  const [unread, setUnread] = useState(0);
  const [drawerOpen, setDrawerOpen] = useState(false);

  useEffect(() => {
    unwrap<{ unread: number }>(api.get("/notifications")).then((d) => setUnread(d.unread)).catch(() => {});
  }, []);
  // Close the mobile drawer whenever the route changes.
  useEffect(() => { setDrawerOpen(false); }, [location.pathname]);

  const items = NAV.filter((n) => !n.perm || can(n.perm));

  return (
    <div className="app">
      <div className={`sidebar-backdrop ${drawerOpen ? "show" : ""}`} onClick={() => setDrawerOpen(false)} />
      <aside className={`sidebar ${drawerOpen ? "open" : ""}`}>
        <div className="logo"><img src="/logo.png" alt="eSign MICO360" /></div>
        <nav className="nav">
          {items.map((n) => (
            <NavLink key={n.to} to={n.to} end={n.to === "/"} className={({ isActive }) => (isActive ? "active" : "")}>
              <span className="ico">{n.ico}</span> {n.label}
            </NavLink>
          ))}
          <div className="nav-section">Help &amp; Legal</div>
          {HELP_NAV.map((n) => (
            <NavLink key={n.to} to={n.to} className={({ isActive }) => (isActive ? "active" : "")}>
              <span className="ico">{n.ico}</span> {n.label}
            </NavLink>
          ))}
        </nav>
        <div style={{ padding: "12px 16px", fontSize: 11, color: "#9a9896", borderTop: "1px solid rgba(255,255,255,0.08)" }}>
          eSign MICO360 · v1.0
        </div>
      </aside>

      <div className="main">
        <header className="topbar">
          <div className="row">
            <button className="hamburger" aria-label="Menu" onClick={() => setDrawerOpen((o) => !o)}>☰</button>
            <button className="btn btn-ghost btn-sm" onClick={() => nav("/notifications")}>
              🔔 <span className="hide-sm">Notifications</span>{unread > 0 ? ` (${unread})` : ""}
            </button>
          </div>
          <div className="row">
            <div style={{ textAlign: "right" }}>
              <div style={{ fontWeight: 600 }}>{me?.fullName}</div>
              <div className="muted" style={{ fontSize: 12 }}>{me?.role}</div>
            </div>
            <button className="btn btn-ghost btn-sm" onClick={logout}>Sign out</button>
          </div>
        </header>
        <main className="content">{children}</main>
      </div>
    </div>
  );
}
