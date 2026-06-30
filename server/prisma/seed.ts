import fs from "fs";
import path from "path";
import bcrypt from "bcryptjs";
import { PrismaClient } from "@prisma/client";
import { ApprovalMode, Permission, PERMISSIONS } from "../src/constants";

const prisma = new PrismaClient();
const hash = (p: string) => bcrypt.hashSync(p, 10);

const ALL: Permission[] = [...PERMISSIONS];
const APPROVER_PERMS: Permission[] = ["APPROVE", "REJECT", "SIGN", "USE_STAMP", "DOWNLOAD"];
const REQUESTER_PERMS: Permission[] = ["UPLOAD", "DOWNLOAD"];

async function main() {
  console.log("Seeding eSign MICO360…");

  // ── Roles ──────────────────────────────────────────────
  const admin = await prisma.role.upsert({
    where: { name: "Administrator" },
    update: { permissions: JSON.stringify(ALL), isSystem: true },
    create: { name: "Administrator", description: "Full system access", permissions: JSON.stringify(ALL), isSystem: true },
  });
  const approver = await prisma.role.upsert({
    where: { name: "Approver" },
    update: { permissions: JSON.stringify(APPROVER_PERMS) },
    create: { name: "Approver", description: "Reviews, approves, signs and stamps", permissions: JSON.stringify(APPROVER_PERMS) },
  });
  const requester = await prisma.role.upsert({
    where: { name: "Requester" },
    update: { permissions: JSON.stringify(REQUESTER_PERMS) },
    create: { name: "Requester", description: "Uploads and submits documents", permissions: JSON.stringify(REQUESTER_PERMS) },
  });

  // ── Users ──────────────────────────────────────────────
  const adminUser = await prisma.user.upsert({
    where: { email: "admin@mico360.com" },
    update: {},
    create: { fullName: "System Administrator", email: "admin@mico360.com", username: "admin", passwordHash: hash("Admin@123"), roleId: admin.id },
  });
  const approverUser = await prisma.user.upsert({
    where: { email: "approver@mico360.com" },
    update: {},
    create: { fullName: "Ayesha Approver", email: "approver@mico360.com", username: "approver", passwordHash: hash("User@123"), roleId: approver.id },
  });
  const requesterUser = await prisma.user.upsert({
    where: { email: "requester@mico360.com" },
    update: {},
    create: { fullName: "Rafay Requester", email: "requester@mico360.com", username: "requester", passwordHash: hash("User@123"), roleId: requester.id },
  });
  const approver2 = await prisma.user.upsert({
    where: { email: "manager@mico360.com" },
    update: {},
    create: { fullName: "Maria Manager", email: "manager@mico360.com", username: "manager", passwordHash: hash("User@123"), roleId: approver.id },
  });

  // ── Profile ────────────────────────────────────────────
  const profile = await prisma.profile.upsert({
    where: { name: "Operations" },
    update: {},
    create: { name: "Operations", description: "Oil & gas operations document approvals" },
  });

  // everyone belongs to Operations so the workflow can be demoed end-to-end
  for (const u of [adminUser, approverUser, requesterUser, approver2]) {
    await prisma.profileMember.upsert({
      where: { profileId_userId: { profileId: profile.id, userId: u.id } },
      update: {},
      create: { profileId: profile.id, userId: u.id },
    });
  }

  // ── Signature group ────────────────────────────────────
  const existingGroup = await prisma.signatureGroup.findFirst({ where: { profileId: profile.id, name: "Operations Approvals" } });
  if (!existingGroup) {
    await prisma.signatureGroup.create({
      data: {
        name: "Operations Approvals",
        description: "Sequential sign-off: Approver then Manager",
        profileId: profile.id,
        approvalMode: ApprovalMode.SEQUENTIAL,
        members: { create: [{ userId: approverUser.id, order: 1 }, { userId: approver2.id, order: 2 }] },
      },
    });
  }

  // ── Company stamp (demo: use the brand logo as a company stamp) ──
  const stampSrc = path.resolve(process.cwd(), "..", "shared", "assets", "logo.png");
  const stampDir = path.resolve(process.cwd(), process.env.STORAGE_DIR ?? "storage", "stamps");
  if (fs.existsSync(stampSrc)) {
    fs.mkdirSync(stampDir, { recursive: true });
    const dest = path.join(stampDir, "company-stamp.png");
    fs.copyFileSync(stampSrc, dest);
    const rel = path.join("stamps", "company-stamp.png");
    const exists = await prisma.stamp.findFirst({ where: { name: "MICO360 Company Stamp" } });
    if (!exists) {
      await prisma.stamp.create({ data: { name: "MICO360 Company Stamp", imagePath: rel, profileId: profile.id } });
    }
  }

  // Default approval types
  for (const name of ["Approved", "Reviewed", "Verified", "Witnessed"]) {
    await prisma.approvalType.upsert({ where: { name }, update: {}, create: { name } });
  }

  console.log("\nSeed complete. Demo accounts:");
  console.log("  admin@mico360.com     / Admin@123  (Administrator)");
  console.log("  approver@mico360.com  / User@123   (Approver)");
  console.log("  manager@mico360.com   / User@123   (Approver)");
  console.log("  requester@mico360.com / User@123   (Requester)\n");
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
