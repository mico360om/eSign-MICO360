import dotenv from "dotenv";
import path from "path";
import fs from "fs";
import crypto from "crypto";

dotenv.config();

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

/**
 * JWT signing secret. Priority: JWT_SECRET env (the desktop app passes a
 * per-install random secret this way) → a secret persisted in the storage dir →
 * a freshly generated one that is then persisted. A hardcoded fallback would let
 * anyone forge admin tokens on deployments that forgot to set the env var.
 */
function resolveJwtSecret(storageDir: string): string {
  if (process.env.JWT_SECRET) return process.env.JWT_SECRET;
  const secretFile = path.join(storageDir, ".jwtsecret");
  try {
    const existing = fs.readFileSync(secretFile, "utf8").trim();
    if (existing) return existing;
  } catch { /* not created yet */ }
  const generated = crypto.randomBytes(32).toString("hex");
  try {
    fs.mkdirSync(storageDir, { recursive: true });
    fs.writeFileSync(secretFile, generated, { encoding: "utf8" });
  } catch { /* read-only fs: tokens just won't survive restarts */ }
  return generated;
}

const storageDir = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? "storage");

export const env = {
  port: int(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: resolveJwtSecret(storageDir),
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  storageDir,
  // When set, the API also serves the built web SPA from this directory
  // (used by the desktop app and single-server production deployments).
  webDist: process.env.WEB_DIST ? path.resolve(process.env.WEB_DIST) : "",
  maxFileSizeMb: int(process.env.MAX_FILE_SIZE_MB, 25),
  allowedExtensions: (process.env.ALLOWED_EXTENSIONS ?? "pdf,doc,docx,xls,xlsx,ppt,pptx,png,jpg,jpeg,txt")
    .split(",")
    .map((s) => s.trim().toLowerCase())
    .filter(Boolean),
  corsOrigins: (process.env.CORS_ORIGINS ?? "http://localhost:5173")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
};
