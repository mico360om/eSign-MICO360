import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { Modal, useToast } from "../components/ui";
import { DataTable } from "../components/DataTable";

export default function Users() {
  const toast = useToast();
  const [users, setUsers] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [roles, setRoles] = useState<any[]>([]);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [edit, setEdit] = useState<any>(null);
  const [resetFor, setResetFor] = useState<any>(null);
  const [roleFilter, setRoleFilter] = useState("");
  const [statusFilter, setStatusFilter] = useState("");

  const load = () => { setUsers(null); setErr(""); unwrap(api.get("/users")).then(setUsers).catch((e) => { setErr(apiError(e)); setUsers([]); }); };
  useEffect(() => {
    load();
    unwrap(api.get("/roles")).then(setRoles).catch(() => {});
    unwrap(api.get("/profiles")).then(setProfiles).catch(() => {});
  }, []);

  const toggleActive = async (u: any) => {
    try { await api.post(`/users/${u.id}/activate`, { isActive: !u.isActive }); toast(u.isActive ? "Deactivated" : "Activated"); load(); }
    catch (e) { toast(apiError(e), true); }
  };

  const forcePasswordChange = async (u: any) => {
    try { await api.patch(`/users/${u.id}`, { forcePasswordChange: true }); toast("User will be prompted to change password on next login"); load(); }
    catch (e) { toast(apiError(e), true); }
  };

  const shown = (users ?? []).filter((u) =>
    (!roleFilter || u.role?.name === roleFilter) &&
    (!statusFilter || (statusFilter === "active") === !!u.isActive),
  );

  return (
    <div>
      <div className="between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Users</h1>
        <button className="btn btn-primary" onClick={() => setEdit({})}>+ Add User</button>
      </div>
      <DataTable
        rows={shown}
        loading={users === null}
        error={err}
        onRefresh={load}
        rowKey={(u: any) => u.id}
        searchPlaceholder="Search name, email, department…"
        searchValue={(u: any) => `${u.fullName} ${u.email} ${u.username ?? ""} ${u.department ?? ""} ${u.designation ?? ""}`}
        filters={[
          { label: "Role", value: roleFilter, onChange: setRoleFilter, options: [{ label: "All roles", value: "" }, ...roles.map((r) => ({ label: r.name, value: r.name }))] },
          { label: "Status", value: statusFilter, onChange: setStatusFilter, options: [{ label: "All statuses", value: "" }, { label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }] },
        ]}
        emptyText="No users match your search."
        columns={[
          { key: "fullName", header: "Name", render: (u: any) => (
            <div>
              <strong className="cell-truncate" style={{ display: "block" }}>{u.fullName}</strong>
              {(u.department || u.designation) && <span className="muted" style={{ fontSize: 11 }}>{[u.designation, u.department].filter(Boolean).join(" · ")}</span>}
            </div>
          ) },
          { key: "email", header: "Email", render: (u: any) => <span className="cell-truncate" style={{ display: "inline-block", fontSize: 13 }}>{u.email}</span> },
          { key: "role", header: "Role", value: (u: any) => u.role?.name ?? "", render: (u: any) => u.role?.name || <span className="muted">—</span> },
          { key: "profiles", header: "Companies", value: (u: any) => u._count?.profileLinks ?? 0, render: (u: any) => u._count?.profileLinks ?? 0 },
          { key: "lastLoginAt", header: "Last Login", value: (u: any) => u.lastLoginAt ?? "", render: (u: any) => u.lastLoginAt ? <span className="muted" style={{ fontSize: 12 }}>{new Date(u.lastLoginAt).toLocaleDateString()}</span> : <span className="muted">Never</span> },
          { key: "createdAt", header: "Created", value: (u: any) => u.createdAt, render: (u: any) => <span className="muted" style={{ fontSize: 12 }}>{new Date(u.createdAt).toLocaleDateString()}</span> },
          { key: "isActive", header: "Status", value: (u: any) => (u.isActive ? 1 : 0), render: (u: any) => (
            <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
              <span className="badge" style={{ background: u.isActive ? "var(--success)" : "var(--muted)" }}>{u.isActive ? "Active" : "Inactive"}</span>
              {u.forcePasswordChange && <span className="badge" style={{ background: "var(--warning)", fontSize: 10 }}>PW Reset Req.</span>}
            </div>
          ) },
          {
            key: "actions", header: "Actions", sortable: false, className: "actions-cell",
            render: (u: any) => (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdit(u)}>Edit</button>{" "}
                <button className="btn btn-ghost btn-sm" onClick={() => toggleActive(u)}>{u.isActive ? "Deactivate" : "Activate"}</button>{" "}
                <button className="btn btn-ghost btn-sm" onClick={() => setResetFor(u)}>Reset PW</button>{" "}
                <button className="btn btn-ghost btn-sm" title="Force user to change password on next login" onClick={() => forcePasswordChange(u)}>Force PW</button>
              </>
            ),
          },
        ]}
      />
      {edit && <UserModal user={edit} roles={roles} profiles={profiles} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); toast("Saved"); }} onError={(m: string) => toast(m, true)} />}
      {resetFor && <ResetPasswordModal user={resetFor} onClose={() => setResetFor(null)} onDone={() => { setResetFor(null); toast("Password reset"); }} onError={(m: string) => toast(m, true)} />}
    </div>
  );
}

function ResetPasswordModal({ user, onClose, onDone, onError }: any) {
  const [pw, setPw] = useState("");
  const [confirm, setConfirm] = useState("");
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (pw.length < 8) return onError("Password must be at least 8 characters (incl. upper, lower & number)");
    if (pw !== confirm) return onError("Passwords do not match");
    setBusy(true);
    try { await api.post(`/users/${user.id}/reset-password`, { newPassword: pw }); onDone(); }
    catch (e) { onError(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal title={`Reset password — ${user.fullName}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Resetting…" : "Reset Password"}</button></>}>
      <div className="field"><label>New password</label><input type="password" autoFocus value={pw} onChange={(e) => setPw(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
      <div className="field"><label>Confirm new password</label><input type="password" value={confirm} onChange={(e) => setConfirm(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
    </Modal>
  );
}

function UserModal({ user, roles, profiles, onClose, onDone, onError }: any) {
  const isNew = !user.id;
  const [f, setF] = useState({
    fullName: user.fullName || "",
    email: user.email || "",
    password: "",
    phone: user.phone || "",
    department: user.department || "",
    designation: user.designation || "",
    roleId: user.role?.id || "",
  });
  const [profileIds, setProfileIds] = useState<string[]>(user.profileLinks?.map((l: any) => l.profile.id) || []);
  const [busy, setBusy] = useState(false);

  const save = async () => {
    if (!f.fullName.trim()) return onError("Full name is required");
    if (isNew && !f.email.trim()) return onError("Email is required");
    if (isNew && !f.password) return onError("Password is required");
    setBusy(true);
    try {
      let id = user.id;
      if (isNew) {
        const created = await unwrap(api.post("/users", { ...f, fullName: f.fullName.trim(), profileIds }));
        id = created.id;
      } else {
        await api.patch(`/users/${id}`, { fullName: f.fullName.trim(), phone: f.phone, department: f.department, designation: f.designation, roleId: f.roleId || null });
        await api.put(`/users/${id}/profiles`, { profileIds });
      }
      onDone();
    } catch (e) { onError(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal title={isNew ? "Add User" : "Edit User"} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
      <div className="form-grid">
        <div className="field"><label>Full name</label><input autoFocus value={f.fullName} onChange={(e) => setF({ ...f, fullName: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
        <div className="field"><label>Email</label><input value={f.email} disabled={!isNew} onChange={(e) => setF({ ...f, email: e.target.value })} /></div>
        {isNew && <div className="field"><label>Password</label><input type="password" value={f.password} onChange={(e) => setF({ ...f, password: e.target.value })} /></div>}
        <div className="field"><label>Phone</label><input value={f.phone} onChange={(e) => setF({ ...f, phone: e.target.value })} /></div>
        <div className="field"><label>Department</label><input value={f.department} placeholder="e.g. Finance" onChange={(e) => setF({ ...f, department: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
        <div className="field"><label>Designation / Title</label><input value={f.designation} placeholder="e.g. Manager" onChange={(e) => setF({ ...f, designation: e.target.value })} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
      </div>
      <div className="field"><label>Role</label>
        <select value={f.roleId} onChange={(e) => setF({ ...f, roleId: e.target.value })}>
          <option value="">— none —</option>
          {roles.map((r: any) => <option key={r.id} value={r.id}>{r.name}</option>)}
        </select>
      </div>
      <div className="field"><label>Companies</label>
        <div className="checklist">
          {profiles.map((p: any) => (
            <label key={p.id}><input type="checkbox" checked={profileIds.includes(p.id)} onChange={(e) => setProfileIds(e.target.checked ? [...profileIds, p.id] : profileIds.filter((x) => x !== p.id))} /> {p.name}</label>
          ))}
        </div>
      </div>
    </Modal>
  );
}
