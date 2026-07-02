import { useEffect, useRef, useState } from "react";
import { Link, useNavigate, useParams } from "react-router-dom";
import { api, apiError, unwrap } from "../lib/api";
import { useAuth } from "../lib/auth";
import { Modal, Spinner, StatusBadge, useToast } from "../components/ui";
import { PdfCanvas, Overlay } from "../components/PdfCanvas";

// Friendly labels for the document history timeline.
const EVENT_LABEL: Record<string, string> = {
  UPLOADED: "Document uploaded",
  CONVERTED: "Converted to PDF",
  SUBMITTED: "Submitted for approval",
  SIGNED: "Signature applied",
  STAMPED: "Company stamp applied",
  APPROVED: "Approved",
  REJECTED: "Rejected",
  COMPLETED: "Completed & finalized",
  CANCELLED: "Cancelled",
  REOPENED: "Reopened for edit",
  UPDATED: "Details updated",
  DELEGATED: "Delegated",
};

export default function DocumentDetail() {
  const { id } = useParams();
  const { me, can, refresh } = useAuth();
  const toast = useToast();
  const [doc, setDoc] = useState<any>(null);
  const [pdfData, setPdfData] = useState<ArrayBuffer | null>(null);
  const [overlays, setOverlays] = useState<Overlay[]>([]);
  const [comment, setComment] = useState("");
  const [busy, setBusy] = useState(false);
  const [showSubmit, setShowSubmit] = useState(false);
  const [showEdit, setShowEdit] = useState(false);
  const [showApply, setShowApply] = useState(false);
  const [applyInitialKind, setApplyInitialKind] = useState<null | "SIGNATURE" | "STAMP">(null);
  const [stampSkip, setStampSkip] = useState(false);
  const [verify, setVerify] = useState<any>(null);
  const [pageCount, setPageCount] = useState(1);
  const [viewPdf, setViewPdf] = useState<{ kind: string; data: ArrayBuffer } | null>(null);
  const [tab, setTab] = useState<"workflow" | "history" | "files">("workflow");
  const nav = useNavigate();

  const load = async () => {
    const d = await unwrap(api.get(`/documents/${id}`));
    setDoc(d);
    const kind = d.status === "COMPLETED" ? "final" : "converted";
    try {
      const res = await api.get(`/documents/${id}/view/${kind}`, { responseType: "arraybuffer" });
      setPdfData(res.data as ArrayBuffer);
      const pc = parseInt(res.headers["x-page-count"] || "1", 10);
      setPageCount(isNaN(pc) ? 1 : pc);
    } catch { setPdfData(null); }
    // Overlay placed signatures/stamps on the working copy (the final PDF already
    // has them baked in, so only overlay before completion).
    const pls = (d.placements || []) as any[];
    if (d.status !== "COMPLETED" && pls.length) {
      const loaded = await Promise.all(pls.map(async (p) => {
        try {
          const r = await api.get(`/documents/${id}/placements/${p.id}/image`, { responseType: "blob" });
          return { id: p.id, page: p.page, x: p.x, y: p.y, width: p.width, height: p.height, imageUrl: URL.createObjectURL(r.data) } as Overlay;
        } catch { return null; }
      }));
      setOverlays((prev) => { prev.forEach((o) => URL.revokeObjectURL(o.imageUrl)); return []; });
      setOverlays(loaded.filter(Boolean) as Overlay[]);
    } else {
      setOverlays((prev) => { prev.forEach((o) => URL.revokeObjectURL(o.imageUrl)); return []; });
    }
    unwrap(api.get(`/documents/${id}/verify`)).then(setVerify).catch(() => setVerify(null));
  };
  useEffect(() => { load(); }, [id]);
  useEffect(() => () => { setOverlays((prev) => { prev.forEach((o) => URL.revokeObjectURL(o.imageUrl)); return []; }); }, []);

  if (!doc) return <Spinner />;

  const myStep = doc.steps.find((s: any) => s.signatory?.id === me!.id);
  const canDecide = myStep && myStep.status === "PENDING" && ["PENDING_APPROVAL", "PARTIALLY_APPROVED"].includes(doc.status);
  const myApproved = myStep && myStep.status === "APPROVED";
  const canReopen = myApproved && !["CANCELLED", "REJECTED", "DRAFT"].includes(doc.status);
  const isOwner = doc.uploadedBy?.id === me!.id;
  const canSubmit = isOwner && ["DRAFT", "UPLOADED", "PDF_CONVERTED"].includes(doc.status);
  const myPlacements = (doc.placements || []).filter((p: any) => p.placedById === me!.id);

  // One stamp per document — after signing, prompt the approver once (per doc,
  // per session) to add the company stamp if the document isn't stamped yet.
  const docHasStamp = (doc.placements || []).some((p: any) => p.kind === "STAMP");
  const iSigned = myPlacements.some((p: any) => p.kind === "SIGNATURE");
  const stampSkipKey = `stampSkip:${id}`;
  const showStampPrompt = canDecide && can("USE_STAMP") && iSigned && !docHasStamp && !stampSkip && !sessionStorage.getItem(stampSkipKey);
  const skipStamp = () => { sessionStorage.setItem(stampSkipKey, "1"); setStampSkip(true); };
  const openStamp = () => { setApplyInitialKind("STAMP"); setShowApply(true); };

  const decide = async (decision: "APPROVE" | "REJECT") => {
    setBusy(true);
    try {
      await api.post(`/documents/${id}/decision`, { decision, comment });
      toast(`Document ${decision === "APPROVE" ? "approved" : "rejected"}`);
      setComment("");
      await load();
    } catch (e) { toast(apiError(e), true); } finally { setBusy(false); }
  };

  const reopen = async () => {
    setBusy(true);
    try {
      await api.post(`/documents/${id}/reopen`);
      toast("Reopened — edit your signature/stamp and re-approve");
      await load();
    } catch (e) { toast(apiError(e), true); } finally { setBusy(false); }
  };

  const copyDoc = async () => {
    setBusy(true);
    try {
      const newDoc = await unwrap(api.post(`/documents/${id}/copy`));
      toast("Document copied — redirecting to the copy");
      nav(`/documents/${newDoc.id}`);
    } catch (e) { toast(apiError(e), true); } finally { setBusy(false); }
  };

  const removePlacement = async (pid: string) => {
    try { await api.delete(`/documents/${id}/placements/${pid}`); toast("Removed"); await load(); }
    catch (e) { toast(apiError(e), true); }
  };

  // Open a PDF (original/converted/final) full-screen in-app — works in both the
  // web and desktop builds (renders via pdf.js), unlike a blob-URL new tab.
  const openPdf = async (kind: string) => {
    try {
      const res = await api.get(`/documents/${id}/view/${kind}`, { responseType: "arraybuffer" });
      setViewPdf({ kind, data: res.data as ArrayBuffer });
    } catch (e) { toast(apiError(e), true); }
  };

  const download = async (kind: string) => {
    try {
      const res = await api.get(`/documents/${id}/download/${kind}`, { responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = `${doc.title}-${kind}`;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10000);
    } catch (e) { toast(apiError(e), true); }
  };

  return (
    <div>
      <div style={{ marginBottom: 16 }}>
        <button className="btn btn-ghost btn-sm" style={{ marginBottom: 12 }} onClick={() => nav(-1)} title="Go back">← Back</button>
        <div className="between" style={{ gap: 12, flexWrap: "wrap", alignItems: "flex-start" }}>
          <div style={{ minWidth: 0 }}>
            <h1 className="page-title" style={{ margin: 0 }}>{doc.title}</h1>
            <div className="muted" style={{ fontSize: 13 }}>{doc.profile?.name} · uploaded by {doc.uploadedBy.fullName} · {new Date(doc.createdAt).toLocaleDateString()}</div>
          </div>
          <StatusBadge status={doc.status} />
        </div>
        <div className="row" style={{ gap: 6, flexWrap: "wrap", marginTop: 8 }}>
          {doc.priority && doc.priority !== "NORMAL" && <span className="badge" style={{ background: doc.priority === "CRITICAL" ? "var(--danger)" : "var(--warning)" }}>{doc.priority}</span>}
          {doc.dueDate && <span className="badge" style={{ background: "var(--muted)" }}>Due {new Date(doc.dueDate).toLocaleDateString()}</span>}
          {doc.confidential && <span className="badge" style={{ background: "var(--danger)" }}>CONFIDENTIAL</span>}
          {doc.steps.length > 0 && <span className="badge" style={{ background: "var(--ink-soft)" }}>{doc.approvalMode}</span>}
        </div>
        {doc.notes && <div className="muted" style={{ fontSize: 13, marginTop: 8 }}>📝 {doc.notes}</div>}
      </div>

      <div className="grid-main">
        {/* PDF preview (pdf.js — renders in Electron too) */}
        <div className="card" style={{ overflow: "hidden", minHeight: 560 }}>
          <PdfCanvas data={pdfData} overlays={overlays} />
        </div>

        {/* Side panel */}
        <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
          {/* Actions */}
          <div className="card card-pad">
            <h3>Actions</h3>
            {canSubmit && <button className="btn btn-primary" style={{ width: "100%", marginBottom: 8 }} onClick={() => setShowSubmit(true)}>Submit for Approval</button>}
            {canSubmit && (can("UPLOAD") || can("MANAGE_PROFILES")) && <button className="btn btn-ghost" style={{ width: "100%", marginBottom: 8 }} onClick={() => setShowEdit(true)}>✎ Edit Details</button>}
            {isOwner && can("UPLOAD") && <button className="btn btn-ghost" style={{ width: "100%", marginBottom: 8 }} disabled={busy} onClick={copyDoc}>Copy &amp; Send Again</button>}
            {canDecide && (
              <>
                {(can("SIGN") || can("USE_STAMP")) && <button className="btn btn-ghost" style={{ width: "100%", marginBottom: 8 }} onClick={() => { setApplyInitialKind(null); setShowApply(true); }}>✍ Apply Signature / Stamp</button>}
                {showStampPrompt && (
                  <div className="card card-pad" style={{ padding: 12, marginBottom: 8, background: "var(--primary-soft)", border: "1px solid var(--primary-light)" }}>
                    <div style={{ fontSize: 13, marginBottom: 8 }}>This document is <strong>not stamped</strong>. Do you want to add the company stamp?</div>
                    <div className="row" style={{ gap: 8 }}>
                      <button className="btn btn-primary btn-sm grow" onClick={openStamp}>Yes, add stamp</button>
                      <button className="btn btn-ghost btn-sm grow" onClick={skipStamp}>No, not needed</button>
                    </div>
                  </div>
                )}
                {myPlacements.length > 0 && (
                  <div style={{ marginBottom: 8 }}>
                    {myPlacements.map((p: any) => (
                      <div key={p.id} className="between" style={{ fontSize: 12, padding: "3px 0" }}>
                        <span className="muted">{p.kind === "SIGNATURE" ? "Signature" : "Stamp"} · page {p.page}</span>
                        <button className="btn btn-ghost btn-sm" onClick={() => removePlacement(p.id)}>Remove</button>
                      </div>
                    ))}
                  </div>
                )}
                <div className="field"><label>Comment (optional)</label><textarea rows={2} value={comment} onChange={(e) => setComment(e.target.value)} /></div>
                <div className="row">
                  {can("APPROVE") && <button className="btn btn-success grow" disabled={busy} onClick={() => decide("APPROVE")}>{busy ? "Working…" : "✓ Approve"}</button>}
                  {can("REJECT") && <button className="btn btn-danger grow" disabled={busy} onClick={() => decide("REJECT")}>{busy ? "Working…" : "✕ Reject"}</button>}
                </div>
              </>
            )}
            {canReopen && !canDecide && (
              <>
                <p className="muted" style={{ margin: "0 0 8px" }}>You approved this document.</p>
                <button className="btn btn-ghost" style={{ width: "100%" }} disabled={busy} onClick={reopen}>✎ Edit &amp; re-approve</button>
              </>
            )}
            {!canSubmit && !canDecide && !canReopen && <p className="muted" style={{ margin: 0 }}>No actions available at this stage.</p>}
            {doc.finalPdfPath && (
              <>
                <hr style={{ border: 0, borderTop: "1px solid var(--border)", margin: "14px 0" }} />
                <button className="btn btn-primary btn-sm" style={{ width: "100%" }} onClick={() => openPdf("final")}>📄 Open Final Signed PDF</button>
              </>
            )}
          </div>

          {/* Consolidated tabbed panel: Workflow · History · Files & Integrity */}
          <div className="card">
            <div className="tabs">
              <button className={tab === "workflow" ? "active" : ""} onClick={() => setTab("workflow")}>Workflow</button>
              <button className={tab === "history" ? "active" : ""} onClick={() => setTab("history")}>History</button>
              <button className={tab === "files" ? "active" : ""} onClick={() => setTab("files")}>Files</button>
            </div>
            <div className="card-pad">
              {tab === "workflow" && (
                <ol style={{ paddingLeft: 18, margin: 0 }}>
                  {doc.steps.map((s: any) => (
                    <li key={s.id} style={{ marginBottom: 8 }}>
                      <strong>{s.signatory?.fullName || "Unknown user"}</strong> — <StatusBadge status={s.status} />
                      {s.approvalType && <span className="badge" style={{ background: "#1565c0", marginLeft: 6 }}>{s.approvalType.name}</span>}
                      {s.comment && <div className="muted" style={{ fontSize: 12 }}>"{s.comment}"</div>}
                    </li>
                  ))}
                  {doc.steps.length === 0 && <span className="muted">Not yet submitted for approval.</span>}
                </ol>
              )}

              {tab === "history" && (
                <ul style={{ listStyle: "none", padding: 0, margin: 0 }}>
                  {(doc.events || []).map((e: any) => (
                    <li key={e.id} style={{ padding: "8px 0 8px 14px", borderLeft: "2px solid var(--border)", marginLeft: 4, position: "relative", fontSize: 13 }}>
                      <span style={{ position: "absolute", left: -5, top: 12, width: 8, height: 8, borderRadius: "50%", background: "var(--primary)" }} />
                      <strong>{EVENT_LABEL[e.action] || e.action.replace(/_/g, " ")}</strong>
                      <div className="muted" style={{ fontSize: 12 }}>by {e.actorName || "System"} · {new Date(e.createdAt).toLocaleString()}</div>
                      {e.detail && <div className="muted" style={{ fontSize: 12, marginTop: 2 }}>{e.detail}</div>}
                    </li>
                  ))}
                  {(!doc.events || doc.events.length === 0) && <li className="muted" style={{ fontSize: 13 }}>No history yet.</li>}
                </ul>
              )}

              {tab === "files" && (
                <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
                  <div>
                    <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Open / download</div>
                    <div className="row" style={{ flexWrap: "wrap", gap: 8 }}>
                      {doc.finalPdfPath && <button className="btn btn-ghost btn-sm" onClick={() => openPdf("final")}>Open Final</button>}
                      <button className="btn btn-ghost btn-sm" onClick={() => openPdf("converted")}>Open Converted</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => download("original")}>⬇ Original</button>
                      <button className="btn btn-ghost btn-sm" onClick={() => download("converted")}>⬇ Converted</button>
                      {doc.finalPdfPath && <button className="btn btn-ghost btn-sm" onClick={() => download("final")}>⬇ Final</button>}
                    </div>
                  </div>
                  {verify && (
                    <div style={{ borderTop: "1px solid var(--border)", paddingTop: 12 }}>
                      <div className="muted" style={{ fontSize: 12, marginBottom: 6 }}>Integrity &amp; signature</div>
                      <div style={{ display: "flex", flexDirection: "column", gap: 5, fontSize: 13 }}>
                        <div>Signature type:{" "}
                          <span className="badge" style={{ background: verify.signatureMethod === "DIGITAL" ? "var(--primary)" : "#1565c0" }}>{verify.signatureMethod === "DIGITAL" ? "Digital certificate" : "Image"}</span>
                        </div>
                        {verify.original && <div>Original: {verify.original.intact ? <span style={{ color: "var(--success)", fontWeight: 600 }}>✓ Unaltered</span> : <span style={{ color: "var(--danger)", fontWeight: 600 }}>✕ Changed</span>}</div>}
                        {verify.final && <div>Final PDF: {verify.final.intact ? <span style={{ color: "var(--success)", fontWeight: 600 }}>✓ Verified</span> : <span style={{ color: "var(--danger)", fontWeight: 600 }}>✕ Tampered</span>}</div>}
                        {verify.final?.digitallySigned && <div style={{ color: "var(--success)" }}>🔒 Cryptographically signed</div>}
                      </div>
                      <button className="btn btn-ghost btn-sm" style={{ marginTop: 10 }}
                        onClick={() => unwrap(api.get(`/documents/${id}/verify`)).then((v) => { setVerify(v); toast("Integrity re-checked"); }).catch((e) => toast(apiError(e), true))}>↻ Re-verify</button>
                    </div>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>
      </div>

      {showSubmit && <SubmitModal docId={id!} profileId={doc.profile.id} onClose={() => setShowSubmit(false)} onDone={() => { setShowSubmit(false); toast("Submitted for approval"); load(); }} onError={(m: string) => toast(m, true)} />}
      {showEdit && <EditDetailsModal doc={doc} isAdmin={can("MANAGE_PROFILES")} myProfiles={me!.profiles} onClose={() => setShowEdit(false)} onDone={() => { setShowEdit(false); toast("Details updated"); load(); }} onError={(m: string) => toast(m, true)} />}
      {viewPdf && (
        <div className="modal-bg" style={{ padding: 12, zIndex: 60 }} onClick={() => setViewPdf(null)}>
          <div style={{ background: "#fff", borderRadius: 10, width: "100%", maxWidth: 1000, height: "92vh", display: "flex", flexDirection: "column", overflow: "hidden" }} onClick={(e) => e.stopPropagation()}>
            <div className="between" style={{ padding: "12px 16px", borderBottom: "1px solid var(--border)" }}>
              <strong>{doc.title} — {viewPdf.kind === "final" ? "Final Signed PDF" : "Converted PDF"}</strong>
              <div className="row" style={{ gap: 8 }}>
                <button className="btn btn-ghost btn-sm" onClick={() => download(viewPdf.kind)}>Download</button>
                <button className="btn btn-ghost btn-sm" onClick={() => setViewPdf(null)}>Close ✕</button>
              </div>
            </div>
            <div style={{ flex: 1, overflow: "hidden" }}><PdfCanvas data={viewPdf.data} /></div>
          </div>
        </div>
      )}
      {showApply && <ApplyMarkModal docId={id!} profileId={doc.profile.id} pageCount={pageCount} canSign={can("SIGN")} canStamp={can("USE_STAMP")} requestedType={myStep?.approvalType} initialKind={applyInitialKind} stampedPages={(doc.placements || []).filter((p: any) => p.kind === "STAMP").map((p: any) => p.page)} existingPlacements={(doc.placements || []).map((p: any) => ({ page: p.page, x: p.x, y: p.y, width: p.width, height: p.height }))} onClose={() => { setShowApply(false); setApplyInitialKind(null); }} onDone={(msg?: string) => { setShowApply(false); setApplyInitialKind(null); toast(msg || "Applied to PDF"); load(); }} onError={(m: string) => toast(m, true)} />}
    </div>
  );
}

// Edit a document's details BEFORE it is submitted for approval.
function EditDetailsModal({ doc, isAdmin, myProfiles, onClose, onDone, onError }: any) {
  const [title, setTitle] = useState(doc.title || "");
  const [profileId, setProfileId] = useState(doc.profile?.id || "");
  const [priority, setPriority] = useState(doc.priority || "NORMAL");
  const [dueDate, setDueDate] = useState(doc.dueDate ? String(doc.dueDate).slice(0, 10) : "");
  const [notes, setNotes] = useState(doc.notes || "");
  const [confidential, setConfidential] = useState(!!doc.confidential);
  const [companies, setCompanies] = useState<any[]>(isAdmin ? [] : (myProfiles || []).filter((p: any) => p.isActive));
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    if (isAdmin) unwrap(api.get("/profiles")).then(setCompanies).catch(() => setCompanies([]));
  }, [isAdmin]);

  const save = async () => {
    if (!title.trim()) return onError("Title is required");
    setBusy(true);
    try {
      await api.patch(`/documents/${doc.id}`, {
        title: title.trim(),
        profileId,
        priority,
        dueDate: dueDate || null,
        notes: notes || null,
        confidential,
      });
      onDone();
    } catch (e) { onError(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal title="Edit Document Details" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={save}>{busy ? "Saving…" : "Save"}</button></>}>
      <p className="muted" style={{ fontSize: 12, marginTop: 0 }}>These can be changed until the document is submitted for approval.</p>
      <div className="field"><label>Title</label><input autoFocus value={title} onChange={(e) => setTitle(e.target.value)} /></div>
      <div className="form-grid">
        <div className="field"><label>Company</label>
          <select value={profileId} onChange={(e) => setProfileId(e.target.value)}>
            {companies.map((p: any) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </div>
        <div className="field"><label>Priority</label>
          <select value={priority} onChange={(e) => setPriority(e.target.value)}>
            <option value="NORMAL">Normal</option><option value="URGENT">Urgent</option><option value="CRITICAL">Critical</option>
          </select>
        </div>
        <div className="field"><label>Due Date <span className="muted">(optional)</span></label>
          <input type="date" value={dueDate} onChange={(e) => setDueDate(e.target.value)} />
        </div>
        <label className="check col-span-2">
          <input type="checkbox" checked={confidential} onChange={(e) => setConfidential(e.target.checked)} />
          Confidential
        </label>
      </div>
      <div className="field"><label>Notes / Instructions <span className="muted">(optional)</span></label>
        <textarea rows={2} value={notes} onChange={(e) => setNotes(e.target.value)} />
      </div>
    </Modal>
  );
}

function SubmitModal({ docId, profileId, onClose, onDone, onError }: any) {
  const [sigs, setSigs] = useState<any[]>([]);
  const [groups, setGroups] = useState<any[]>([]);
  const [types, setTypes] = useState<any[]>([]);
  const [mode, setMode] = useState<"users" | "group">("users");
  const [selected, setSelected] = useState<string[]>([]);
  const [sigTypes, setSigTypes] = useState<Record<string, string>>({}); // userId -> approvalTypeId
  const [groupId, setGroupId] = useState("");
  const [approvalMode, setApprovalMode] = useState("PARALLEL");
  const [signatureMethod, setSignatureMethod] = useState("IMAGE");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    unwrap(api.get(`/lookups/profiles/${profileId}/signatories`)).then((list) => {
      setSigs(list);
      // Restore the last-used signatory list for this company (dropping any that
      // are no longer valid), so a repeated approval chain is one click.
      try {
        const saved = JSON.parse(localStorage.getItem(`sigList:${profileId}`) || "null");
        if (saved && Array.isArray(saved.selected)) {
          const valid = new Set(list.map((s: any) => s.id));
          const sel = saved.selected.filter((id: string) => valid.has(id));
          if (sel.length) { setSelected(sel); setSigTypes(saved.sigTypes || {}); if (saved.approvalMode) setApprovalMode(saved.approvalMode); }
        }
      } catch { /* ignore corrupt cache */ }
    }).catch((e) => onError(apiError(e)));
    unwrap(api.get(`/lookups/profiles/${profileId}/groups`)).then(setGroups).catch(() => {});
    unwrap(api.get(`/approval-types`)).then(setTypes).catch(() => {});
  }, [profileId]);

  const toggle = (id: string, on: boolean) => setSelected(on ? [...selected, id] : selected.filter((x) => x !== id));
  const allSelected = sigs.length > 0 && selected.length === sigs.length;
  const toggleAll = () => setSelected(allSelected ? [] : sigs.map((s: any) => s.id));

  const submit = async () => {
    if (mode === "users" && selected.length === 0) return onError("Select at least one signatory");
    if (mode === "group" && !groupId) return onError("Select a signature group");
    setBusy(true);
    try {
      const base = mode === "group"
        ? { signatureGroupId: groupId }
        : { signatoryIds: selected, approvalMode, signatoryTypes: Object.fromEntries(selected.map((id) => [id, sigTypes[id]]).filter(([, v]) => v)) };
      await api.post(`/documents/${docId}/submit`, { ...base, signatureMethod });
      if (mode === "users") { try { localStorage.setItem(`sigList:${profileId}`, JSON.stringify({ selected, sigTypes, approvalMode })); } catch { /* ignore */ } }
      onDone();
    } catch (e) { onError(apiError(e)); } finally { setBusy(false); }
  };

  return (
    <Modal title="Submit for Approval" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={submit}>{busy ? "Submitting…" : "Submit"}</button></>}>
      <div className="row" style={{ marginBottom: 14 }}>
        <label className="row" style={{ gap: 6 }}><input type="radio" style={{ width: "auto" }} checked={mode === "users"} onChange={() => setMode("users")} /> Pick signatories</label>
        <label className="row" style={{ gap: 6, opacity: groups.length === 0 ? 0.5 : 1 }} title={groups.length === 0 ? "No signature groups defined for this company" : ""}>
          <input type="radio" style={{ width: "auto" }} disabled={groups.length === 0} checked={mode === "group"} onChange={() => setMode("group")} /> Signature group
        </label>
      </div>
      {mode === "users" ? (
        <>
          <div className="field"><label>Signatories &amp; the kind of approval you want from each</label>
            {sigs.length > 1 && (
              <label className="check" style={{ marginBottom: 6 }}>
                <input type="checkbox" checked={allSelected} ref={(el) => { if (el) el.indeterminate = selected.length > 0 && !allSelected; }} onChange={toggleAll} />
                Select all ({sigs.length})
              </label>
            )}
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              {sigs.map((s) => {
                const on = selected.includes(s.id);
                return (
                  <div key={s.id} className="row" style={{ gap: 8, alignItems: "center" }}>
                    <label className="row grow" style={{ gap: 6 }}>
                      <input type="checkbox" style={{ width: "auto" }} checked={on} onChange={(e) => toggle(s.id, e.target.checked)} /> {s.fullName}
                    </label>
                    {on && types.length > 0 && (
                      <select style={{ width: 150, marginTop: 0 }} value={sigTypes[s.id] || ""} onChange={(e) => setSigTypes({ ...sigTypes, [s.id]: e.target.value })}>
                        <option value="">Any approval</option>
                        {types.map((t) => <option key={t.id} value={t.id}>{t.name}</option>)}
                      </select>
                    )}
                  </div>
                );
              })}
              {sigs.length === 0 && <span className="muted">No other users in this company.</span>}
            </div>
          </div>
          {selected.length > 1 && (
            <div className="field"><label>Approval order</label>
              <select value={approvalMode} onChange={(e) => setApprovalMode(e.target.value)}>
                <option value="PARALLEL">Parallel (all at once)</option>
                <option value="SEQUENTIAL">Sequential (one after another)</option>
              </select>
            </div>
          )}
        </>
      ) : (
        <div className="field"><label>Signature group</label>
          {groups.length === 0 ? (
            <p className="muted" style={{ fontSize: 12 }}>No signature groups are defined for this company yet. Create one under <Link to="/signature-groups" onClick={onClose}><strong>Signature Groups</strong></Link>, or use “Pick signatories” above.</p>
          ) : (
            <>
              <select value={groupId} onChange={(e) => setGroupId(e.target.value)}>
                <option value="">— select —</option>
                {groups.map((g) => <option key={g.id} value={g.id}>{g.name} ({g.approvalMode}{g.members?.length ? `, ${g.members.length} signer${g.members.length > 1 ? "s" : ""}` : ""})</option>)}
              </select>
              {groupId && groups.find((g) => g.id === groupId)?.members?.length > 0 && (
                <p className="muted" style={{ fontSize: 12, marginTop: 6 }}>Signers: {groups.find((g) => g.id === groupId).members.map((m: any) => m.user?.fullName).filter(Boolean).join(", ")}</p>
              )}
            </>
          )}
        </div>
      )}
      <div className="field"><label>Signature type</label>
        <select value={signatureMethod} onChange={(e) => setSignatureMethod(e.target.value)}>
          <option value="IMAGE">Image stamp / handwritten signature (visual)</option>
          <option value="DIGITAL">Digital certificate (cryptographic, tamper-evident)</option>
        </select>
        <p className="muted" style={{ fontSize: 12 }}>
          {signatureMethod === "DIGITAL"
            ? "A cryptographic PKCS#7 signature is embedded in the final PDF — any later change breaks it and is detectable."
            : "Visual signature/stamp images are placed on the PDF. Integrity is still tracked via SHA-256 hashing."}
        </p>
      </div>
    </Modal>
  );
}

const POSITIONS: Record<string, { x: number; y: number }> = {
  "top-left": { x: 0.08, y: 0.06 }, "top-center": { x: 0.37, y: 0.06 }, "top-right": { x: 0.6, y: 0.06 },
  "middle-left": { x: 0.08, y: 0.45 }, center: { x: 0.37, y: 0.45 }, "middle-right": { x: 0.6, y: 0.45 },
  "bottom-left": { x: 0.08, y: 0.8 }, "bottom-center": { x: 0.37, y: 0.8 }, "bottom-right": { x: 0.6, y: 0.8 },
};

// 3×3 visual page-position picker — clearer than a dropdown of position names.
const POSITION_GRID = [
  "top-left", "top-center", "top-right",
  "middle-left", "center", "middle-right",
  "bottom-left", "bottom-center", "bottom-right",
];
function PositionGrid({ value, onChange }: { value: string; onChange: (v: string) => void }) {
  return (
    <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 4, width: 132, aspectRatio: "0.77", border: "1px solid var(--border)", borderRadius: 6, padding: 4, background: "#fff" }}
      title="Where the mark appears on each page">
      {POSITION_GRID.map((p) => {
        const active = value === p;
        return (
          <button key={p} type="button" onClick={() => onChange(p)} title={p.replace(/-/g, " ")}
            style={{ border: active ? "2px solid var(--primary)" : "1px solid var(--border)", background: active ? "var(--primary-soft)" : "var(--bg)", borderRadius: 4, cursor: "pointer", padding: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: active ? "var(--primary)" : "var(--border)" }} />
          </button>
        );
      })}
    </div>
  );
}

// Signature thumbnail with a visible fallback if the image can't be loaded.
function MarkThumb({ url, label }: { url?: string; label: string }) {
  const [failed, setFailed] = useState(false);
  if (!url || failed) {
    return <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 22, background: "#f7f5f4", borderRadius: 4 }} className="muted" title={label}>✍</div>;
  }
  return <img src={url} alt={label} onError={() => setFailed(true)} style={{ width: "100%", height: 48, objectFit: "contain", background: "#fff" }} />;
}

// Apply a (preconfigured) signature or a company stamp during approval.
// Do two normalized rectangles (top-left origin) overlap?
function rectsOverlap(a: any, b: any) {
  return !(a.x + a.width <= b.x || b.x + b.width <= a.x || a.y + a.height <= b.y || b.y + b.height <= a.y);
}

function ApplyMarkModal({ docId, profileId, pageCount, canSign, canStamp, requestedType, stampedPages = [], existingPlacements = [], initialKind, onClose, onDone, onError }: any) {
  const [kind, setKind] = useState<"SIGNATURE" | "STAMP">(initialKind || (canSign ? "SIGNATURE" : "STAMP"));
  const [marks, setMarks] = useState<any[]>([]);
  const [markUrls, setMarkUrls] = useState<Record<string, string>>({});
  const [selMark, setSelMark] = useState<string>("");
  const [stamps, setStamps] = useState<any[]>([]);
  const [stampId, setStampId] = useState("");
  const [types, setTypes] = useState<any[]>([]);
  const [allPages, setAllPages] = useState(true);
  const [page, setPage] = useState(1);
  // Signatures restore the user's last-used position; stamps default via the effect below.
  const [pos, setPos] = useState<string>(() => {
    if (initialKind === "STAMP") return "saved";
    try { return localStorage.getItem("sigPos") || "saved"; } catch { return "saved"; }
  });
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("Signature");
  const [newType, setNewType] = useState<string>(requestedType?.id || "");
  const [busy, setBusy] = useState(false);

  // Stamps have no "saved" position — default them to a concrete grid position.
  useEffect(() => { if (kind === "STAMP" && pos === "saved") setPos("bottom-right"); }, [kind]); // eslint-disable-line
  // Remember the last signature position chosen (per browser) for next time.
  useEffect(() => { if (kind === "SIGNATURE") { try { localStorage.setItem("sigPos", pos); } catch { /* ignore */ } } }, [pos, kind]);

  const loadMarks = async () => {
    const list = await unwrap(api.get("/account/marks")).catch(() => []);
    setMarks(list);
    // Auto-select the mark that matches the requested approval type, else the first.
    const match = requestedType ? list.find((m: any) => m.approvalTypeId === requestedType.id) : null;
    setSelMark((cur: string) => match?.id || cur || list[0]?.id || "");
    const urls: Record<string, string> = {};
    await Promise.all(list.map(async (m: any) => {
      try { const r = await api.get(`/account/marks/${m.id}/image`, { responseType: "blob" }); urls[m.id] = URL.createObjectURL(r.data); } catch {}
    }));
    setMarkUrls(urls);
  };

  useEffect(() => {
    unwrap(api.get(`/lookups/profiles/${profileId}/stamps`)).then((s) => { setStamps(s); setStampId(s[0]?.id || ""); }).catch((e) => onError(apiError(e)));
    unwrap(api.get(`/approval-types`)).then(setTypes).catch(() => {});
    loadMarks();
  }, [profileId]);

  // Save a freshly drawn/uploaded signature into the user's library (tagged to a type).
  const saveNewMark = async (blob: Blob) => {
    const fd = new FormData();
    fd.set("image", blob, "mark.png");
    fd.set("label", label || "Signature");
    fd.set("kind", "SIGNATURE");
    if (newType) fd.set("approvalTypeId", newType);
    const created = await unwrap(api.post("/account/marks", fd));
    await loadMarks();
    setSelMark(created.id);
    setAdding(false);
  };

  // Warn (and let the user choose) if a placement would overlap an existing
  // signature/stamp on the same page — marks should not cover each other.
  const overlapOk = (pages: number[], x: number, y: number, w: number, h: number) => {
    const hit = pages.some((pg) =>
      existingPlacements.some((p: any) => p.page === pg && rectsOverlap({ x, y, width: w, height: h }, p)),
    );
    if (!hit) return true;
    return window.confirm("This position overlaps an existing signature or stamp on the page. Signatures and stamps look best when they don't cover each other.\n\nPlace it here anyway? (Cancel to pick a different position.)");
  };

  const place = async () => {
    setBusy(true);
    try {
      const pages = allPages && pageCount > 1 ? Array.from({ length: pageCount }, (_, i) => i + 1) : [page];
      if (kind === "SIGNATURE") {
        const mark = marks.find((m) => m.id === selMark);
        if (!mark) throw new Error("Select or add a signature first");
        const coords = pos === "saved" ? { x: mark.posX, y: mark.posY } : POSITIONS[pos];
        const size = pos === "saved" ? { width: mark.width, height: mark.height } : { width: 0.24, height: 0.09 };
        if (!overlapOk(pages, coords.x, coords.y, size.width, size.height)) { setBusy(false); return; }
        for (const pg of pages) {
          await api.post(`/documents/${docId}/placements`, { kind: "SIGNATURE", savedMarkId: mark.id, page: pg, ...size, ...coords });
        }
      } else {
        if (!stampId) throw new Error("Select a stamp");
        // The company stamp is applied to EVERY page by default (all pages of a
        // document are one document). One stamp per page — skip already-stamped.
        const stampedSet = new Set<number>(stampedPages);
        const target = pages.filter((pg) => !stampedSet.has(pg));
        if (target.length === 0) throw new Error("Every selected page already has the company stamp.");
        const coords = pos === "saved" ? POSITIONS["bottom-right"] : POSITIONS[pos];
        if (!overlapOk(target, coords.x, coords.y, 0.26, 0.12)) { setBusy(false); return; }
        for (const pg of target) {
          await api.post(`/documents/${docId}/placements`, { kind: "STAMP", stampId, page: pg, width: 0.26, height: 0.12, ...coords });
        }
        const skipped = pages.length - target.length;
        onDone(`Company stamp applied to ${target.length} page${target.length > 1 ? "s" : ""}${skipped > 0 ? ` (${skipped} already stamped)` : ""}`);
        return;
      }
      onDone();
    } catch (e: any) { onError(e?.response ? apiError(e) : e.message); } finally { setBusy(false); }
  };

  return (
    <Modal title="Apply Signature / Stamp" onClose={onClose}
      footer={<><button className="btn btn-ghost" onClick={onClose}>Cancel</button><button className="btn btn-primary" disabled={busy} onClick={place}>Apply to PDF</button></>}>
      {requestedType && (
        <div className="card card-pad" style={{ padding: 10, marginBottom: 10, borderLeft: "4px solid #1565c0", fontSize: 13 }}>
          Requested approval type: <strong>{requestedType.name}</strong>
        </div>
      )}
      <div className="row" style={{ marginBottom: 12 }}>
        {canSign && <label className="row" style={{ gap: 6 }}><input type="radio" style={{ width: "auto" }} checked={kind === "SIGNATURE"} onChange={() => setKind("SIGNATURE")} /> Signature</label>}
        {canStamp && <label className="row" style={{ gap: 6 }}><input type="radio" style={{ width: "auto" }} checked={kind === "STAMP"} onChange={() => setKind("STAMP")} /> Company stamp</label>}
      </div>

      {kind === "SIGNATURE" ? (
        <div className="field">
          <label>Choose a saved signature</label>
          {marks.length > 0 && (
            <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 8 }}>
              {marks.map((m) => {
                const on = selMark === m.id;
                return (
                  <button key={m.id} type="button" onClick={() => setSelMark(m.id)}
                    style={{ width: 128, padding: 6, position: "relative", border: `2px solid ${on ? "var(--primary)" : "var(--border)"}`, borderRadius: 8, background: on ? "var(--primary-soft)" : "#fff", cursor: "pointer" }}>
                    {on && <span style={{ position: "absolute", top: -8, right: -8, background: "var(--primary)", color: "#fff", borderRadius: "50%", width: 18, height: 18, fontSize: 11, display: "flex", alignItems: "center", justifyContent: "center" }}>✓</span>}
                    <MarkThumb url={markUrls[m.id]} label={m.label} />
                    <div style={{ fontSize: 11.5, marginTop: 5, fontWeight: 600, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{m.label}</div>
                    {m.approvalTypeId && <div style={{ fontSize: 10, marginTop: 2 }}><span className="badge" style={{ background: "#1565c0", fontSize: 9 }}>{types.find((t) => t.id === m.approvalTypeId)?.name || "type"}</span></div>}
                  </button>
                );
              })}
            </div>
          )}
          {!adding ? (
            <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>+ Add new signature</button>
          ) : (
            <div className="card" style={{ padding: 10, marginTop: 4 }}>
              <div className="field"><label>Label</label>
                <input placeholder="e.g. Signature, Initials" value={label} onChange={(e) => setLabel(e.target.value)} />
              </div>
              {types.length > 0 && (
                <div className="field"><label>Approval type</label>
                  <select value={newType} onChange={(e) => setNewType(e.target.value)}>
                    <option value="">For any approval type</option>
                    {types.map((t) => <option key={t.id} value={t.id}>For "{t.name}" approvals</option>)}
                  </select>
                </div>
              )}
              <SignaturePad onSave={saveNewMark} onError={onError} />
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 8 }} onClick={() => setAdding(false)}>Cancel</button>
            </div>
          )}
          {marks.length === 0 && !adding && <p className="muted" style={{ fontSize: 12 }}>No saved signatures yet — add one.</p>}
        </div>
      ) : (
        <div className="field"><label>Company stamp</label>
          <select value={stampId} onChange={(e) => setStampId(e.target.value)}>{stamps.map((s) => <option key={s.id} value={s.id}>{s.name}</option>)}</select>
          {stamps.length === 0 && <p className="muted" style={{ fontSize: 12 }}>No stamps available in this company.</p>}
          <p className="muted" style={{ fontSize: 12 }}>{pageCount > 1 ? "The company stamp is applied to all pages by default (one stamp per page)." : "The company stamp is applied to the document."}{stampedPages.length > 0 ? ` Already stamped: page ${[...stampedPages].sort((a: number, b: number) => a - b).join(", ")}.` : ""}</p>
        </div>
      )}

      <div className="row" style={{ alignItems: "flex-start" }}>
        {pageCount > 1 ? (
          <div className="field grow">
            <label>Pages</label>
            <label className="check" style={{ marginBottom: allPages ? 0 : 8 }}>
              <input type="checkbox" checked={allPages} onChange={(e) => setAllPages(e.target.checked)} />
              All {pageCount} pages{kind === "STAMP" ? " (recommended)" : ""}
            </label>
            {!allPages && <input type="number" min={1} max={pageCount} value={page} onChange={(e) => setPage(Number(e.target.value))} />}
          </div>
        ) : (
          <div className="field grow"><label>Page{pageCount > 1 ? ` (1–${pageCount})` : ""}</label><input type="number" min={1} max={pageCount || undefined} value={page} onChange={(e) => setPage(Number(e.target.value))} /></div>
        )}
        <div className="field grow"><label>Position on page</label>
          {kind === "SIGNATURE" && (
            <label className="check" style={{ marginBottom: 8 }}>
              <input type="checkbox" checked={pos === "saved"} onChange={(e) => setPos(e.target.checked ? "saved" : "bottom-right")} />
              Use my saved position
            </label>
          )}
          {pos !== "saved"
            ? <PositionGrid value={pos} onChange={setPos} />
            : <span className="muted" style={{ fontSize: 12 }}>Uses the position saved with your signature.</span>}
        </div>
      </div>
      <p className="muted" style={{ fontSize: 12 }}>Shows on the PDF preview immediately and is baked into the final signed PDF on completion.</p>
    </Modal>
  );
}

// Draw-to-sign pad (or upload an image of a signature).
function SignaturePad({ onSave, onError }: { onSave: (b: Blob) => Promise<void>; onError: (m: string) => void }) {
  const ref = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);
  const [saved, setSaved] = useState(false);

  const pos = (e: any) => {
    const c = ref.current!; const r = c.getBoundingClientRect();
    const t = e.touches?.[0];
    return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top };
  };
  const start = (e: any) => { drawing.current = true; const ctx = ref.current!.getContext("2d")!; const p = pos(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: any) => {
    if (!drawing.current) return;
    e.preventDefault();
    const ctx = ref.current!.getContext("2d")!; const p = pos(e);
    ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#1e1f1e";
    ctx.lineTo(p.x, p.y); ctx.stroke();
  };
  const end = () => { drawing.current = false; };
  const clear = () => { const c = ref.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); setSaved(false); };

  const save = async () => {
    const c = ref.current!;
    c.toBlob(async (blob) => {
      if (!blob) return onError("Could not capture signature");
      try { await onSave(blob); setSaved(true); } catch (e: any) { onError(apiError(e)); }
    }, "image/png");
  };

  const upload = async (file: File | null) => { if (file) try { await onSave(file); setSaved(true); } catch (e: any) { onError(apiError(e)); } };

  return (
    <div>
      <canvas ref={ref} width={440} height={150}
        style={{ width: "100%", height: 150, border: "1px dashed var(--border)", borderRadius: 8, background: "#fff", touchAction: "none", cursor: "crosshair" }}
        onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
        onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
      <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
        <button className="btn btn-primary btn-sm" onClick={save}>{saved ? "✓ Saved" : "Save signature"}</button>
        <button className="btn btn-ghost btn-sm" onClick={clear}>Clear</button>
        <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>Upload image
          <input type="file" accept="image/png,image/jpeg" style={{ display: "none" }} onChange={(e) => upload(e.target.files?.[0] || null)} />
        </label>
      </div>
      <p className="muted" style={{ fontSize: 12, marginTop: 4 }}>Draw your signature above, then Save — or upload a signature image.</p>
    </div>
  );
}
