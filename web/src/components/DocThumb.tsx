import { useEffect, useState } from "react";
import { api } from "../lib/api";
import { renderThumbnail, getCachedThumb, setCachedThumb } from "../lib/pdf";

/** First-page thumbnail of a document's PDF (rendered with pdf.js, cached). */
export function DocThumb({ docId, kind = "converted", size = 44 }: { docId: string; kind?: string; size?: number }) {
  const [url, setUrl] = useState<string | null>(getCachedThumb(docId) || null);

  useEffect(() => {
    if (url) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await api.get(`/documents/${docId}/view/${kind}`, { responseType: "arraybuffer" });
        const thumb = await renderThumbnail(res.data as ArrayBuffer, 160);
        if (cancelled) return;
        setCachedThumb(docId, thumb);
        setUrl(thumb);
      } catch {
        /* leave placeholder */
      }
    })();
    return () => { cancelled = true; };
  }, [docId]);

  return (
    <div style={{ width: size, height: size, borderRadius: 6, border: "1px solid var(--border)", overflow: "hidden", background: "#f0eeec", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
      {url ? <img src={url} alt="" style={{ width: "100%", height: "100%", objectFit: "cover", objectPosition: "top" }} /> : <span style={{ fontSize: 18 }}>📄</span>}
    </div>
  );
}
