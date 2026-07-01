import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { Modal, useToast } from "../components/ui";
import { DataTable } from "../components/DataTable";

export default function Profiles() {
  const toast = useToast();
  const [profiles, setProfiles] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [users, setUsers] = useState<any[]>([]);
  const [create, setCreate] = useState(false);
  const [edit, setEdit] = useState<any>(null); // profile being edited
  const [members, setMembers] = useState<any>(null); // profile whose members are being edited
  const [thumbFor, setThumbFor] = useState<any>(null);
  const [statusFilter, setStatusFilter] = useState("");

  const load = () => { setProfiles(null); setErr(""); unwrap(api.get("/profiles")).then(setProfiles).catch((e) => { setErr(apiError(e)); setProfiles([]); }); };
  useEffect(() => { load(); unwrap(api.get("/users")).then(setUsers).catch(() => {}); }, []);

  const shown = (profiles ?? []).filter((p) => !statusFilter || (statusFilter === "active") === !!p.isActive);

  return (
    <div>
      <div className="between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Companies</h1>
        <button className="btn btn-primary" onClick={() => setCreate(true)}>+ New Company</button>
      </div>
      <DataTable
        rows={shown}
        loading={profiles === null}
        error={err}
        onRefresh={load}
        rowKey={(p: any) => p.id}
        searchPlaceholder="Search companies…"
        searchValue={(p: any) => `${p.name} ${p.description ?? ""}`}
        filters={[{ label: "Status", value: statusFilter, onChange: setStatusFilter, options: [{ label: "All statuses", value: "" }, { label: "Active", value: "active" }, { label: "Inactive", value: "inactive" }] }]}
        emptyText="No companies match your search."
        columns={[
          { key: "thumb", header: "", sortable: false, render: (p: any) => <ProfileThumb profile={p} /> },
          { key: "name", header: "Name", render: (p: any) => <strong>{p.name}</strong> },
          { key: "description", header: "Description", render: (p: any) => <span className="muted cell-wrap" style={{ display: "inline-block" }}>{p.description}</span> },
          { key: "members", header: "Members", value: (p: any) => p._count?.members ?? 0, render: (p: any) => p._count?.members ?? 0 },
          { key: "documents", header: "Documents", value: (p: any) => p._count?.documents ?? 0, render: (p: any) => p._count?.documents ?? 0 },
          { key: "isActive", header: "Status", value: (p: any) => (p.isActive ? 1 : 0), render: (p: any) => <span className="badge" style={{ background: p.isActive ? "var(--success)" : "var(--muted)" }}>{p.isActive ? "Active" : "Inactive"}</span> },
          {
            key: "actions", header: "Actions", sortable: false, className: "actions-cell",
            render: (p: any) => (
              <>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdit(p)}>Edit</button>{" "}
                <button className="btn btn-ghost btn-sm" onClick={() => setMembers(p)}>Members</button>{" "}
                <button className="btn btn-ghost btn-sm" onClick={() => setThumbFor(p)}>Image</button>{" "}
                <button className="btn btn-ghost btn-sm" onClick={() => api.patch(`/profiles/${p.id}`, { isActive: !p.isActive }).then(load).catch((e: any) => toast(apiError(e), true))}>{p.isActive ? "Deactivate" : "Activate"}</button>
              </>
            ),
          },
        ]}
      />
      {create && <CreateModal onClose={() => setCreate(false)} onDone={() => { setCreate(false); load(); toast("Company created"); }} onError={(m: string) => toast(m, true)} />}
      {edit && <EditModal profile={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); toast("Company updated"); }} onError={(m: string) => toast(m, true)} />}
      {members && <MembersModal profile={members} users={users} onClose={() => setMembers(null)} onDone={() => { setMembers(null); load(); toast("Members updated"); }} onError={(m: string) => toast(m, true)} />}
      {thumbFor && <ThumbModal profile={thumbFor} onClose={() => setThumbFor(null)} onDone={() => { setThumbFor(null); load(); toast("Company image updated"); }} onError={(m: string) => toast(m, true)} />}
    </div>
  );
}

const thumbUrl = (p: any) => (p.thumbnailPath ? `/static/profiles/${p.thumbnailPath.split(/[\\/]/).pop()}` : null);

function ProfileThumb({ profile }: { profile: any }) {
  const url = thumbUrl(profile);
  return (
    <div style={{ width: 40, height: 40, borderRadius: 8, border: "1px solid var(--border)", overflow: "hidden", background: "var(--primary-soft)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover" }} /> : <span style={{ fontWeight: 700, color: "var(--primary)" }}>{profile.name?.[0]?.toUpperCase()}</span>}
    </div>
  );
}

function ThumbModal({ profile, onClose, onDone, onError }: any) {
  const [file, setFile] = useState<File | null>(null);
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!file) return onError("Choose an image");
    setBusy(true);
    try { const fd = new FormData(); fd.set("image", file); await api.post(`/profiles/${profile.id}/thumbnail`, fd); onDone(); }
    catch (e) { onError(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title={`Company image — ${profile.name}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Upload</button></>}>
      <div style={{ textAlign: "center", marginBottom: 12 }}><ProfileThumb profile={profile} /></div>
      <div className="field"><label>Image (PNG/JPG)</label><input type="file" accept="image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
    </Modal>
  );
}

function CreateModal({ onClose, onDone, onError }: any) {
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const save = async () => {
    if (!name.trim()) return onError("Name is required");
    try { await api.post("/profiles", { name: name.trim(), description }); onDone(); } catch (e) { onError(apiError(e)); }
  };
  return (
    <Modal title="New Company" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Create</button></>}>
      <div className="field"><label>Name</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
      <div className="field"><label>Description</label><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
    </Modal>
  );
}

function EditModal({ profile, onClose, onDone, onError }: any) {
  const [name, setName] = useState(profile.name || "");
  const [description, setDescription] = useState(profile.description || "");
  const save = async () => {
    if (!name.trim()) return onError("Name is required");
    try { await api.patch(`/profiles/${profile.id}`, { name: name.trim(), description }); onDone(); } catch (e) { onError(apiError(e)); }
  };
  return (
    <Modal title={`Edit Company — ${profile.name}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="field"><label>Name</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
      <div className="field"><label>Description</label><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
    </Modal>
  );
}

function MembersModal({ profile, users, onClose, onDone, onError }: any) {
  const [ids, setIds] = useState<string[]>([]);
  useEffect(() => { unwrap(api.get(`/profiles/${profile.id}`)).then((p) => setIds(p.members.map((m: any) => m.user.id))).catch(() => {}); }, [profile.id]);
  const save = async () => { try { await api.put(`/profiles/${profile.id}/members`, { userIds: ids }); onDone(); } catch (e) { onError(apiError(e)); } };
  return (
    <Modal title={`Members — ${profile.name}`} onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="checklist">
        {users.map((u: any) => (
          <label key={u.id}><input type="checkbox" checked={ids.includes(u.id)} onChange={(e) => setIds(e.target.checked ? [...ids, u.id] : ids.filter((x) => x !== u.id))} /> {u.fullName}</label>
        ))}
      </div>
    </Modal>
  );
}
