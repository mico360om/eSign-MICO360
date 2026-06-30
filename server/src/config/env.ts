import dotenv from "dotenv";
import path from "path";

dotenv.config();

const int = (v: string | undefined, fallback: number) => {
  const n = Number(v);
  return Number.isFinite(n) ? n : fallback;
};

export const env = {
  port: int(process.env.PORT, 4000),
  nodeEnv: process.env.NODE_ENV ?? "development",
  databaseUrl: process.env.DATABASE_URL ?? "",
  jwtSecret: process.env.JWT_SECRET ?? "dev-insecure-secret-change-me",
  jwtExpiresIn: process.env.JWT_EXPIRES_IN ?? "8h",
  storageDir: path.resolve(process.cwd(), process.env.STORAGE_DIR ?? "storage"),
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
