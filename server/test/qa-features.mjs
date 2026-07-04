// eSign MICO360 — feature QA: email/push fan-out, scheduled reminders,
// delegation/out-of-office, bulk actions, templates, document versioning.
//   node server/test/qa-features.mjs
const API = process.env.QA_API || "http://localhost:4400/api";
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log("  ✗", m); } };
const section = (s) => console.log("\n• " + s);
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

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
const em = (n) => `qaf_${n}_${stamp}@mico360.com`;

console.log("\n===== eSign MICO360 — Feature QA =====");
const admin = await login("admin@mico360.com", "Admin@123");
const roles = (await req("GET", "/roles", { token: admin })).body;
const roleId = (n) => roles.find((r) => r.name === n)?.id;
const profile = (await req("POST", "/profiles", { token: admin, json: { name: `QAF ${stamp}` } })).body;
const mk = async (n, role) => (await req("POST", "/users", { token: admin, json: { fullName: `QAF ${n}`, email: em(n), password: "User@123", roleId: roleId(role), profileIds: [profile.id] } })).body;
const requester = await mk("req", "Requester");
const app1 = await mk("app1", "Approver");
const app2 = await mk("app2", "Approver");
const reqTok = await login(em("req"), "User@123");
const app1Tok = await login(em("app1"), "User@123");
const app2Tok = await login(em("app2"), "User@123");

const upload = async (title) => {
  const fd = new FormData();
  fd.set("title", title); fd.set("profileId", profile.id);
  fd.set("file", new Blob([`feature test ${title} ${stamp}`], { type: "text/plain" }), "d.txt");
  return (await req("POST", "/documents/upload", { token: reqTok, form: fd })).body;
};

// ─── Email + push fan-out ────────────────────────────────────────
section("Email + mobile push notifications");
await req("PUT", "/settings", { token: admin, json: { "notifications.email": "true" } });
ok((await req("POST", "/notifications/register-device", { token: app1Tok, json: { token: "fake-device-token-123" } })).body.registered === true, "register mobile push device token");
const emDoc = await upload("Email Test");
await req("POST", `/documents/${emDoc.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id] } }); // notifies app1
await sleep(300);
const outbox = (await req("GET", "/admin/outbox", { token: admin })).body;
ok(Array.isArray(outbox.emails) && outbox.emails.length > 0, `notification email captured (${outbox.emails.length})`);
ok(outbox.push.some((p) => p.userId === app1.id), "mobile push captured for device-registered user");
const te = await req("POST", "/admin/test-email", { token: admin, json: { to: "someone@example.com" } });
ok(te.body?.sent === true, "admin test-email endpoint works");
await req("PUT", "/settings", { token: admin, json: { "notifications.email": "false" } });

// ─── Scheduled reminders ─────────────────────────────────────────
section("Scheduled approval reminders");
await req("PUT", "/settings", { token: admin, json: { "reminders.enabled": "true", "reminders.frequencyDays": "1" } });
const remDoc = await upload("Reminder Test");
await req("POST", `/documents/${remDoc.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id] } });
await sleep(1100);
const sweep = await req("POST", "/admin/run-reminders", { token: admin });
ok((sweep.body?.sent ?? 0) >= 1, `reminder sweep sent reminders (${sweep.body?.sent})`);
const app1Notifs = (await req("GET", "/notifications", { token: app1Tok })).body;
ok(app1Notifs.notifications.some((n) => n.type === "APPROVAL_REMINDER"), "signatory received APPROVAL_REMINDER");

// ─── Delegation / out-of-office ──────────────────────────────────
section("Delegation / out-of-office");
ok((await req("PUT", "/account/availability", { token: app2Tok, json: { outOfOffice: true, delegateToId: app1.id } })).body.outOfOffice === true, "approver2 set out-of-office with approver1 as delegate");
const delDoc = await upload("Delegated Doc");
await req("POST", `/documents/${delDoc.id}/submit`, { token: reqTok, json: { signatoryIds: [app2.id] } }); // app2 is OOO
// delegate (app1) acts on app2's step
const delDecision = await req("POST", `/documents/${delDoc.id}/decision`, { token: app1Tok, json: { decision: "APPROVE", comment: "covering for app2" } });
ok(delDecision.body?.status === "COMPLETED", "delegate approved on behalf of out-of-office signatory");
// also the delegate was notified at submit
ok((await req("GET", "/notifications", { token: app1Tok })).body.notifications.some((n) => /Delegated/.test(n.title)), "delegate notified of the request");
await req("PUT", "/account/availability", { token: app2Tok, json: { outOfOffice: false, delegateToId: null } });

// ─── Bulk actions ────────────────────────────────────────────────
section("Bulk approve/reject");
const b1 = await upload("Bulk 1"); const b2 = await upload("Bulk 2");
await req("POST", `/documents/${b1.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id] } });
await req("POST", `/documents/${b2.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id] } });
const bulk = await req("POST", "/documents/bulk-decision", { token: app1Tok, json: { ids: [b1.id, b2.id], decision: "APPROVE" } });
ok(bulk.body?.succeeded === 2 && bulk.body?.failed === 0, `bulk approved 2 documents (${bulk.body?.succeeded}/${2})`);

// ─── Templates ───────────────────────────────────────────────────
section("Document templates");
const tpl = (await req("POST", "/templates", { token: reqTok, json: { name: `Tpl ${stamp}`, profileId: profile.id, signatoryIds: [app1.id], signatureMethod: "DIGITAL", approvalMode: "SEQUENTIAL" } })).body;
ok(!!tpl?.id, "create template");
ok((await req("GET", `/templates?profileId=${profile.id}`, { token: reqTok })).body.some((t) => t.id === tpl.id), "template visible in its profile");
const tplDoc = await upload("From Template");
const tplSub = await req("POST", `/documents/${tplDoc.id}/submit`, { token: reqTok, json: { templateId: tpl.id } }); // no signatories — from template
ok(tplSub.body?.status === "PENDING_APPROVAL", "submit using template applies its signatories");
const tplFull = (await req("GET", `/documents/${tplDoc.id}`, { token: reqTok })).body;
ok(tplFull.signatureMethod === "DIGITAL" && tplFull.steps.some((s) => s.signatory.id === app1.id), "template set DIGITAL method + correct signatory");

// ─── Versioning ──────────────────────────────────────────────────
section("Document versioning");
const vDoc = await upload("Versioned");
await req("POST", `/documents/${vDoc.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id] } });
await req("POST", `/documents/${vDoc.id}/decision`, { token: app1Tok, json: { decision: "REJECT", comment: "needs changes" } });
const fd2 = new FormData();
fd2.set("file", new Blob(["revised content v2"], { type: "text/plain" }), "v2.txt");
const revised = (await req("POST", `/documents/${vDoc.id}/revise`, { token: reqTok, form: fd2 })).body;
ok(revised?.version === 2 && revised?.parentId === vDoc.id, "revise creates v2 linked to parent");
const chain = (await req("GET", `/documents/${revised.id}/versions`, { token: reqTok })).body;
ok(chain.length === 2 && chain[0].version === 1 && chain[1].version === 2, `version chain lists both versions (${chain.length})`);

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) { console.log("\nFailures:"); fails.forEach((f) => console.log("  - " + f)); }
process.exit(fail ? 1 : 0);
