import * as pdfjsLib from "pdfjs-dist";

// Worker + standard fonts are served as static assets from the origin root
// (web/public → dist, served by Vite in dev and the embedded server in the
// desktop app). Most robust across dev/build/Electron + paths with spaces.
pdfjsLib.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

export { pdfjsLib };

// Standard (non-embedded) fonts like Helvetica — which pdf-lib uses for the
// converted PDFs — need these data files to render in pdf.js.
const STANDARD_FONT_DATA_URL = "/standard_fonts/";

/** Load a PDF document with standard-font support. */
export function loadPdf(data: ArrayBuffer) {
  return pdfjsLib.getDocument({ data, standardFontDataUrl: STANDARD_FONT_DATA_URL }).promise;
}

// Cache rendered thumbnails by document id (dashboard re-renders often).
const thumbCache = new Map<string, string>();

/** Render page 1 of a PDF (ArrayBuffer) to a small PNG data URL. */
export async function renderThumbnail(data: ArrayBuffer, maxWidth = 220): Promise<string> {
  const doc = await loadPdf(data);
  const page = await doc.getPage(1);
  const base = page.getViewport({ scale: 1 });
  const scale = Math.min(maxWidth / base.width, 2);
  const viewport = page.getViewport({ scale });
  const canvas = document.createElement("canvas");
  canvas.width = Math.ceil(viewport.width);
  canvas.height = Math.ceil(viewport.height);
  await page.render({ canvasContext: canvas.getContext("2d")!, viewport }).promise;
  const url = canvas.toDataURL("image/png");
  doc.destroy();
  return url;
}

export const getCachedThumb = (id: string) => thumbCache.get(id);
export const setCachedThumb = (id: string, url: string) => thumbCache.set(id, url);
