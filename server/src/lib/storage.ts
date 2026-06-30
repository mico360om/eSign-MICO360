import fs from "fs";
import path from "path";
import { env } from "../config/env";

// Storage layout (all under STORAGE_DIR):
//   originals/   — untouched uploaded files
//   converted/   — generated PDF copies used in the workflow
//   final/       — final signed + stamped PDFs
//   signatures/  — user signature images
//   stamps/      — company stamp images
export const dirs = {
  originals: path.join(env.storageDir, "originals"),
  converted: path.join(env.storageDir, "converted"),
  final: path.join(env.storageDir, "final"),
  signatures: path.join(env.storageDir, "signatures"),
  stamps: path.join(env.storageDir, "stamps"),
  profiles: path.join(env.storageDir, "profiles"),
};

export function ensureStorage() {
  for (const d of Object.values(dirs)) {
    fs.mkdirSync(d, { recursive: true });
  }
}

export function fileExists(p?: string | null): boolean {
  return !!p && fs.existsSync(p);
}

/** Resolve a stored relative path to an absolute one (paths are stored relative to STORAGE_DIR). */
export function abs(relative: string): string {
  return path.isAbsolute(relative) ? relative : path.join(env.storageDir, relative);
}

/** Store a relative path (so the DB stays portable across machines). */
export function rel(absolute: string): string {
  return path.relative(env.storageDir, absolute);
}
