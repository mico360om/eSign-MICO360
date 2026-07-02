import { useEffect, useState } from "react";
import { useNavigate, useSearchParams } from "react-router-dom";
import { api, apiError, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Modal, StatusBadge, useToast } from "../components/ui";
import { DataTable } from "../components/DataTable";
import { DocThumb } from "../components/DocThumb";

const STATUSES = ["", "DRAFT", "UPLOADED", "PDF_CONVERTED", "PENDING_APPROVAL", "PARTIALLY_APPROVED", "PENDING_SIGNATURE", "APPROVED", "REJECTED", "COMPLETED", "CANCELLED"];

const PRIORITY_COLORS: Record<string, string> = {
  URGENT: "var(--warning)",
  CRITICAL: "var(--danger)",
};

export default function Documents() {
  const { me, can } = useAuth();
  const toast = useToast();
  const nav = useNavigate();
  const [searchParams] = useSearchParams();
  const [docs, setDocs] = useState<any[] | null>(null);
  const [err, setErr] = useState("");
  const [status, setStatus] = useState(searchParams.get("status") || "");
  const [priority, setPriority] = useState("");
  const [profileFilter, setProfileFilter] = useState("");
  const [dateFrom, setDateFrom] = useState("");
  const [dateTo, setDateTo] = useState("");
  const [showUpload, setShowUpload] = useState(false);
  const [showFilters, setShowFilters] = useState(false);
  const [allProfiles, setAllProfiles] = useState<any[]>([]);
  const [droppedFile, setDroppedFile] = useState<File | null>(null);
  const [dragActive, setDragActive] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [bulkBusy, setBulkBusy] = useState(false);
  const canApprove = can("APPROVE");
  const canReject = can("REJECT");
  const bulkEnabled = canApprove || canReject;

  const load = () => {
    setDocs(null); setErr(""); setSelectedIds(new Set());
    const params: Record<string, string> = {};
    if (status) params.status = status;
    if (priority) params.priority = priority;
    if (profileFilter) params.profileId = profileFilter;
    if (dateFrom) params.dateFrom = dateFrom;
    if (dateTo) params.dateTo = dateTo;
    unwrap(api.get("/documents", { params })).then(setDocs).catch((e) => { setErr(apiError(e)); setDocs([]); });
  };

  useEffect(() => {
    load();
    if (can("MANAGE_PROFILES")) unwrap(api.get("/profiles")).then(setAllProfiles).catch((e) => toast(apiError(e), true));
  }, []);

  // Sync the status filter when navigated via the sidebar sub-menu (?status=...).
  useEffect(() => { setStatus(searchParams.get("status") || ""); }, [searchParams]);

  useEffect(() => { load(); }, [status, priority, profileFilter, dateFrom, dateTo]);

  const profileOpts = Array.from(new Map((docs ?? []).map((d) => [d.profile?.id, d.profile?.name])).entries()).filter(([id]) => id);
  const activeFilters = [status, priority, profileFilter, dateFrom, dateTo].filter(Boolean).length;

  // Drag & drop a file anywhere on the page to start an upload.
  const canUpload = can("UPLOAD");
  const onPageDragOver = (e: React.DragEvent) => { if (!canUpload) return; if (e.dataTransfer.types.includes("Files")) { e.preventDefault(); setDragActive(true); } };
  const onPageDragLeave = (e: React.DragEvent) => { if (e.currentTarget === e.target) setDragActive(false); };
  const onPageDrop = (e: React.DragEvent) => {
    if (!canUpload) return;
    e.preventDefault(); setDragActive(false);
    const f = e.dataTransfer.files?.[0];
    if (f) { setDroppedFile(f); setShowUpload(true); }
  };

  // Bulk approve/reject — only documents awaiting a decision are selectable.
  // The server enforces per-document permission/turn and reports any it skipped.
  const isRowSelectable = (d: any) => ["PENDING_APPROVAL", "PARTIALLY_APPROVED", "PENDING_SIGNATURE"].includes(d.status);
  const bulkDecide = async (decision: "APPROVE" | "REJECT") => {
    const ids = [...selectedIds];
    if (!ids.length) return;
    setBulkBusy(true);
    try {
      const res: any = await unwrap(api.post("/documents/bulk-decision", { ids, decision }));
      const verb = decision === "APPROVE" ? "approved" : "rejected";
      if (res.failed > 0) toast(`${res.succeeded} ${verb}, ${res.failed} skipped (not your turn or not permitted)`, res.succeeded === 0);
      else toast(`${res.succeeded} document${res.succeeded === 1 ? "" : "s"} ${verb}`, false, { type: "success" });
      setSelectedIds(new Set());
      load();
    } catch (e) { toast(apiError(e), true); } finally { setBulkBusy(false); }
  };
  const clearFilters = () => { setStatus(""); setPriority(""); setProfileFilter(""); setDateFrom(""); setDateTo(""); };

  return (
    <div onDragOver={onPageDragOver} onDragLeave={onPageDragLeave} onDrop={onPageDrop} style={{ position: "relative", minHeight: "60vh" }}>
      {dragActive && (
        <div className="drop-overlay" onDragOver={onPageDragOver} onDrop={onPageDrop}>
          <div className="drop-overlay-box">📄 Drop the file here to upload a document</div>
        </div>
      )}
      <div className="between" style={{ marginBottom: 18, alignItems: "flex-start" }}>
        <div>
          <h1 className="page-title" style={{ margin: 0 }}>Documents</h1>
          {canUpload && <div className="muted" style={{ fontSize: 12.5, marginTop: 2 }}>Tip: drag &amp; drop a file anywhere on this page to upload.</div>}
        </div>
        <div className="row" style={{ gap: 8 }}>
          <button className="btn btn-ghost" onClick={() => setShowFilters((v) => !v)}>
            ⚙ Filters{activeFilters > 0 ? ` (${activeFilters})` : ""}
          </button>
          {can("UPLOAD") && <button className="btn btn-primary" onClick={() => setShowUpload(true)}>+ Upload Document</button>}
        </div>
      </div>

      {/* Advanced filter panel */}
      {showFilters && (
        <div className="card card-pad" style={{ marginBottom: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fill, minmax(160px, 1fr))", gap: 12, alignItems: "end" }}>
            <div className="field" style={{ margin: 0 }}>
              <label>Status</label>
              <select value={status} onChange={(e) => setStatus(e.target.value)}>
                {STATUSES.map((s) => <option key={s} value={s}>{s ? s.replace(/_/g, " ") : "All statuses"}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Priority</label>
              <select value={priority} onChange={(e) => setPriority(e.target.value)}>
                <option value="">All priorities</option>
                <option value="NORMAL">Normal</option>
                <option value="URGENT">Urgent</option>
                <option value="CRITICAL">Critical</option>
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>Company</label>
              <select value={profileFilter} onChange={(e) => setProfileFilter(e.target.value)}>
                <option value="">All companies</option>
                {profileOpts.map(([id, name]) => <option key={id as string} value={id as string}>{name as string}</option>)}
              </select>
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>From date</label>
              <input type="date" value={dateFrom} onChange={(e) => setDateFrom(e.target.value)} />
            </div>
            <div className="field" style={{ margin: 0 }}>
              <label>To date</label>
              <input type="date" value={dateTo} onChange={(e) => setDateTo(e.target.value)} />
            </div>
            <div style={{ display: "flex", alignItems: "flex-end" }}>
              <button className="btn btn-ghost btn-sm" onClick={() => { setStatus(""); setPriority(""); setProfileFilter(""); setDateFrom(""); setDateTo(""); }}>Clear filters</button>
            </div>
          </div>
        </div>
      )}

      {/* Bulk action bar — appears when documents are selected */}
      {bulkEnabled && selectedIds.size > 0 && (
        <div className="card card-pad" style={{ marginBottom: 12, display: "flex", alignItems: "center", gap: 12, flexWrap: "wrap", borderLeft: "3px solid var(--primary)" }}>
          <strong>{selectedIds.size} selected</strong>
          <div className="row" style={{ gap: 8, flexWrap: "wrap" }}>
            {canApprove && <button className="btn btn-success btn-sm" disabled={bulkBusy} onClick={() => bulkDecide("APPROVE")}>{bulkBusy ? "Working…" : "✓ Approve selected"}</button>}
            {canReject && <button className="btn btn-danger btn-sm" disabled={bulkBusy} onClick={() => bulkDecide("REJECT")}>{bulkBusy ? "Working…" : "✕ Reject selected"}</button>}
            <button className="btn btn-ghost btn-sm" disabled={bulkBusy} onClick={() => setSelectedIds(new Set())}>Clear selection</button>
          </div>
        </div>
      )}

      <DataTable
        rows={docs ?? []}
        loading={docs === null}
        error={err}
        onRefresh={load}
        rowKey={(d: any) => d.id}
        onRowClick={(d: any) => nav(`/documents/${d.id}`)}
        searchPlaceholder="Search title, company, requester…"
        searchValue={(d: any) => `${d.title} ${d.profile?.name ?? ""} ${d.uploadedBy?.fullName ?? ""}`}
        filters={[]}
        selectable={bulkEnabled}
        isRowSelectable={isRowSelectable}
        selectedKeys={selectedIds}
        onSelectedKeysChange={setSelectedIds}
        onClearFilters={clearFilters}
        filtersActive={activeFilters > 0}
        emptyText="No documents match your search."
        columns={[
          { key: "title", header: "Title", render: (d: any) => (
            <div className="row" style={{ gap: 10 }}>
              <DocThumb docId={d.id} kind={d.status === "COMPLETED" ? "final" : "converted"} size={40} />
              <div>
                <strong className="cell-truncate" style={{ display: "block" }}>{d.title}</strong>
                <div style={{ display: "flex", gap: 4, flexWrap: "wrap", marginTop: 2 }}>
                  {d.priority && d.priority !== "NORMAL" && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: PRIORITY_COLORS[d.priority], textTransform: "uppercase" }}>{d.priority}</span>
                  )}
                  {d.dueDate && (
                    <span className="muted" style={{ fontSize: 11 }}>Due: {new Date(d.dueDate).toLocaleDateString()}</span>
                  )}
                  {d.confidential && (
                    <span style={{ fontSize: 10, fontWeight: 700, color: "var(--danger)", textTransform: "uppercase" }}>Confidential</span>
                  )}
                </div>
              </div>
            </div>
          ) },
          { key: "profile", header: "Company", value: (d: any) => d.profile?.name ?? "", render: (d: any) => d.profile?.name },
          { key: "uploadedBy", header: "Requester", value: (d: any) => d.uploadedBy?.fullName ?? "", render: (d: any) => d.uploadedBy?.fullName },
          { key: "status", header: "Status", render: (d: any) => <StatusBadge status={d.status} /> },
          { key: "updatedAt", header: "Updated", value: (d: any) => d.updatedAt, render: (d: any) => <span className="muted">{new Date(d.updatedAt).toLocaleDateString()}</span> },
          {
            key: "actions", header: "", sortable: false, className: "actions-cell",
            render: (d: any) => (
              <span onClick={(e) => e.stopPropagation()}>
                <button className="btn btn-ghost btn-sm" onClick={() => nav(`/documents/${d.id}`)}>View</button>
              </span>
            ),
          },
        ]}
      />

      {showUpload && (
        <UploadModal
          profiles={can("MANAGE_PROFILES") ? allProfiles : me!.profiles.filter((p: any) => p.isActive)}
          initialFile={droppedFile}
          onClose={() => { setShowUpload(false); setDroppedFile(null); }}
          onDone={(doc: any) => { setShowUpload(false); setDroppedFile(null); toast("Document uploaded & converted to PDF"); if (doc?.id) nav(`/documents/${doc.id}`); else load(); }}
          onError={(m) => toast(m, true)}
        />
      )}
    </div>
  );
}

function UploadModal({ profiles, initialFile, onClose, onDone, onError }: { profiles: any[]; initialFile?: File | null; onClose: () => void; onDone: (doc?: any) => void; onError: (m: string) => void }) {
  const [title, setTitle] = useState(initialFile ? initialFile.name.replace(/\.[^.]+$/, "") : "");
  const [profileId, setProfileId] = useState(profiles[0]?.id || "");
  const [file, setFile] = useState<File | null>(initialFile || null);
  const [priority, setPriority] = useState("NORMAL");
  const [dueDate, setDueDate] = useState("");
  const [notes, setNotes] = useState("");
  const [confidential, setConfidential] = useState(false);
  const [busy, setBusy] = useState(false);
  const [dragOver, setDragOver] = useState(false);

  const submit = async () => {
    if (!title.trim()) return onError("Title is required");
    if (!file) return onError("A file is required");
    if (!profileId) return onError("A company is required");
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("title", title.trim());
      fd.set("profileId", profileId);
      fd.set("file", file);
      fd.set("priority", priority);
      if (dueDate) fd.set("dueDate", dueDate);
      if (notes) fd.set("notes", notes);
      fd.set("confidential", String(confidential));
      const created = await unwrap(api.post("/documents/upload", fd));
      onDone(created);
    } catch (e) { onError(apiError(e)); } finally { setBusy(false); }
  };

  const onDrop = (e: React.DragEvent) => {
    e.preventDefault(); setDragOver(false);
    const f = e.dataTransfer.files[0];
    if (f) setFile(f);
  };

  return (
    <Modal title="Upload Document" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy || profiles.length === 0} onClick={submit}>{busy ? "Uploading…" : "Upload"}</button></>}>
      {profiles.length === 0 && <p className="muted" style={{ marginBottom: 10 }}>You are not assigned to any active company. Ask an admin to add you to a company first.</p>}

      <div className="form-grid">
        <div className="field col-span-2">
          <label>Title</label>
          <input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} onKeyDown={(e) => e.key === "Enter" && submit()} />
        </div>
        <div className="field">
          <label>Company</label>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {profiles.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field">
          <label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="NORMAL">Normal</option>
            <option value="URGENT">Urgent</option>
            <option value="CRITICAL">Critical</option>
          </select>
        </div>
        <div className="field">
          <label>Due Date <span className="muted">(optional)</span></label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <label className="check col-span-2">
          <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
          Confidential document
        </label>
      </div>

      <div className="field">
        <label>Notes / Instructions for approvers <span className="muted">(optional)</span></label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="e.g. Please approve by end of week" />
      </div>

      <div className="field">
        <label>File</label>
        <div
          onDragOver={(e) => { e.preventDefault(); setDragOver(true); }}
          onDragLeave={() => setDragOver(false)}
          onDrop={onDrop}
          style={{
            border: `2px dashed ${dragOver ? "var(--primary)" : "var(--border)"}`,
            borderRadius: "var(--radius-sm)",
            padding: "16px 12px",
            textAlign: "center",
            background: dragOver ? "var(--primary-soft)" : "transparent",
            cursor: "pointer",
          }}
          onClick={() => document.getElementById("file-input")?.click()}
        >
          {file
            ? <span>{file.name} <span className="muted">({(file.size / 1024 / 1024).toFixed(1)} MB)</span></span>
            : <span className="muted">Drag & drop or <strong style={{ color: "var(--primary)" }}>click to browse</strong></span>}
          <input id="file-input" type="file" style={{ display: "none" }} onChange={(e) => setFile(e.target.files?.[0] || null)} />
        </div>
        <span className="muted" style={{ fontSize: 11, marginTop: 4, display: "block" }}>
          Allowed: PDF, Word, Excel, PowerPoint, images, txt · Max 25 MB · Auto-converted to PDF
        </span>
      </div>
    </Modal>
  );
}
