import fs from "fs";
import path from "path";
import { PDFDocument, rgb } from "pdf-lib";
import fontkit from "@pdf-lib/fontkit";
import { dirs } from "./storage";
import { EMBEDDED_FONT_B64 } from "../assets/font";

const IMG_EXT = new Set([".png", ".jpg", ".jpeg"]);
const FONT_BYTES = Buffer.from(EMBEDDED_FONT_B64, "base64");

// Optional HTML→PDF renderer injected by the desktop shell (Electron's
// printToPDF). When present, Word documents are rendered with real layout
// without needing LibreOffice. Standalone/server runs leave this null.
type HtmlToPdf = (html: string) => Promise<Buffer | Uint8Array>;
let htmlToPdf: HtmlToPdf | null = null;
export function setHtmlToPdf(fn: HtmlToPdf | null) {
  htmlToPdf = fn;
}

// Embed our own TrueType font so generated PDFs render in pdf.js without needing
// the (sometimes flaky) standard-font data files in the browser/Electron.
async function embedAppFont(pdf: PDFDocument) {
  pdf.registerFontkit(fontkit);
  return pdf.embedFont(FONT_BYTES, { subset: true });
}

/**
 * Produce a PDF copy of an uploaded document. The ORIGINAL is never touched.
 *
 *  - .pdf            → copied verbatim into converted/
 *  - .png/.jpg/.jpeg → embedded onto a PDF page
 *  - .txt            → rendered as text onto PDF pages
 *  - .doc/.docx/...  → a cover PDF is produced. True Office→PDF fidelity needs
 *                      LibreOffice/soffice; see convertOfficeWithSoffice().
 *
 * Returns the absolute path of the generated converted PDF.
 */
export async function convertToPdf(originalAbsPath: string, originalName: string): Promise<string> {
  const ext = path.extname(originalName || originalAbsPath).toLowerCase();
  const outName = `${path.parse(originalName || "document").name}-${Date.now()}.pdf`;
  const outPath = path.join(dirs.converted, outName);

  if (ext === ".pdf") {
    fs.copyFileSync(originalAbsPath, outPath);
    return outPath;
  }

  const pdf = await PDFDocument.create();

  if (IMG_EXT.has(ext)) {
    const bytes = fs.readFileSync(originalAbsPath);
    const img = ext === ".png" ? await pdf.embedPng(bytes) : await pdf.embedJpg(bytes);
    const page = pdf.addPage([img.width, img.height]);
    page.drawImage(img, { x: 0, y: 0, width: img.width, height: img.height });
  } else if (ext === ".txt") {
    await renderTextPdf(pdf, fs.readFileSync(originalAbsPath, "utf8"));
  } else {
    // Office / unsupported binary. In order of fidelity:
    //  1) LibreOffice (soffice) if installed — best fidelity, all Office types.
    const converted = await convertOfficeWithSoffice(originalAbsPath, outPath);
    if (converted) return outPath;
    //  2) Word (.docx) via mammoth → HTML → PDF using the desktop shell's
    //     printer. Bundled in the installer, so no external tools are required.
    if (ext === ".docx" && htmlToPdf) {
      const buf = await convertDocxViaHtml(originalAbsPath).catch(() => null);
      if (buf) {
        fs.writeFileSync(outPath, Buffer.from(buf));
        return outPath;
      }
    }
    //  3) Honest cover page fallback (xlsx/pptx without LibreOffice, etc.).
    await renderCoverPdf(pdf, originalName, ext);
  }

  fs.writeFileSync(outPath, await pdf.save());
  return outPath;
}

/**
 * Convert a .docx to PDF without LibreOffice: mammoth renders the document to
 * clean HTML (text, headings, lists, tables, inline images), which the injected
 * desktop renderer (Electron printToPDF) turns into a real, paginated PDF.
 */
async function convertDocxViaHtml(srcAbs: string): Promise<Buffer | Uint8Array | null> {
  if (!htmlToPdf) return null;
  const mammoth = await import("mammoth");
  const { value: body } = await mammoth.convertToHtml(
    { path: srcAbs },
    { convertImage: (mammoth as any).images.imgElement((img: any) => img.read("base64").then((data: string) => ({ src: `data:${img.contentType};base64,${data}` }))) },
  );
  const html = `<!doctype html><html><head><meta charset="utf-8"><style>
    @page { margin: 18mm; }
    body { font-family: 'Segoe UI', Calibri, Arial, sans-serif; font-size: 11.5pt; color: #1e1f1e; line-height: 1.5; margin: 0; }
    h1,h2,h3,h4 { color: #1e1f1e; margin: 0.6em 0 0.3em; }
    p { margin: 0 0 0.5em; }
    table { border-collapse: collapse; width: 100%; margin: 8px 0; }
    td, th { border: 1px solid #bfbfbf; padding: 5px 8px; vertical-align: top; }
    img { max-width: 100%; height: auto; }
    ul, ol { margin: 0.3em 0 0.6em 1.4em; }
  </style></head><body>${body}</body></html>`;
  return htmlToPdf!(html);
}

async function renderTextPdf(pdf: PDFDocument, text: string) {
  const font = await embedAppFont(pdf);
  const size = 11;
  const margin = 50;
  const pageW = 595.28;
  const pageH = 841.89; // A4
  const maxWidth = pageW - margin * 2;
  const lineHeight = size * 1.4;

  const wrapped: string[] = [];
  for (const raw of text.split(/\r?\n/)) {
    let line = "";
    for (const word of raw.split(" ")) {
      const test = line ? `${line} ${word}` : word;
      if (font.widthOfTextAtSize(test, size) > maxWidth && line) {
        wrapped.push(line);
        line = word;
      } else {
        line = test;
      }
    }
    wrapped.push(line);
  }

  let page = pdf.addPage([pageW, pageH]);
  let y = pageH - margin;
  for (const line of wrapped) {
    if (y < margin) {
      page = pdf.addPage([pageW, pageH]);
      y = pageH - margin;
    }
    page.drawText(line, { x: margin, y, size, font, color: rgb(0.12, 0.12, 0.12) });
    y -= lineHeight;
  }
}

async function renderCoverPdf(pdf: PDFDocument, originalName: string, ext: string) {
  const font = await embedAppFont(pdf);
  const body = font;
  const page = pdf.addPage([595.28, 841.89]);
  const maroon = rgb(0.54, 0.1, 0.11);
  page.drawText("eSign MICO360", { x: 50, y: 760, size: 22, font, color: maroon });
  page.drawText("Converted document copy", { x: 50, y: 730, size: 12, font: body });
  page.drawText(`Original file: ${originalName}`, { x: 50, y: 690, size: 12, font: body });
  page.drawText(`Type: ${ext.replace(".", "").toUpperCase()}`, { x: 50, y: 670, size: 12, font: body });
  page.drawText(
    "A full-fidelity PDF render of this Office document requires LibreOffice",
    { x: 50, y: 630, size: 10, font: body, color: rgb(0.4, 0.4, 0.4) },
  );
  page.drawText(
    "(soffice) on the server. The untouched original remains available for download.",
    { x: 50, y: 615, size: 10, font: body, color: rgb(0.4, 0.4, 0.4) },
  );
}

/**
 * Best-effort Office→PDF using a local LibreOffice install. Returns true on success.
 * Kept dependency-free: if `soffice` isn't on PATH this simply returns false and the
 * caller falls back to the cover page.
 */
/** Locate the LibreOffice/soffice binary: SOFFICE_PATH env, then common install paths, then PATH. */
function findSoffice(): string | null {
  if (process.env.SOFFICE_PATH && fs.existsSync(process.env.SOFFICE_PATH)) return process.env.SOFFICE_PATH;
  const candidates =
    process.platform === "win32"
      ? [
          "C:/Program Files/LibreOffice/program/soffice.exe",
          "C:/Program Files (x86)/LibreOffice/program/soffice.exe",
        ]
      : process.platform === "darwin"
        ? ["/Applications/LibreOffice.app/Contents/MacOS/soffice"]
        : ["/usr/bin/soffice", "/usr/local/bin/soffice", "/opt/libreoffice/program/soffice", "/snap/bin/libreoffice"];
  for (const c of candidates) if (fs.existsSync(c)) return c;
  return process.platform === "win32" ? "soffice.exe" : "soffice"; // last resort: rely on PATH
}

async function convertOfficeWithSoffice(srcAbs: string, outAbs: string): Promise<boolean> {
  try {
    const { execFileSync } = await import("child_process");
    const soffice = findSoffice();
    if (!soffice) return false;
    const outDir = path.dirname(outAbs);
    execFileSync(
      soffice,
      ["--headless", "--norestore", "--convert-to", "pdf", "--outdir", outDir, srcAbs],
      { stdio: "ignore", timeout: 90_000 },
    );
    const produced = path.join(outDir, `${path.parse(srcAbs).name}.pdf`);
    if (fs.existsSync(produced)) {
      if (produced !== outAbs) fs.renameSync(produced, outAbs);
      return true;
    }
    return false;
  } catch {
    return false; // not installed / failed -> caller emits the cover page
  }
}

export interface PlacementInput {
  kind: "SIGNATURE" | "STAMP";
  page: number; // 1-based
  x: number; // normalized 0..1 (left)
  y: number; // normalized 0..1 (top)
  width: number; // normalized 0..1
  height: number; // normalized 0..1
  imageAbsPath: string;
}

/**
 * Apply signature/stamp images onto a COPY of the converted PDF, producing the
 * final signed PDF. Coordinates are normalized (0..1) with origin top-left,
 * matching how clients render the preview.
 */
export async function applyPlacements(
  convertedPdfAbsPath: string,
  placements: PlacementInput[],
): Promise<string> {
  const bytes = fs.readFileSync(convertedPdfAbsPath);
  const pdf = await PDFDocument.load(bytes);
  const pages = pdf.getPages();

  for (const pl of placements) {
    const page = pages[(pl.page || 1) - 1];
    if (!page) continue;
    try {
      if (!fs.existsSync(pl.imageAbsPath)) continue;
      const { width: pw, height: ph } = page.getSize();
      const imgBytes = fs.readFileSync(pl.imageAbsPath);
      const isPng = pl.imageAbsPath.toLowerCase().endsWith(".png");
      const img = isPng ? await pdf.embedPng(imgBytes) : await pdf.embedJpg(imgBytes);

      const w = pl.width * pw;
      const h = pl.height * ph;
      const x = pl.x * pw;
      // convert top-left normalized y to pdf-lib bottom-left coordinate
      const y = ph - pl.y * ph - h;
      page.drawImage(img, { x, y, width: w, height: h });
    } catch {
      // A corrupt/unsupported placement image must not break finalization.
    }
  }

  const outName = `signed-${path.parse(convertedPdfAbsPath).name}-${Date.now()}.pdf`;
  const outPath = path.join(dirs.final, outName);
  // useObjectStreams:false keeps the PDF structure simple so a digital-signature
  // placeholder can be appended afterwards if the document is signed digitally.
  fs.writeFileSync(outPath, await pdf.save({ useObjectStreams: false }));
  return outPath;
}

/** Count pages in a PDF (used by clients to build the page selector). */
export async function pdfPageCount(absPath: string): Promise<number> {
  const pdf = await PDFDocument.load(fs.readFileSync(absPath));
  return pdf.getPageCount();
}
