import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { Modal, useToast } from "../components/ui";
import { DataTable } from "../components/DataTable";

// Permission groups for the matrix UI (mirrors server/src/constants.ts)
const PERM_GROUPS = [
  { label: "Documents",           perms: ["UPLOAD", "APPROVE", "SIGN", "REJECT", "DOWNLOAD"] },
  { label: "Stamps & Signatures", perms: ["USE_STAMP"] },
  { label: "Administration",      perms: ["MANAGE_USERS", "MANAGE_PROFILES", "MANAGE_ROLES", "MANAGE_SIGNATURE_GROUPS", "MANAGE_STAMPS", "MANAGE_SETTINGS", "MANAGE_APPROVAL_TYPES"] },
  { label: "Reports & Audit",     perms: ["VIEW_REPORTS", "EXPORT_REPORTS", "VIEW_AUDIT_LOG"] },
];

const PERM_LABELS: Record<string, string> = {
  UPLOAD: "Upload documents",
  APPROVE: "Approve / reject documents",
  SIGN: "Apply signature",
  REJECT: "Reject documents",
  DOWNLOAD: "Download documents",
  USE_STAMP: "Apply company stamp",
  MANAGE_USERS: "Manage users",
  MANAGE_PROFILES: "Manage profiles",
  MANAGE_ROLES: "Manage roles",
  MANAGE_SIGNATURE_GROUPS: "Manage signature groups",
  MANAGE_STAMPS: "Manage stamps",
  MANAGE_SETTINGS: "Manage system settings",
  MANAGE_APPROVAL_TYPES: "Manage approval types",
  VIEW_REPORTS: "View reports & dashboard",
  EXPORT_REPORTS: "Export reports",
  VIEW_AUDIT_LOG: "View audit log",
};

export default function Roles() {
  const toast = useToast();
  const [roles, setRoles] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [perms, setPerms] = useState<string[]>([]);
  const [edit, setEdit] = useState<any>(null);

  const load = () => { setRoles(null); setErr(""); unwrap(api.get("/roles")).then(setRoles).catch((e) => { setErr(apiError(e)); setRoles([]); }); };
  useEffect(() => { load(); unwrap(api.get("/roles/permissions")).then(setPerms).catch(() => {}); }, []);

  return (
    <div>
      <div className="between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Roles & Permissions</h1>
        <button className="btn btn-primary" onClick={() => setEdit({ permissions: [] })}>+ New Role</button>
      </div>
      <DataTable
        rows={roles}
        loading={roles === null}
        error={err}
        onRefresh={load}
        rowKey={(r: any) => r.id}
        searchPlaceholder="Search roles…"
        searchValue={(r: any) => `${r.name} ${r.description ?? ""}`}
        emptyText="No roles match your search."
        columns={[
          { key: "name", header: "Role", render: (r: any) => <><strong>{r.name}</strong>{r.isSystem && <span className="muted"> (system)</span>}</> },
          { key: "description", header: "Description", render: (r: any) => <span className="muted cell-wrap" style={{ display: "inline-block" }}>{r.description}</span> },
          {
            key: "permissions", header: "Permissions", value: (r: any) => r.permissions.length,
            render: (r: any) => (
              <div style={{ display: "flex", flexWrap: "wrap", gap: 4 }}>
                {r.permissions.slice(0, 4).map((p: string) => (
                  <span key={p} className="badge" style={{ background: "var(--primary-soft)", color: "var(--primary)", fontSize: 10 }}>{p.replace(/_/g, " ")}</span>
                ))}
                {r.permissions.length > 4 && <span className="muted" style={{ fontSize: 11 }}>+{r.permissions.length - 4} more</span>}
              </div>
            )
          },
          { key: "users", header: "Users", value: (r: any) => r._count?.users ?? 0, render: (r: any) => r._count?.users ?? 0 },
          { key: "actions", header: "Actions", sortable: false, className: "actions-cell", render: (r: any) => <button className="btn btn-ghost btn-sm" onClick={() => setEdit(r)}>Edit</button> },
        ]}
      />
      {edit && <RoleModal role={edit} allPerms={perms} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); toast("Saved"); }} onError={(m: string) => toast(m, true)} />}
    </div>
  );
}

function RoleModal({ role, allPerms, onClose, onDone, onError }: any) {
  const isNew = !role.id;
  const [name, setName] = useState(role.name || "");
  const [description, setDescription] = useState(role.description || "");
  const [permissions, setPermissions] = useState<string[]>(role.permissions || []);

  const toggle = (p: string) => setPermissions(permissions.includes(p) ? permissions.filter((x: string) => x !== p) : [...permissions, p]);
  const toggleGroup = (groupPerms: string[]) => {
    const allOn = groupPerms.every((p) => permissions.includes(p));
    setPermissions(allOn ? permissions.filter((p) => !groupPerms.includes(p)) : [...new Set([...permissions, ...groupPerms])]);
  };

  const save = async () => {
    if (!name.trim()) return onError("Name is required");
    try {
      if (isNew) await api.post("/roles", { name: name.trim(), description, permissions });
      else await api.patch(`/roles/${role.id}`, { name: name.trim(), description, permissions });
      onDone();
    } catch (e) { onError(apiError(e)); }
  };

  return (
    <Modal title={isNew ? "New Role" : `Edit — ${role.name}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="field"><label>Role name</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
      <div className="field"><label>Description</label><input value={description} onChange={(e) => setDescription(e.target.value)} /></div>

      <div className="field">
        <label>Permissions</label>
        <div style={{ display: "flex", flexDirection: "column", gap: 16, marginTop: 8 }}>
          {PERM_GROUPS.map((group) => {
            const allOn = group.perms.every((p) => permissions.includes(p));
            const someOn = !allOn && group.perms.some((p) => permissions.includes(p));
            const knownPerms = group.perms.filter((p) => allPerms.includes(p));
            if (knownPerms.length === 0) return null;
            return (
              <div key={group.label} style={{ border: "1px solid var(--border)", borderRadius: "var(--radius-sm)", overflow: "hidden" }}>
                <div
                  style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 12px", background: "var(--bg)", cursor: "pointer", borderBottom: "1px solid var(--border)" }}
                  onClick={() => toggleGroup(knownPerms)}
                >
                  <input type="checkbox" checked={allOn} ref={(el) => { if (el) el.indeterminate = someOn; }} onChange={() => toggleGroup(knownPerms)} onClick={(e) => e.stopPropagation()} style={{ width: "auto" }} />
                  <strong style={{ fontSize: 13 }}>{group.label}</strong>
                  <span className="muted" style={{ fontSize: 11, marginLeft: "auto" }}>{knownPerms.filter((p) => permissions.includes(p)).length}/{knownPerms.length}</span>
                </div>
                <div style={{ padding: "8px 12px", display: "flex", flexDirection: "column", gap: 6 }}>
                  {knownPerms.map((p) => (
                    <label key={p} style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, cursor: "pointer" }}>
                      <input type="checkbox" checked={permissions.includes(p)} onChange={() => toggle(p)} style={{ width: "auto" }} />
                      <span>{PERM_LABELS[p] || p.replace(/_/g, " ").toLowerCase()}</span>
                    </label>
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </Modal>
  );
}
