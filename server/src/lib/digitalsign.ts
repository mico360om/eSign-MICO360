import fs from "fs";
import { ensureSigningCert } from "./cert";

/**
 * Embed a cryptographic PKCS#7 (PAdES-style) signature into a PDF, in place.
 * Any later edit to the PDF invalidates the signature's ByteRange — making the
 * document tamper-evident and verifiable in Adobe Reader / any PDF validator.
 *
 * @signpdf v3 is ESM-only; it is imported dynamically and bundled by esbuild for
 * the desktop build, and loaded natively by tsx in dev.
 */
export async function digitallySignPdf(
  absPath: string,
  opts: { reason?: string; name?: string; location?: string } = {},
): Promise<void> {
  const { p12, passphrase } = ensureSigningCert();

  const signpdfMod = await import("@signpdf/signpdf");
  const { P12Signer } = await import("@signpdf/signer-p12");
  const { plainAddPlaceholder } = await import("@signpdf/placeholder-plain");

  const signpdf: any = (signpdfMod as any).default ?? signpdfMod;

  let pdf: Buffer = fs.readFileSync(absPath);
  pdf = plainAddPlaceholder({
    pdfBuffer: pdf,
    reason: opts.reason ?? "Approved via eSign MICO360",
    contactInfo: "esign@mico360.com",
    name: opts.name ?? "eSign MICO360 Signing Authority",
    location: opts.location ?? "MICO360",
  });

  const signer = new P12Signer(p12, { passphrase });
  const signed: Buffer = await signpdf.sign(pdf, signer);
  fs.writeFileSync(absPath, signed);
}

/** True if the PDF file contains an embedded digital signature (ByteRange marker). */
export function pdfHasSignature(absPath: string): boolean {
  if (!fs.existsSync(absPath)) return false;
  return fs.readFileSync(absPath).includes(Buffer.from("/ByteRange"));
}
