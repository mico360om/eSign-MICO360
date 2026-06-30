import { useEffect, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { Modal, useToast } from "../components/ui";
import { DataTable } from "../components/DataTable";

export default function ApprovalTypes() {
  const toast = useToast();
  const [types, setTypes] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [edit, setEdit] = useState<any>(null);

  const load = () => { setTypes(null); setErr(""); unwrap(api.get("/approval-types")).then(setTypes).catch((e) => { setErr(apiError(e)); setTypes([]); }); };
  useEffect(() => { load(); }, []);

  const del = async (id: string) => {
    if (!confirm("Remove this approval type?")) return;
    try { await api.delete(`/approval-types/${id}`); load(); toast("Removed"); } catch (e) { toast(apiError(e), true); }
  };

  return (
    <div>
      <div className="between" style={{ marginBottom: 18 }}>
        <h1 className="page-title" style={{ margin: 0 }}>Approval Types</h1>
        <button className="btn btn-primary" onClick={() => setEdit({})}>+ New Type</button>
      </div>
      <p className="muted" style={{ marginTop: -10, marginBottom: 14 }}>
        Kinds of approval a requester can ask for (e.g. Approved, Reviewed, Verified). Approvers map a saved signature to each type.
      </p>
      <DataTable
        rows={types}
        loading={types === null}
        error={err}
        onRefresh={load}
        rowKey={(t: any) => t.id}
        searchPlaceholder="Search types…"
        searchValue={(t: any) => `${t.name} ${t.description ?? ""}`}
        emptyText="No approval types yet."
        columns={[
          { key: "name", header: "Name", render: (t: any) => <strong>{t.name}</strong> },
          { key: "description", header: "Description", render: (t: any) => <span className="muted cell-wrap" style={{ display: "inline-block" }}>{t.description}</span> },
          { key: "actions", header: "Actions", sortable: false, className: "actions-cell", render: (t: any) => (
            <>
              <button className="btn btn-ghost btn-sm" onClick={() => setEdit(t)}>Edit</button>{" "}
              <button className="btn btn-ghost btn-sm" onClick={() => del(t.id)}>Remove</button>
            </>
          ) },
        ]}
      />
      {edit && <TypeModal type={edit} onClose={() => setEdit(null)} onDone={() => { setEdit(null); load(); toast("Saved"); }} onError={(m: string) => toast(m, true)} />}
    </div>
  );
}

function TypeModal({ type, onClose, onDone, onError }: any) {
  const isNew = !type.id;
  const [name, setName] = useState(type.name || "");
  const [description, setDescription] = useState(type.description || "");
  const save = async () => {
    if (!name.trim()) return onError("Name is required");
    try {
      if (isNew) await api.post("/approval-types", { name: name.trim(), description });
      else await api.patch(`/approval-types/${type.id}`, { name: name.trim(), description });
      onDone();
    } catch (e) { onError(apiError(e)); }
  };
  return (
    <Modal title={isNew ? "New Approval Type" : `Edit ${type.name}`} onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" onClick={save}>Save</button></>}>
      <div className="field"><label>Name</label><input autoFocus value={name} onChange={(e) => setName(e.target.value)} placeholder="e.g. Reviewed" onKeyDown={(e) => e.key === "Enter" && save()} /></div>
      <div className="field"><label>Description (optional)</label><textarea rows={2} value={description} onChange={(e) => setDescription(e.target.value)} /></div>
    </Modal>
  );
}
