import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { Modal, useToast } from "../components/ui";
import { DataTable } from "../components/DataTable";

export default function SignatureGroups() {
  const toast = useToast();
  const [groups, setGroups] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [profiles, setProfiles] = useState<any[]>([]);
  const [create, setCreate] = useState(false);
  const [editGroup, setEditGroup] = useState<any>(null);
  const [profileFilter, setProfileFilter] = useState("");
  const [modeFilter, setModeFilter] = useState("");

  const load = () => { setGroups(null); setErr(""); unwrap(api.get("/signature-groups")).then(setGroups).catch((e) => { setErr(apiError(e)); setGroups([]); }); };
  useEffect(() => { load(); unwrap(api.get("/profiles")).then(setProfiles).catch(() => {}); }, []);

  const del = async (id: string) => { if (!confirm("Delete this group?")) return; try { await api.delete(`/signature-groups/${id}`); load(); toast("Deleted"); } catch (e) { toast(apiError(e), true); } };

  const shown = (groups ?? []).filter((g) =>
    (!profileFilter || g.profile?.id === profileFilter) && (!modeFilter || g.approvalMode === modeFilter),
  );

  return (
    <div>
      <div className="between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Signature Groups</h1>
        <button className="btn btn-primary" onClick={() => setCreate(true)}>+ New Group</button>
      </div>
      <DataTable
        rows={shown}
        loading={groups === null}
        error={err}
        onRefresh={load}
        rowKey={(g: any) => g.id}
        searchPlaceholder="Search groups…"
        searchValue={(g: any) => `${g.name} ${g.profile?.name ?? ""} ${(g.members ?? []).map((m: any) => m.user.fullName).join(" ")}`}
        filters={[
          { label: "Company", value: profileFilter, onChange: setProfileFilter, options: [{ label: "All companies", value: "" }, ...profiles.map((p) => ({ label: p.name, value: p.id }))] },
          { label: "Mode", value: modeFilter, onChange: setModeFilter, options: [{ label: "All modes", value: "" }, { label: "Sequential", value: "SEQUENTIAL" }, { label: "Parallel", value: "PARALLEL" }] },
        ]}
        emptyText="No signature groups match your search."
        columns={[
          { key: "name", header: "Name", render: (g: any) => <strong>{g.name}</strong> },
          { key: "profile", header: "Company", value: (g: any) => g.profile?.name ?? "", render: (g: any) => g.profile?.name },
          { key: "approvalMode", header: "Mode", render: (g: any) => g.approvalMode },
          { key: "members", header: "Signatories (order)", sortable: false, render: (g: any) => <span className="cell-wrap" style={{ display: "inline-block" }}>{g.members.map((m: any, i: number) => `${i + 1}. ${m.user.fullName}`).join(" → ")}</span> },
          { key: "actions", header: "Actions", sortable: false, className: "actions-cell", render: (g: any) => <><button className="btn btn-ghost btn-sm" onClick={() => setEditGroup(g)}>Edit</button>{" "}<button className="btn btn-ghost btn-sm" onClick={() => del(g.id)}>Delete</button></> },
        ]}
      />
      {create && <CreateModal profiles={profiles} onClose={() => setCreate(false)} onDone={() => { setCreate(false); load(); toast("Group created"); }} onError={(m: string) => toast(m, true)} />}
      {editGroup && <EditModal group={editGroup} onClose={() => setEditGroup(null)} onDone={() => { setEditGroup(null); load(); toast("Group updated"); }} onError={(m: string) => toast(m, true)} />}
    </div>
  );
}

function CreateModal({ profiles, onClose, onDone, onError }: any) {
  const [name, setName] = useState("");
  const [profileId, setProfileId] = useState("");
  const [approvalMode, setApprovalMode] = useState("SEQUENTIAL");
  const [profileUsers, setProfileUsers] = useState<any[]>([]);
  const [members, setMembers] = useState<string[]>([]); // ordered list of userIds

  useEffect(() => {
    if (!profileId) { setProfileUsers([]); return; }
    unwrap(api.get(`/profiles/${profileId}`)).then((p) => setProfileUsers(p.members.map((m: any) => m.user))).catch(() => {});
    setMembers([]);
  }, [profileId]);

  const toggle = (id: string) => setMembers(members.includes(id) ? members.filter((x) => x !== id) : [...members, id]);
  const save = async () => {
    if (!name.trim()) return onError("Name is required");
    if (!profileId) return onError("Select a company");
    if (members.length === 0) return onError("Add at least one signatory");
    try {
      await api.post("/signature-groups", { name: name.trim(), profileId, approvalMode, members: members.map((userId, i) => ({ userId, order: i + 1 })) });
      onDone();
    } catch (e) { onError(apiError(e)); }
  };

  return (
    <Modal title="New Signature Group" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Create</button></>}>
      <div className="field"><label>Name</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
      <div className="field"><label>Company (group is linked to this company)</label>
        <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
          <option value="">— select —</option>
          {profiles.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
      </div>
      <div className="field"><label>Approval mode</label>
        <select value={approvalMode} onChange={(e) => setApprovalMode(e.target.value)}>
          <option value="SEQUENTIAL">Sequential</option><option value="PARALLEL">Parallel</option>
        </select>
      </div>
      <div className="field"><label>Signatories (tick in approval order)</label>
        <div className="checklist">
          {profileUsers.map((u) => {
            const idx = members.indexOf(u.id);
            return <label key={u.id}><input type="checkbox" checked={idx >= 0} onChange={() => toggle(u.id)} /> {idx >= 0 ? `${idx + 1}. ` : ""}{u.fullName}</label>;
          })}
          {profileId && profileUsers.length === 0 && <span className="muted">No users in this company.</span>}
        </div>
      </div>
    </Modal>
  );
}

function EditModal({ group, onClose, onDone, onError }: any) {
  const [name, setName] = useState(group.name || "");
  const [approvalMode, setApprovalMode] = useState(group.approvalMode || "SEQUENTIAL");
  const [profileUsers, setProfileUsers] = useState<any[]>([]);
  const [profileLoaded, setProfileLoaded] = useState(false);
  const [members, setMembers] = useState<string[]>(group.members?.map((m: any) => m.user.id) || []);

  useEffect(() => {
    if (!group.profile?.id) { setProfileLoaded(true); return; }
    unwrap(api.get(`/profiles/${group.profile.id}`))
      .then((p) => { setProfileUsers(p.members.map((m: any) => m.user)); setProfileLoaded(true); })
      .catch(() => setProfileLoaded(true));
  }, [group.profile?.id]);

  const toggle = (id: string) => setMembers(members.includes(id) ? members.filter((x) => x !== id) : [...members, id]);

  const save = async () => {
    if (!name.trim()) return onError("Name is required");
    if (members.length === 0) return onError("Add at least one signatory");
    try {
      await api.patch(`/signature-groups/${group.id}`, {
        name: name.trim(),
        approvalMode,
        members: members.map((userId, i) => ({ userId, order: i + 1 })),
      });
      onDone();
    } catch (e) { onError(apiError(e)); }
  };

  return (
    <Modal title={`Edit Group — ${group.name}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="field"><label>Name</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && save()} /></div>
      <div className="field"><label>Approval mode</label>
        <select value={approvalMode} onChange={(e) => setApprovalMode(e.target.value)}>
          <option value="SEQUENTIAL">Sequential</option><option value="PARALLEL">Parallel</option>
        </select>
      </div>
      <div className="field"><label>Signatories (tick in approval order)</label>
        <div className="checklist">
          {profileUsers.map((u) => {
            const idx = members.indexOf(u.id);
            return <label key={u.id}><input type="checkbox" checked={idx >= 0} onChange={() => toggle(u.id)} /> {idx >= 0 ? `${idx + 1}. ` : ""}{u.fullName}</label>;
          })}
          {!profileLoaded && <span className="muted">Loading members…</span>}
          {profileLoaded && profileUsers.length === 0 && <span className="muted">{group.profile?.id ? "No users in this company." : "No company linked to this group."}</span>}
        </div>
      </div>
    </Modal>
  );
}
