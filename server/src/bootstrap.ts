/**
 * Embedded bootstrap for the standalone desktop app.
 *
 * Starts the full API + web UI in-process against a SQLite file in a writable
 * directory, creating the schema and seeding demo data on first run — no Prisma
 * CLI, no external database. Modules that read env are required lazily AFTER env
 * is set so the configuration takes effect.
 */
import fs from "fs";
import path from "path";

export interface EmbeddedOptions {
  dbFile: string; // absolute path to the SQLite file
  storageDir: string; // absolute path for uploaded files
  webDist: string; // absolute path to the built web SPA
  migrationsDir: string; // absolute path to the prisma/migrations directory
  stampImagePath?: string; // optional image to seed as the default company stamp
  port: number;
  jwtSecret: string;
  // Optional HTML→PDF renderer (Electron printToPDF) so Word docs convert
  // with real layout in the packaged desktop app — no LibreOffice needed.
  htmlToPdf?: (html: string) => Promise<Buffer | Uint8Array>;
}

export async function startEmbedded(opts: EmbeddedOptions): Promise<{ port: number }> {
  // connection_limit=1 keeps all raw migration statements on one connection so
  // PRAGMA state + table-redefine sequences apply correctly.
  process.env.DATABASE_URL = `file:${opts.dbFile}?connection_limit=1`;
  process.env.STORAGE_DIR = opts.storageDir;
  process.env.WEB_DIST = opts.webDist;
  process.env.PORT = String(opts.port);
  process.env.JWT_SECRET = opts.jwtSecret;
  process.env.NODE_ENV = process.env.NODE_ENV ?? "production";

  fs.mkdirSync(path.dirname(opts.dbFile), { recursive: true });

  // Lazy requires — must come after the env assignments above.
  const { prisma } = require("./lib/prisma");
  const { ensureStorage } = require("./lib/storage");
  ensureStorage();

  // Register the desktop HTML→PDF renderer for Word-document conversion.
  if (opts.htmlToPdf) {
    try { require("./lib/pdf").setHtmlToPdf(opts.htmlToPdf); } catch { /* non-fatal */ }
  }

  await runMigrations(prisma, opts.migrationsDir);
  await ensureReferenceData(prisma); // idempotent — runs on every startup (incl. upgrades)
  await ensureSeed(prisma, opts.stampImagePath);

  const { createApp } = require("./app");
  const { startReminderScheduler } = require("./services/reminders");
  const app = createApp();
  startReminderScheduler();
  await new Promise<void>((resolve) => app.listen(opts.port, "127.0.0.1", resolve));
  return { port: opts.port };
}

/**
 * Minimal forward-only migration runner for the embedded SQLite DB. Applies any
 * prisma migration folders not yet recorded in _app_migrations, in order.
 * Handles three cases: fresh DB (apply all), legacy DB created by the old
 * bootstrap (baseline the init migration, then apply the rest), and up-to-date.
 */
async function runMigrations(prisma: any, migrationsDir: string) {
  const tableExists = async (name: string) =>
    ((await prisma.$queryRawUnsafe(`SELECT name FROM sqlite_master WHERE type='table' AND name='${name}'`)) as any[]).length > 0;

  await prisma.$executeRawUnsafe(`CREATE TABLE IF NOT EXISTS "_app_migrations" ("name" TEXT PRIMARY KEY, "appliedAt" TEXT NOT NULL)`);

  const dirs = fs
    .readdirSync(migrationsDir, { withFileTypes: true })
    .filter((d) => d.isDirectory() && fs.existsSync(path.join(migrationsDir, d.name, "migration.sql")))
    .map((d) => d.name)
    .sort();

  const appliedRows = (await prisma.$queryRawUnsafe(`SELECT name FROM "_app_migrations"`)) as { name: string }[];
  const applied = new Set(appliedRows.map((r) => r.name));

  // Legacy DB: tables exist but nothing recorded -> the old bootstrap applied
  // only the init migration. Baseline it so we don't try to re-CREATE tables.
  if (applied.size === 0 && (await tableExists("User")) && dirs.length > 0) {
    await prisma.$executeRawUnsafe(`INSERT OR IGNORE INTO "_app_migrations" ("name","appliedAt") VALUES (?, ?)`, dirs[0], new Date().toISOString());
    applied.add(dirs[0]);
  }

  for (const dir of dirs) {
    if (applied.has(dir)) continue;
    const sql = fs.readFileSync(path.join(migrationsDir, dir, "migration.sql"), "utf8");
    const statements = sql
      .split(/;\s*$/m)
      .map((s) => s.replace(/^\s*--.*$/gm, "").trim())
      .filter((s) => s.length > 0);
    for (const stmt of statements) {
      await prisma.$executeRawUnsafe(stmt);
    }
    await prisma.$executeRawUnsafe(`INSERT INTO "_app_migrations" ("name","appliedAt") VALUES (?, ?)`, dir, new Date().toISOString());
  }
}

/** Idempotent reference data that should exist in every install, including upgrades. */
async function ensureReferenceData(prisma: any) {
  for (const name of ["Approved", "Reviewed", "Verified", "Witnessed"]) {
    await prisma.approvalType.upsert({ where: { name }, update: {}, create: { name } }).catch(() => {});
  }
}

/** Seed roles + demo users + a profile (+ default stamp) if none exist. */
async function ensureSeed(prisma: any, stampImagePath?: string) {
  const count = await prisma.role.count();
  if (count > 0) return;

  const bcrypt = require("bcryptjs");
  const { PERMISSIONS } = require("./constants");
  const hash = (p: string) => bcrypt.hashSync(p, 10);

  const admin = await prisma.role.create({
    data: { name: "Administrator", description: "Full system access", permissions: JSON.stringify(PERMISSIONS), isSystem: true },
  });
  const approver = await prisma.role.create({
    data: { name: "Approver", description: "Reviews, approves, signs and stamps", permissions: JSON.stringify(["APPROVE", "REJECT", "SIGN", "USE_STAMP", "DOWNLOAD"]) },
  });
  const requester = await prisma.role.create({
    data: { name: "Requester", description: "Uploads and submits documents", permissions: JSON.stringify(["UPLOAD", "DOWNLOAD"]) },
  });

  const mk = (fullName: string, email: string, username: string, roleId: string, pw: string) =>
    prisma.user.create({ data: { fullName, email, username, roleId, passwordHash: hash(pw) } });

  const adminU = await mk("System Administrator", "admin@mico360.com", "admin", admin.id, "Admin@123");
  const appU = await mk("Ayesha Approver", "approver@mico360.com", "approver", approver.id, "User@123");
  const mgrU = await mk("Maria Manager", "manager@mico360.com", "manager", approver.id, "User@123");
  const reqU = await mk("Rafay Requester", "requester@mico360.com", "requester", requester.id, "User@123");

  const profile = await prisma.profile.create({ data: { name: "Operations", description: "Oil & gas operations document approvals" } });
  for (const u of [adminU, appU, mgrU, reqU]) {
    await prisma.profileMember.create({ data: { profileId: profile.id, userId: u.id } });
  }
  await prisma.signatureGroup.create({
    data: {
      name: "Operations Approvals",
      description: "Sequential sign-off: Approver then Manager",
      profileId: profile.id,
      approvalMode: "SEQUENTIAL",
      members: { create: [{ userId: appU.id, order: 1 }, { userId: mgrU.id, order: 2 }] },
    },
  });

  // Seed a default company stamp from the bundled image so approvers can stamp
  // out of the box (standalone desktop has no admin-uploaded stamps yet).
  if (stampImagePath && fs.existsSync(stampImagePath)) {
    try {
      const { dirs } = require("./lib/storage");
      fs.mkdirSync(dirs.stamps, { recursive: true });
      const dest = path.join(dirs.stamps, "company-stamp.png");
      fs.copyFileSync(stampImagePath, dest);
      await prisma.stamp.create({ data: { name: "MICO360 Company Stamp", imagePath: path.join("stamps", "company-stamp.png"), profileId: profile.id } });
    } catch {
      /* non-fatal */
    }
  }
}
