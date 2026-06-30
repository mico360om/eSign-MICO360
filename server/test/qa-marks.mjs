// eSign MICO360 — QA for saved-marks library + edit/re-approve (reopen).
//   node server/test/qa-marks.mjs
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
const em = (n) => `qam_${n}_${stamp}@mico360.com`;
// 1x1 PNG
const PNG = Uint8Array.from(atob("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg=="), (c) => c.charCodeAt(0));

console.log("\n===== eSign MICO360 — Saved Marks + Re-approve QA =====");
const admin = await login("admin@mico360.com", "Admin@123");
const roles = (await req("GET", "/roles", { token: admin })).body;
const roleId = (n) => roles.find((r) => r.name === n)?.id;
const profile = (await req("POST", "/profiles", { token: admin, json: { name: `QAM ${stamp}` } })).body;
const mk = async (n, role) => (await req("POST", "/users", { token: admin, json: { fullName: `QAM ${n}`, email: em(n), password: "User@123", roleId: roleId(role), profileIds: [profile.id] } })).body;
const requester = await mk("req", "Requester");
const app1 = await mk("app1", "Approver");
const reqTok = await login(em("req"), "User@123");
const appTok = await login(em("app1"), "User@123");

// ── Saved marks (preconfigured images + settings) ─────────────────
section("Saved-marks library");
const fd = new FormData();
fd.set("image", new Blob([PNG], { type: "image/png" }), "sig.png");
fd.set("label", "My Signature");
fd.set("kind", "SIGNATURE");
fd.set("posX", "0.55"); fd.set("posY", "0.78"); fd.set("width", "0.22"); fd.set("height", "0.08");
const mark = (await req("POST", "/account/marks", { token: appTok, form: fd })).body;
ok(!!mark?.id && mark.label === "My Signature", "approver saves a signature mark with settings");
ok(mark.posX === 0.55 && mark.width === 0.22, "preconfigured position/size stored");
const list = (await req("GET", "/account/marks", { token: appTok })).body;
ok(Array.isArray(list) && list.some((m) => m.id === mark.id), "saved marks listed");
const img = await fetch(`${API}/account/marks/${mark.id}/image`, { headers: { Authorization: `Bearer ${appTok}` } });
ok(img.status === 200, "saved mark image served");
const otherImg = await fetch(`${API}/account/marks/${mark.id}/image`, { headers: { Authorization: `Bearer ${reqTok}` } });
ok(otherImg.status === 404, "another user cannot fetch someone's mark image");

// ── Apply using the saved mark, then approve ──────────────────────
section("Apply saved mark + approve");
const upload = async (title) => {
  const f = new FormData();
  f.set("title", title); f.set("profileId", profile.id);
  f.set("file", new Blob([`doc ${title}`], { type: "text/plain" }), "d.txt");
  return (await req("POST", "/documents/upload", { token: reqTok, form: f })).body;
};
const doc = await upload("Marks Doc");
await req("POST", `/documents/${doc.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id], approvalMode: "PARALLEL" } });
const place = await req("POST", `/documents/${doc.id}/placements`, { token: appTok, json: { kind: "SIGNATURE", savedMarkId: mark.id, page: 1, x: mark.posX, y: mark.posY, width: mark.width, height: mark.height } });
ok(place.status === 200, "place signature using a saved mark (savedMarkId)");
const dec = await req("POST", `/documents/${doc.id}/decision`, { token: appTok, json: { decision: "APPROVE" } });
ok(dec.body?.status === "COMPLETED", "approve -> COMPLETED with signature applied");
let full = (await req("GET", `/documents/${doc.id}`, { token: appTok })).body;
ok(full.placements.length === 1 && !!full.finalPdfPath, "final PDF generated with the placement");

// ── Edit & re-approve (reopen) ────────────────────────────────────
section("Edit & re-approve (reopen)");
const reopen = await req("POST", `/documents/${doc.id}/reopen`, { token: appTok });
ok(["PENDING_APPROVAL", "PARTIALLY_APPROVED"].includes(reopen.body?.status), "reopen sets status back to pending");
full = (await req("GET", `/documents/${doc.id}`, { token: appTok })).body;
ok(!full.finalPdfPath, "final PDF cleared on reopen (will regenerate)");
ok(full.steps.find((s) => s.signatory.id === app1.id)?.status === "PENDING", "approver's step is PENDING again");
// edit: remove old placement, add a new one, re-approve
await req("DELETE", `/documents/${doc.id}/placements/${place.body.id}`, { token: appTok });
await req("POST", `/documents/${doc.id}/placements`, { token: appTok, json: { kind: "SIGNATURE", savedMarkId: mark.id, page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.08 } });
const redec = await req("POST", `/documents/${doc.id}/decision`, { token: appTok, json: { decision: "APPROVE" } });
ok(redec.body?.status === "COMPLETED", "re-approve -> COMPLETED (final PDF regenerated)");
full = (await req("GET", `/documents/${doc.id}`, { token: appTok })).body;
ok(full.placements.length === 1 && full.placements[0].x === 0.1 && !!full.finalPdfPath, "edited placement persisted + new final PDF");

// reopen guard: cannot reopen a doc you haven't approved
section("Reopen guards");
const doc2 = await upload("Guard Doc");
await req("POST", `/documents/${doc2.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id] } });
ok((await req("POST", `/documents/${doc2.id}/reopen`, { token: appTok })).status === 400, "cannot reopen a step not yet approved");
ok((await req("POST", `/documents/${doc2.id}/reopen`, { token: reqTok })).status === 403, "non-signatory cannot reopen");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) { console.log("\nFailures:"); fails.forEach((f) => console.log("  - " + f)); }
process.exit(fail ? 1 : 0);
