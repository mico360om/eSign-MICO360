// eSign MICO360 — QA for approval types: requester picks a kind of approval per
// signatory; approvers tag preconfigured signatures to types.
//   node server/test/qa-approval-types.mjs
const API = process.env.QA_API || "http://localhost:4400/api";
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log("  ✗", m); } };
const section = (s) => console.log("\n• " + s);

async function req(method, p, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(API + p, { method, headers, body });
  const text = await res.text(); let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, body: data?.data };
}
const login = async (e, p) => (await req("POST", "/auth/login", { json: { email: e, password: p } }))?.body?.token;
const stamp = Date.now();
const em = (n) => `qat_${n}_${stamp}@mico360.com`;
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

console.log("\n===== eSign MICO360 — Approval Types QA =====");
const admin = await login("admin@mico360.com", "Admin@123");
const reqUserTok0 = null;

// ── Approval types catalog ────────────────────────────────────────
section("Approval-type catalog");
let typesRes = await req("GET", "/approval-types", { token: admin });
ok(typesRes.status === 200 && typesRes.body.length >= 4, `default approval types seeded (${typesRes.body.length})`);
const reviewed = typesRes.body.find((t) => t.name === "Reviewed");
ok(!!reviewed, "‘Reviewed’ type present");
const created = await req("POST", "/approval-types", { token: admin, json: { name: `Custom ${stamp}`, description: "x" } });
ok(created.status === 200 && created.body?.id, "admin creates a new approval type");

// ── Set up users ──────────────────────────────────────────────────
const roles = (await req("GET", "/roles", { token: admin })).body;
const roleId = (n) => roles.find((r) => r.name === n)?.id;
const profile = (await req("POST", "/profiles", { token: admin, json: { name: `QAT ${stamp}` } })).body;
const mk = async (n, role) => (await req("POST", "/users", { token: admin, json: { fullName: `QAT ${n}`, email: em(n), password: "User@123", roleId: roleId(role), profileIds: [profile.id] } })).body;
const requester = await mk("req", "Requester");
const app1 = await mk("app1", "Approver");
const reqTok = await login(em("req"), "User@123");
const appTok = await login(em("app1"), "User@123");

// requester cannot manage approval types
ok((await req("POST", "/approval-types", { token: reqTok, json: { name: "Nope" } })).status === 403, "non-admin cannot create approval types");
// but can read them (to pick at request time)
ok((await req("GET", "/approval-types", { token: reqTok })).status === 200, "requester can read approval types");

// ── Approver tags a saved signature to a type ─────────────────────
section("Approver tags a signature to an approval type");
const fd = new FormData();
fd.set("image", new Blob([PNG], { type: "image/png" }), "sig.png");
fd.set("label", "Reviewed sig");
fd.set("approvalTypeId", reviewed.id);
const mark = (await req("POST", "/account/marks", { token: appTok, form: fd })).body;
ok(mark?.approvalTypeId === reviewed.id, "saved mark tagged with the ‘Reviewed’ type");

// ── Requester selects a kind of approval per signatory ────────────
section("Requester picks the kind of approval per signatory");
const f = new FormData();
f.set("title", "Typed Approval Doc"); f.set("profileId", profile.id);
f.set("file", new Blob(["body"], { type: "text/plain" }), "d.txt");
const doc = (await req("POST", "/documents/upload", { token: reqTok, form: f })).body;
const sub = await req("POST", `/documents/${doc.id}/submit`, {
  token: reqTok,
  json: { signatoryIds: [app1.id], approvalMode: "PARALLEL", signatoryTypes: { [app1.id]: reviewed.id } },
});
ok(sub.body?.status === "PENDING_APPROVAL", "submit with per-signatory approval type");
const full = (await req("GET", `/documents/${doc.id}`, { token: appTok })).body;
const step = full.steps.find((s) => s.signatory.id === app1.id);
ok(step?.approvalType?.name === "Reviewed", "the signatory's step carries the requested type (Reviewed)");

// ── Approver applies their matching mark + approves ───────────────
section("Approver applies the matching signature");
const place = await req("POST", `/documents/${doc.id}/placements`, { token: appTok, json: { kind: "SIGNATURE", savedMarkId: mark.id, page: 1, x: mark.posX, y: mark.posY, width: mark.width, height: mark.height } });
ok(place.status === 200, "approver places the type-matched signature");
ok((await req("POST", `/documents/${doc.id}/decision`, { token: appTok, json: { decision: "APPROVE" } })).body?.status === "COMPLETED", "approve -> COMPLETED");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) { console.log("\nFailures:"); fails.forEach((f) => console.log("  - " + f)); }
process.exit(fail ? 1 : 0);
