import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { Modal, Spinner, useToast } from "../components/ui";

export default function Stamps() {
  const toast = useToast();
  const [stamps, setStamps] = useState<any[] | null>(null);
  const [profiles, setProfiles] = useState<any[]>([]);
  const [add, setAdd] = useState(false);
  const [edit, setEdit] = useState<any>(null);
  const [q, setQ] = useState("");
  const [profileFilter, setProfileFilter] = useState("");

  const load = () => { setStamps(null); unwrap(api.get("/stamps")).then(setStamps).catch(() => setStamps([])); };
  useEffect(() => { load(); unwrap(api.get("/profiles")).then(setProfiles).catch(() => {}); }, []);

  const remove = async (id: string) => { if (!confirm("Remove this stamp?")) return; try { await api.delete(`/stamps/${id}`); load(); toast("Removed"); } catch (e) { toast(apiError(e), true); } };

  const filtered = (stamps ?? []).filter((s) =>
    (!q || s.name.toLowerCase().includes(q.toLowerCase())) &&
    (!profileFilter || s.profile?.id === profileFilter),
  );

  return (
    <div>
      <div className="between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Company Stamps</h1>
        <button className="btn btn-primary" onClick={() => setAdd(true)}>+ Upload Stamp</button>
      </div>
      <div className="toolbar">
        <input className="search" placeholder="Search stamps…" value={q} onChange={(e) => setQ(e.target.value)} />
        <select value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)}>
          <option value="">All companies</option>
          {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="spacer" />
        {(q || profileFilter) && <button className="btn btn-ghost btn-sm" onClick={() => { setQ(""); setProfileFilter(""); }}>Clear</button>}
        <button className="btn btn-ghost btn-sm" onClick={load}>↻ Refresh</button>
      </div>
      {stamps === null ? <Spinner /> : filtered.length === 0 ? (
        <div className="card"><div className="empty-state">No stamps match your search.</div></div>
      ) : (
        <div className="stats">
          {filtered.map((s) => (
            <div key={s.id} className="card card-pad" style={{ textAlign: "center" }}>
              <img src={`/static/stamps/${s.imagePath?.split(/[\\/]/).pop()}`} alt={s.name} style={{ maxWidth: "100%", maxHeight: 90, objectFit: "contain", marginBottom: 8 }}
                onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
              <div style={{ fontWeight: 600 }}>{s.name}</div>
              <div className="muted" style={{ fontSize: 12 }}>{s.profile?.name || "All companies"}</div>
              <div className="row" style={{ justifyContent: "center", gap: 6, marginTop: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => setEdit(s)}>Edit</button>
                <button className="btn btn-ghost btn-sm" onClick={() => remove(s.id)}>Remove</button>
              </div>
            </div>
          ))}
        </div>
      )}
      {add && <AddModal profiles={profiles} onClose={() => setAdd(false)} onDone={() => { setAdd(false); load(); toast("Stamp uploaded"); }} onError={(m: string) => toast(m, true)} />}
      {edit && <EditModal stamp={edit} profiles={profiles} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); toast("Stamp updated"); }} onError={(m: string) => toast(m, true)} />}
    </div>
  );
}

function AddModal({ profiles, onClose, onDone, onError }: any) {
  const [name, setName] = useState("");
  const [profileId, setProfileId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const save = async () => {
    if (!name || !file) return onError("Name and image required");
    try {
      const fd = new FormData(); fd.set("name", name); if (profileId) fd.set("profileId", profileId); fd.set("image", file);
      await api.post("/stamps", fd); onDone();
    } catch (e) { onError(apiError(e)); }
  };
  return (
    <Modal title="Upload Company Stamp" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Upload</button></>}>
      <div className="field"><label>Name</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
      <div className="field"><label>Profile (optional — leave blank for all)</label>
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)}><option value="">All profiles</option>{profiles.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <div className="field"><label>Image (PNG/JPG, transparent PNG recommended)</label><input type="file" accept="image/png,image/jpeg" onChange={(e) => setFile(e.target.files?.[0] || null)} /></div>
    </Modal>
  );
}

function EditModal({ stamp, profiles, onClose, onDone, onError }: any) {
  const [name, setName] = useState(stamp.name || "");
  const [profileId, setProfileId] = useState(stamp.profile?.id || "");
  const [busy, setBusy] = useState(false);
  const save = async () => {
    if (!name.trim()) return onError("Name is required");
    setBusy(true);
    try { await api.patch(`/stamps/${stamp.id}`, { name: name.trim(), profileId: profileId || null }); onDone(); }
    catch (e) { onError(apiError(e)); } finally { setBusy(false); }
  };
  return (
    <Modal title="Edit Company Stamp" onClose={onClose} footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>Save</button></>}>
      <div style={{ textAlign: "center", marginBottom: 12 }}>
        <img src={`/static/stamps/${stamp.imagePath?.split(/[\\/]/).pop()}`} alt={stamp.name} style={{ maxHeight: 80, maxWidth: "100%", objectFit: "contain" }} onError={(e) => ((e.target as HTMLImageElement).style.display = "none")} />
      </div>
      <div className="field"><label>Name</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
      <div className="field"><label>Company (optional — leave blank for all)</label>
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)}><option value="">All companies</option>{profiles.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}</select>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>To change the stamp image, remove this stamp and upload a new one.</p>
    </Modal>
  );
}
