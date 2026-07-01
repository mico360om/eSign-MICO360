import { useCallback, useEffect, useRef, useState } from "react";
import { loadPdf } from "../lib/pdf";

export interface Overlay {
  id: string;
  page: number;
  x: number; // normalized 0..1 (top-left)
  y: number;
  width: number;
  height: number;
  imageUrl: string;
}

function PageCanvas({ pdf, pageNum, scale, overlays }: { pdf: any; pageNum: number; scale: number; overlays: Overlay[] }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [size, setSize] = useState({ w: 0, h: 0 });

  useEffect(() => {
    if (!pdf || !canvasRef.current) return;
    let cancelled = false;
    let task: any;
    (async () => {
      const p = await pdf.getPage(pageNum);
      if (cancelled) return;
      const viewport = p.getViewport({ scale });
      const canvas = canvasRef.current!;
      canvas.width = Math.ceil(viewport.width);
      canvas.height = Math.ceil(viewport.height);
      setSize({ w: canvas.width, h: canvas.height });
      task = p.render({ canvasContext: canvas.getContext("2d")!, viewport });
      try { await task.promise; } catch { /* cancelled */ }
    })();
    return () => { cancelled = true; if (task) try { task.cancel(); } catch {} };
  }, [pdf, pageNum, scale]);

  return (
    <div style={{ position: "relative", width: size.w || "auto", height: size.h || "auto", boxShadow: "0 2px 12px rgba(0,0,0,0.45)", background: "#fff", marginBottom: 16, flexShrink: 0 }}>
      <canvas ref={canvasRef} style={{ display: "block" }} />
      {overlays.map((o) => (
        <img
          key={o.id}
          src={o.imageUrl}
          alt=""
          onError={(e) => { (e.target as HTMLImageElement).style.display = "none"; }}
          style={{ position: "absolute", left: `${o.x * 100}%`, top: `${o.y * 100}%`, width: `${o.width * 100}%`, height: `${o.height * 100}%`, objectFit: "contain", pointerEvents: "none" }}
        />
      ))}
    </div>
  );
}

/**
 * Continuous-scroll PDF viewer. All pages are rendered top-to-bottom in a
 * single scrollable container. Overlays are applied per-page.
 */
export function PdfCanvas({ data, overlays = [] }: { data: ArrayBuffer | null; overlays?: Overlay[] }) {
  const wrapRef = useRef<HTMLDivElement>(null);
  const [pdf, setPdf] = useState<any>(null);
  const [numPages, setNumPages] = useState(0);
  const [scale, setScale] = useState(1.2);
  const [err, setErr] = useState("");

  useEffect(() => {
    if (!data) return;
    let cancelled = false;
    setErr("");
    setPdf(null);
    setNumPages(0);
    (async () => {
      try {
        const doc = await loadPdf(data.byteLength > 0 ? data.slice(0) : data);
        if (cancelled) return;
        setPdf(doc);
        setNumPages(doc.numPages);
      } catch (e: any) {
        setErr("Could not render PDF: " + (e?.message || e));
      }
    })();
    return () => { cancelled = true; };
  }, [data]);

  const fitWidth = useCallback(async () => {
    if (!pdf || !wrapRef.current) return;
    const p = await pdf.getPage(1);
    const vp = p.getViewport({ scale: 1 });
    setScale(Math.max(0.3, (wrapRef.current.clientWidth - 28) / vp.width));
  }, [pdf]);

  useEffect(() => { if (pdf) fitWidth(); }, [pdf, fitWidth]);

  if (err) return <div className="card-pad" style={{ color: "var(--danger)" }}>{err}</div>;
  if (!data) return <div className="card-pad muted">No PDF available.</div>;

  const pages = Array.from({ length: numPages }, (_, i) => i + 1);

  return (
    <div ref={wrapRef} style={{ display: "flex", flexDirection: "column", height: 640 }}>
      <div className="row" style={{ gap: 8, padding: "8px 10px", borderBottom: "1px solid var(--border)", flexWrap: "wrap" }}>
        <span className="muted" style={{ fontSize: 13 }}>{numPages > 0 ? `${numPages} page${numPages !== 1 ? "s" : ""}` : "…"}</span>
        <div className="grow" />
        <button className="btn btn-ghost btn-sm" aria-label="Zoom out" onClick={() => setScale((s) => Math.max(0.3, s - 0.2))}>−</button>
        <span className="muted" style={{ fontSize: 13 }}>{Math.round(scale * 100)}%</span>
        <button className="btn btn-ghost btn-sm" aria-label="Zoom in" onClick={() => setScale((s) => Math.min(4, s + 0.2))}>+</button>
        <button className="btn btn-ghost btn-sm" onClick={fitWidth}>Fit width</button>
      </div>
      <div style={{ overflow: "auto", flex: 1, background: "#525659", display: "flex", flexDirection: "column", alignItems: "center", padding: 14 }}>
        {pdf && pages.map((n) => (
          <PageCanvas key={n} pdf={pdf} pageNum={n} scale={scale} overlays={overlays.filter((o) => o.page === n)} />
        ))}
      </div>
    </div>
  );
}
