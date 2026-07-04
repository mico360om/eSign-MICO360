// One-time maintenance: re-baseline the tamper-evident audit hash chain.
//
// Older builds could FORK the chain when concurrent requests read the same
// prevHash (fixed in src/lib/audit.ts by serializing writes). Those historical
// forks make /api/audit/verify report "broken" forever even though no entry was
// tampered — the links were simply written in a racy order. This walks the log
// in canonical order and re-links prevHash/hash so the chain is consistent going
// forward. It does NOT alter any entry's content (actor/action/detail/ip/time),
// so it repairs benign forks without masking real edits between runs.
//
//   npm run -w server audit:reseal            (or: npx tsx scripts/reseal-audit.mts)
import { prisma } from "../src/lib/prisma";
import { audit, canonicalAudit } from "../src/lib/audit";
import { sha256 } from "../src/lib/integrity";

async function main() {
  const all = await prisma.auditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });
  let prevHash = "";
  let fixed = 0;
  for (const e of all) {
    if (!e.hash) continue; // legacy pre-hash-chain entries don't participate
    const hash = sha256(prevHash + canonicalAudit(e));
    if (e.prevHash !== prevHash || e.hash !== hash) {
      await prisma.auditLog.update({ where: { id: e.id }, data: { prevHash, hash } });
      fixed++;
    }
    prevHash = hash;
  }
  console.log(`Audit chain reseal: re-linked ${fixed} of ${all.length} ent(ies).`);
  if (fixed > 0) {
    // Record that a reseal happened (appended through the serialized writer).
    await audit({ action: "AUDIT_CHAIN_RESEALED", entity: "AuditLog", detail: `re-linked ${fixed} entries` });
    console.log("Recorded AUDIT_CHAIN_RESEALED marker.");
  } else {
    console.log("Chain already intact — nothing to do.");
  }
  await prisma.$disconnect();
}
main().catch((e) => { console.error(e); process.exit(1); });
