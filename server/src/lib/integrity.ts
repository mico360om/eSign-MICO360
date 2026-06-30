import crypto from "crypto";
import fs from "fs";

/** SHA-256 hex digest of a file (empty string if missing). */
export function sha256File(absPath: string): string {
  if (!absPath || !fs.existsSync(absPath)) return "";
  const buf = fs.readFileSync(absPath);
  return crypto.createHash("sha256").update(buf).digest("hex");
}

/** SHA-256 hex digest of a string/buffer. */
export function sha256(data: string | Buffer): string {
  return crypto.createHash("sha256").update(data).digest("hex");
}
