// eSign MICO360 — security & integrity QA (digital signatures, hashing,
// hash-chained audit, lockout, password policy). Run with the server up:
//   node server/test/qa-security.mjs
import fs from "fs";
import path from "path";

const API = process.env.QA_API || "http://localhost:4400/api";
const SERVER_DIR = path.resolve("."); // npm workspace cwd = server/; storage lives at ./storage
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; } else { fail++; fails.push(m); console.log("  ✗", m); } };
const section = (s) => console.log("\n• " + s);

async function req(method, p, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(API + p, { method, headers, body });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, body: data?.data };
}
const login = async (email, password) => (await req("POST", "/auth/login", { json: { email, password } }))?.body?.token;
const stamp = Date.now();
const em = (n) => `qasec_${n}_${stamp}@mico360.com`;

console.log("\n===== eSign MICO360 — Security & Integrity QA =====");

const adminTok = await login("admin@mico360.com", "Admin@123");
ok(!!adminTok, "admin login");
const roles = (await req("GET", "/roles", { token: adminTok })).body;
const roleId = (n) => roles.find((r) => r.name === n)?.id;
const profile = (await req("POST", "/profiles", { token: adminTok, json: { name: `QASec ${stamp}` } })).body;
const mk = async (n, role) => (await req("POST", "/users", { token: adminTok, json: { fullName: `QASec ${n}`, email: em(n), password: "User@123", roleId: roleId(role), profileIds: [profile.id] } })).body;
const requester = await mk("req", "Requester");
const app1 = await mk("app1", "Approver");
const reqTok = await login(em("req"), "User@123");
const app1Tok = await login(em("app1"), "User@123");

// ─── Password policy ─────────────────────────────────────────────
section("Password policy enforcement");
ok((await req("POST", "/users", { token: adminTok, json: { fullName: "Weak", email: em("weak1"), password: "ab1" } })).status === 400, "reject too-short password");
ok((await req("POST", "/users", { token: adminTok, json: { fullName: "Weak", email: em("weak2"), password: "abcdefgh" } })).status === 400, "reject password with no number");
ok((await req("POST", "/users", { token: adminTok, json: { fullName: "Weak", email: em("weak3"), password: "Ab1" } })).status === 400, "reject too-short password (policy minLength)");
// Policy default = min 8 chars + upper + lower + number. "Abc12345" satisfies all.
ok((await req("POST", "/users", { token: adminTok, json: { fullName: "OK", email: em("ok"), password: "Abc12345", roleId: roleId("Requester"), profileIds: [profile.id] } })).status === 200, "accept policy-compliant password");

// ─── Integrity hashing (IMAGE method) ────────────────────────────
section("Document integrity hashing");
const upload = async (title) => {
  const fd = new FormData();
  fd.set("title", title); fd.set("profileId", profile.id);
  fd.set("file", new Blob([`Integrity test ${title} — ${stamp}`], { type: "text/plain" }), "doc.txt");
  return (await req("POST", "/documents/upload", { token: reqTok, form: fd })).body;
};
const docImg = await upload("Image-Signed");
let v = (await req("GET", `/documents/${docImg.id}/verify`, { token: reqTok })).body;
ok(v.original?.intact === true && !!v.original.stored, "original SHA-256 stored & verified on upload");

await req("POST", `/documents/${docImg.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id], signatureMethod: "IMAGE" } });
await req("POST", `/documents/${docImg.id}/decision`, { token: app1Tok, json: { decision: "APPROVE" } });
v = (await req("GET", `/documents/${docImg.id}/verify`, { token: reqTok })).body;
ok(v.final?.intact === true, "final PDF hash stored & verified (IMAGE)");
ok(v.final?.digitallySigned === false, "IMAGE method => not digitally signed");

section("Tamper detection");
const doc1 = await req("GET", `/documents/${docImg.id}`, { token: reqTok });
const finalRel = doc1.body.finalPdfPath;
const finalAbs = path.join(SERVER_DIR, "storage", finalRel);
let tampered = false;
try { fs.appendFileSync(finalAbs, Buffer.from("\n%% tampered %%\n")); tampered = true; } catch {}
ok(tampered, "could access final PDF on disk to simulate tampering");
v = (await req("GET", `/documents/${docImg.id}/verify`, { token: reqTok })).body;
ok(v.final?.intact === false, "tampering with final PDF is DETECTED (hash mismatch)");

// ─── Digital signature (DIGITAL method) ──────────────────────────
section("Cryptographic digital signature");
const docDig = await upload("Digitally-Signed");
await req("POST", `/documents/${docDig.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id], signatureMethod: "DIGITAL" } });
await req("POST", `/documents/${docDig.id}/decision`, { token: app1Tok, json: { decision: "APPROVE" } });
v = (await req("GET", `/documents/${docDig.id}/verify`, { token: reqTok })).body;
ok(v.final?.digitallySigned === true, "DIGITAL method => document marked digitally signed");
ok(v.final?.hasEmbeddedSignature === true, "final PDF contains an embedded PKCS#7 signature (/ByteRange)");
ok(v.final?.intact === true, "digitally-signed final PDF hash verified");
const dl = await fetch(`${API}/documents/${docDig.id}/download/final`, { headers: { Authorization: `Bearer ${reqTok}` } });
const buf = Buffer.from(await dl.arrayBuffer());
ok(buf.slice(0, 4).toString() === "%PDF" && buf.includes(Buffer.from("/ByteRange")), "downloaded signed PDF is valid & carries the signature");

// ─── Hash-chained audit ──────────────────────────────────────────
section("Hash-chained audit log");
const chain = (await req("GET", "/audit/verify", { token: adminTok })).body;
ok(chain.intact === true && chain.brokenAtIndex === null, `audit hash chain intact (${chain.total} entries)`);

// ─── Brute-force lockout ─────────────────────────────────────────
section("Login lockout after repeated failures");
const lockEmail = em("app1");
for (let i = 0; i < 5; i++) await req("POST", "/auth/login", { json: { email: lockEmail, password: "WRONG" } });
const afterLock = await req("POST", "/auth/login", { json: { email: lockEmail, password: "User@123" } }); // correct pw, but locked
ok(afterLock.status === 401 && /lock/i.test(afterLock.data?.error || ""), "account locked after 5 failed attempts (even correct password rejected)");
await req("POST", `/users/${app1.id}/reset-password`, { token: adminTok, json: { newPassword: "User@123" } }); // clears lock
ok(!!(await login(lockEmail, "User@123")), "admin password reset clears the lock");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) { console.log("\nFailures:"); fails.forEach((f) => console.log("  - " + f)); }
process.exit(fail ? 1 : 0);
