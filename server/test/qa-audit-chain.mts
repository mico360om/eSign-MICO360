// Regression test for the tamper-evident audit hash chain under concurrency.
// Historically, concurrent requests could read the same prevHash and FORK the
// chain (see src/lib/audit.ts). This fires many audit() writes concurrently and
// asserts the chain stays intact. Talks straight to the DB (no HTTP server).
//   npm run -w server qa:audit   (or: npx tsx test/qa-audit-chain.mts)
import { prisma } from "../src/lib/prisma";
import { audit, canonicalAudit } from "../src/lib/audit";
import { sha256 } from "../src/lib/integrity";

let pass = 0, fail = 0;
const ok = (c: boolean, m: string) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗ FAIL:", m); } };

// Same walk as GET /api/audit/verify.
function verify(all: { hash: string | null; prevHash: string | null }[]) {
  const chained = all.filter((e) => e.hash);
  let prevHash = "";
  for (let i = 0; i < chained.length; i++) {
    const e = chained[i];
    const expected = sha256(prevHash + canonicalAudit(e as any));
    if (e.prevHash !== prevHash || e.hash !== expected) return { intact: false, brokenAt: i, chained: chained.length };
    prevHash = e.hash ?? "";
  }
  return { intact: true as const, brokenAt: null, chained: chained.length };
}
const load = () => prisma.auditLog.findMany({ orderBy: [{ createdAt: "asc" }, { id: "asc" }] });

async function main() {
  console.log("\n== audit hash-chain concurrency test ==\n");
  const marker = `QA_AUDIT_RACE_${Date.now()}`;

  const before = verify(await load());
  ok(before.intact, `chain intact before test (${before.chained} chained entries)`);

  // The exact pattern that used to fork: many audit writes fired at once.
  const N = 50;
  await Promise.all(Array.from({ length: N }, (_, i) => audit({ action: marker, detail: `race ${i}` })));

  const all = await load();
  const mine = all.filter((e) => e.action === marker);
  ok(mine.length === N, `all ${N} concurrent entries persisted (got ${mine.length})`);

  const after = verify(all);
  ok(after.intact, `chain still intact after ${N} concurrent writes${after.intact ? "" : ` (broken @ ${after.brokenAt})`}`);

  // No two of our entries share a prevHash (a fork would).
  const prevs = mine.map((e) => e.prevHash);
  ok(new Set(prevs).size === mine.length, "no forked prevHash among the concurrent entries");

  // Cleanup: our entries are the newest, so deleting them is a safe tail-trim
  // that leaves the pre-existing chain exactly as it was.
  await prisma.auditLog.deleteMany({ where: { action: marker } });
  ok(verify(await load()).intact, "chain intact after removing test tail entries");

  console.log(`\n${fail === 0 ? "✅ ALL PASS" : "❌ FAILURES"} — ${pass} passed, ${fail} failed\n`);
  await prisma.$disconnect();
  process.exit(fail === 0 ? 0 : 1);
}
main().catch((e) => { console.error(e); process.exit(1); });
