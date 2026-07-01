import { useEffect, useRef, useState } from "react";
import { api, apiError, unwrap } from "../lib/api";
import { useToast } from "./ui";

// Self-service signature library — every user (admin included) manages their own
// signatures/initials here. Backed by the /account/marks endpoints.
export default function SignatureManager() {
  const toast = useToast();
  const [marks, setMarks] = useState<any[] | null>(null);
  const [urls, setUrls] = useState<Record<string, string>>({});
  const [adding, setAdding] = useState(false);
  const [label, setLabel] = useState("Signature");
  const [busy, setBusy] = useState(false);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const drawing = useRef(false);

  const load = async () => {
    const list = await unwrap<any[]>(api.get("/account/marks")).catch(() => []);
    setMarks(list);
    const u: Record<string, string> = {};
    await Promise.all(list.map(async (m) => {
      try { const r = await api.get(`/account/marks/${m.id}/image`, { responseType: "blob" }); u[m.id] = URL.createObjectURL(r.data); } catch {}
    }));
    setUrls(u);
  };
  useEffect(() => { load(); }, []);

  // ── drawing ──
  const at = (e: any) => { const c = canvasRef.current!; const r = c.getBoundingClientRect(); const t = e.touches?.[0]; return { x: (t ? t.clientX : e.clientX) - r.left, y: (t ? t.clientY : e.clientY) - r.top }; };
  const start = (e: any) => { drawing.current = true; const ctx = canvasRef.current!.getContext("2d")!; const p = at(e); ctx.beginPath(); ctx.moveTo(p.x, p.y); };
  const move = (e: any) => { if (!drawing.current) return; e.preventDefault(); const ctx = canvasRef.current!.getContext("2d")!; const p = at(e); ctx.lineWidth = 2.5; ctx.lineCap = "round"; ctx.strokeStyle = "#1e1f1e"; ctx.lineTo(p.x, p.y); ctx.stroke(); };
  const end = () => { drawing.current = false; };
  const clearCanvas = () => { const c = canvasRef.current!; c.getContext("2d")!.clearRect(0, 0, c.width, c.height); };

  const upload = async (blob: Blob) => {
    setBusy(true);
    try {
      const fd = new FormData();
      fd.set("image", blob, "signature.png");
      fd.set("label", label.trim() || "Signature");
      fd.set("kind", "SIGNATURE");
      await api.post("/account/marks", fd);
      setAdding(false); setLabel("Signature"); clearCanvas();
      await load();
      toast("Signature saved");
    } catch (e) { toast(apiError(e), true); } finally { setBusy(false); }
  };

  const saveDrawn = () => {
    const c = canvasRef.current!;
    // guard against an empty canvas
    const blank = document.createElement("canvas"); blank.width = c.width; blank.height = c.height;
    if (c.toDataURL() === blank.toDataURL()) return toast("Draw your signature first", true);
    c.toBlob((b) => { if (b) upload(b); else toast("Could not capture signature", true); }, "image/png");
  };

  const remove = async (id: string) => {
    if (!confirm("Delete this signature?")) return;
    try { await api.delete(`/account/marks/${id}`); await load(); toast("Deleted"); } catch (e) { toast(apiError(e), true); }
  };

  return (
    <div className="card card-pad">
      <div className="between" style={{ marginBottom: 12 }}>
        <h3 style={{ margin: 0, fontSize: 15 }}>My Signatures</h3>
        {!adding && <button className="btn btn-ghost btn-sm" onClick={() => setAdding(true)}>+ Add signature</button>}
      </div>

      {marks === null ? <div className="muted">Loading…</div> : (
        <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginBottom: adding ? 14 : 0 }}>
          {marks.map((m) => (
            <div key={m.id} style={{ width: 150, border: "1px solid var(--border)", borderRadius: 8, padding: 8, textAlign: "center" }}>
              <div style={{ height: 48, display: "flex", alignItems: "center", justifyContent: "center", background: "#fff" }}>
                {urls[m.id]
                  ? <img src={urls[m.id]} alt={m.label} onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }} style={{ maxWidth: "100%", maxHeight: 48, objectFit: "contain" }} />
                  : <span className="muted" style={{ fontSize: 22 }}>✍</span>}
              </div>
              <div style={{ fontSize: 12, marginTop: 6 }}>{m.label}</div>
              <button className="btn btn-ghost btn-sm" style={{ marginTop: 6 }} onClick={() => remove(m.id)}>Delete</button>
            </div>
          ))}
          {marks.length === 0 && !adding && <div className="muted" style={{ fontSize: 13 }}>No signatures yet — add one to sign documents.</div>}
        </div>
      )}

      {adding && (
        <div className="card" style={{ padding: 12, background: "var(--bg)" }}>
          <div className="field"><label>Label</label><input value={label} onChange={(e) => setLabel(e.target.value)} placeholder="e.g. Signature, Initials" /></div>
          <label style={{ fontWeight: 600, fontSize: 12.5, color: "var(--ink-soft)" }}>Draw your signature</label>
          <canvas ref={canvasRef} width={440} height={140}
            style={{ width: "100%", height: 140, border: "1px dashed var(--border)", borderRadius: 8, background: "#fff", touchAction: "none", cursor: "crosshair", marginTop: 6 }}
            onMouseDown={start} onMouseMove={move} onMouseUp={end} onMouseLeave={end}
            onTouchStart={start} onTouchMove={move} onTouchEnd={end} />
          <div className="row" style={{ marginTop: 8, gap: 8, flexWrap: "wrap" }}>
            <button className="btn btn-primary btn-sm" disabled={busy} onClick={saveDrawn}>Save signature</button>
            <button className="btn btn-ghost btn-sm" onClick={clearCanvas}>Clear</button>
            <label className="btn btn-ghost btn-sm" style={{ cursor: "pointer" }}>Upload image
              <input type="file" accept="image/png,image/jpeg" style={{ display: "none" }} onChange={(e) => { const f = e.target.files?.[0]; if (f) upload(f); }} />
            </label>
            <div className="grow" />
            <button className="btn btn-ghost btn-sm" onClick={() => { setAdding(false); clearCanvas(); }}>Cancel</button>
          </div>
          <p className="muted" style={{ fontSize: 11, marginTop: 6 }}>Draw above and Save, or upload a signature image (transparent PNG recommended).</p>
        </div>
      )}
    </div>
  );
}
