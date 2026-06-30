// eSign MICO360 — comprehensive QA/QC suite (run against a live server).
//   npm run -w server qa
// Creates isolated test data so it is safe to re-run. Covers auth, RBAC,
// access rules, validation, the full document workflow, every status,
// security, audit trail, reports, notifications, and integration.
const API = process.env.QA_API || "http://localhost:4400/api";
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) { pass++; } else { fail++; fails.push(m); console.log("  ✗", m); } };
const section = (s) => console.log("\n• " + s);

async function req(method, path, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(API + path, { method, headers, body });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, body: data?.data, headers: res.headers, raw: text };
}
const login = async (email, password) => (await req("POST", "/auth/login", { json: { email, password } }))?.body?.token;
const stamp = Date.now();
const uemail = (n) => `qa_${n}_${stamp}@mico360.com`;

console.log("\n===== eSign MICO360 — QA/QC suite =====");

// ─── Auth & security ─────────────────────────────────────────────
section("Auth & security");
const adminTok = await login("admin@mico360.com", "Admin@123");
ok(!!adminTok, "admin valid login returns token");
const bad = await req("POST", "/auth/login", { json: { email: "admin@mico360.com", password: "wrong" } });
ok(bad.status === 401, "invalid password -> 401");
const noTok = await req("GET", "/auth/me");
ok(noTok.status === 401, "no token on protected route -> 401");
const badTok = await req("GET", "/auth/me", { token: "garbage.token.value" });
ok(badTok.status === 401, "invalid/garbage token -> 401");

// ─── Setup isolated test data (admin) ────────────────────────────
section("Test data setup");
const roles = await req("GET", "/roles", { token: adminTok });
const roleId = (name) => roles.body.find((r) => r.name === name)?.id;
ok(!!roleId("Requester") && !!roleId("Approver") && !!roleId("Administrator"), "seeded roles present");

const profile = (await req("POST", "/profiles", { token: adminTok, json: { name: `QA Ops ${stamp}`, description: "QA" } })).body;
const otherProfile = (await req("POST", "/profiles", { token: adminTok, json: { name: `QA Other ${stamp}` } })).body;
ok(!!profile?.id, "create profile");

const mkUser = async (n, roleName, profileIds) =>
  (await req("POST", "/users", { token: adminTok, json: { fullName: `QA ${n}`, email: uemail(n), password: "User@123", roleId: roleId(roleName), profileIds } })).body;
const requester = await mkUser("requester", "Requester", [profile.id]);
const app1 = await mkUser("approver1", "Approver", [profile.id]);
const app2 = await mkUser("approver2", "Approver", [profile.id]);
const outsider = await mkUser("outsider", "Approver", [otherProfile.id]);
ok(requester && app1 && app2 && outsider, "create 4 users with role + profile assignment");

const reqTok = await login(uemail("requester"), "User@123");
const app1Tok = await login(uemail("approver1"), "User@123");
const app2Tok = await login(uemail("approver2"), "User@123");
ok(reqTok && app1Tok && app2Tok, "test users can log in");

// ─── RBAC matrix ─────────────────────────────────────────────────
section("RBAC / permission enforcement");
for (const [path, label] of [["/users", "users"], ["/profiles", "profiles"], ["/roles", "roles"], ["/signature-groups", "signature-groups"], ["/dashboard", "dashboard"], ["/audit", "audit"]]) {
  const r = await req("GET", path, { token: reqTok });
  ok(r.status === 403, `requester blocked from ${label} (403)`);
}
ok((await req("GET", "/users", { token: adminTok })).status === 200, "admin allowed on /users");
ok((await req("PUT", "/settings", { token: reqTok, json: { "x.y": "1" } })).status === 403, "requester blocked from writing settings");

// ─── User management ─────────────────────────────────────────────
section("User management");
ok((await req("PATCH", `/users/${app1.id}`, { token: adminTok, json: { fullName: "QA Approver One" } })).body.fullName === "QA Approver One", "edit user");
ok((await req("POST", `/users/${app1.id}/activate`, { token: adminTok, json: { isActive: false } })).body.isActive === false, "deactivate user");
const inactiveLogin = await req("POST", "/auth/login", { json: { email: uemail("approver1"), password: "User@123" } });
ok(inactiveLogin.status === 401, "deactivated user cannot log in");
ok((await req("POST", `/users/${app1.id}/activate`, { token: adminTok, json: { isActive: true } })).body.isActive === true, "reactivate user");
ok((await req("POST", `/users/${app1.id}/reset-password`, { token: adminTok, json: { newPassword: "User@456" } })).status === 200, "reset password");
ok(!!(await login(uemail("approver1"), "User@456")), "login with reset password");
await req("POST", `/users/${app1.id}/reset-password`, { token: adminTok, json: { newPassword: "User@123" } }); // restore
const search = await req("GET", `/users?q=outsider`, { token: adminTok });
ok(Array.isArray(search.body) && search.body.some((u) => u.email === uemail("outsider")), "user search by name (q)");
ok((await req("GET", `/users/${app1.id}/activity`, { token: adminTok })).status === 200, "user activity history endpoint");

// ─── Validation ──────────────────────────────────────────────────
section("Data validation");
ok((await req("POST", "/users", { token: adminTok, json: { fullName: "x", email: "not-an-email", password: "123456" } })).status === 400, "invalid email rejected (400)");
ok((await req("POST", "/users", { token: adminTok, json: { fullName: "QA", email: uemail("requester") } })).status === 400, "missing password rejected (400)");
ok((await req("POST", "/users", { token: adminTok, json: { fullName: "Dup", email: uemail("requester"), password: "User@123" } })).status === 409, "duplicate email rejected (409)");

// ─── Signature groups + profile linkage ──────────────────────────
section("Signature groups");
const group = (await req("POST", "/signature-groups", { token: adminTok, json: { name: `QA Grp ${stamp}`, profileId: profile.id, approvalMode: "SEQUENTIAL", members: [{ userId: app1.id, order: 1 }, { userId: app2.id, order: 2 }] } })).body;
ok(!!group?.id, "create signature group linked to profile");
const visGroups = await req("GET", `/lookups/profiles/${profile.id}/groups`, { token: reqTok });
ok(visGroups.body.some((g) => g.id === group.id), "group visible under its profile (lookup)");

// ─── Document workflow: SEQUENTIAL + reject ──────────────────────
section("Workflow — file validation & upload");
const uploadTxt = async (title) => {
  const fd = new FormData();
  fd.set("title", title); fd.set("profileId", profile.id);
  fd.set("file", new Blob([`QA doc ${title}. Confidential safety report.`], { type: "text/plain" }), "doc.txt");
  return req("POST", "/documents/upload", { token: reqTok, form: fd });
};
const badExt = new FormData();
badExt.set("title", "bad"); badExt.set("profileId", profile.id);
badExt.set("file", new Blob(["x"], { type: "application/octet-stream" }), "evil.exe");
ok((await req("POST", "/documents/upload", { token: reqTok, form: badExt })).status >= 400, "unsupported file type rejected");
const doc1 = (await uploadTxt("Sequential Doc")).body;
ok(doc1?.status === "PDF_CONVERTED", "upload auto-converts to PDF (status PDF_CONVERTED)");

section("Workflow — access rules & submit validation");
ok((await req("POST", `/documents/${doc1.id}/submit`, { token: reqTok, json: {} })).status === 400, "submit with no signatory rejected (400)");
ok((await req("POST", `/documents/${doc1.id}/submit`, { token: reqTok, json: { signatoryIds: [outsider.id] } })).status === 403, "signatory outside profile rejected (403)");
const otherGroup = (await req("POST", "/signature-groups", { token: adminTok, json: { name: `QA OtherGrp ${stamp}`, profileId: otherProfile.id, members: [{ userId: outsider.id, order: 1 }] } })).body;
ok((await req("POST", `/documents/${doc1.id}/submit`, { token: reqTok, json: { signatureGroupId: otherGroup.id } })).status === 403, "group from another profile rejected (403)");

section("Workflow — sequential approval");
const sub1 = await req("POST", `/documents/${doc1.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id, app2.id], approvalMode: "SEQUENTIAL" } });
ok(sub1.body.status === "PENDING_APPROVAL", "submit -> PENDING_APPROVAL");
ok((await req("POST", `/documents/${doc1.id}/decision`, { token: app2Tok, json: { decision: "APPROVE" } })).status === 400, "2nd signatory blocked before 1st (sequential)");
ok((await req("POST", `/documents/${doc1.id}/decision`, { token: app1Tok, json: { decision: "APPROVE" } })).body.status === "PARTIALLY_APPROVED", "1st approves -> PARTIALLY_APPROVED");
ok((await req("POST", `/documents/${doc1.id}/decision`, { token: app2Tok, json: { decision: "APPROVE" } })).body.status === "COMPLETED", "2nd approves -> COMPLETED");
// original preserved + final pdf
const dl = await fetch(`${API}/documents/${doc1.id}/download/final`, { headers: { Authorization: `Bearer ${reqTok}` } });
const buf = Buffer.from(await dl.arrayBuffer());
ok(dl.status === 200 && buf.slice(0, 4).toString() === "%PDF", "final signed PDF downloadable (%PDF)");
const orig = await (await fetch(`${API}/documents/${doc1.id}/download/original`, { headers: { Authorization: `Bearer ${reqTok}` } })).text();
ok(orig.includes("Confidential safety report"), "original document preserved untouched");
const hist = (await req("GET", `/documents/${doc1.id}/history`, { token: reqTok })).body.map((e) => e.action);
ok(["UPLOADED", "CONVERTED", "SUBMITTED", "APPROVED", "COMPLETED"].every((a) => hist.includes(a)), "document history/audit complete");

section("Workflow — reject path");
const doc2 = (await uploadTxt("Reject Doc")).body;
await req("POST", `/documents/${doc2.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id] } });
ok((await req("POST", `/documents/${doc2.id}/decision`, { token: app1Tok, json: { decision: "REJECT", comment: "Not valid" } })).body.status === "REJECTED", "reject -> REJECTED");

section("Workflow — parallel approval");
const doc3 = (await uploadTxt("Parallel Doc")).body;
await req("POST", `/documents/${doc3.id}/submit`, { token: reqTok, json: { signatoryIds: [app1.id, app2.id], approvalMode: "PARALLEL" } });
// in parallel, 2nd can act without waiting
const p2 = await req("POST", `/documents/${doc3.id}/decision`, { token: app2Tok, json: { decision: "APPROVE" } });
ok(p2.status === 200, "parallel: either signatory can act first");
ok((await req("POST", `/documents/${doc3.id}/decision`, { token: app1Tok, json: { decision: "APPROVE" } })).body.status === "COMPLETED", "parallel: all approve -> COMPLETED");

section("Workflow — cancel");
const doc4 = (await uploadTxt("Cancel Doc")).body;
ok((await req("POST", `/documents/${doc4.id}/cancel`, { token: reqTok })).status === 200, "requester can cancel");

section("Permissions on signing/stamp");
ok((await req("POST", `/documents/${doc1.id}/placements`, { token: reqTok, json: { kind: "STAMP", page: 1, x: 0.1, y: 0.1, width: 0.2, height: 0.1, stampId: "x" } })).status === 403, "requester lacks USE_STAMP (403)");

// ─── PDF view with query token (mobile) ──────────────────────────
section("PDF view via query token");
const viewQ = await fetch(`${API}/documents/${doc1.id}/view/final?token=${encodeURIComponent(reqTok)}`);
ok(viewQ.status === 200, "PDF view accepts ?token= (mobile external viewer)");
const viewNo = await fetch(`${API}/documents/${doc1.id}/view/final`);
ok(viewNo.status === 401, "PDF view without token -> 401");

// ─── Audit trail ─────────────────────────────────────────────────
section("Audit trail");
const auditRes = await req("GET", `/audit?q=FAILED_LOGIN`, { token: adminTok });
ok(auditRes.status === 200 && auditRes.body.logs.some((l) => l.action === "FAILED_LOGIN"), "failed login recorded in audit");
const auditActions = (await req("GET", "/audit", { token: adminTok })).body.actions;
ok(["UPLOAD_DOCUMENT", "SUBMIT_DOCUMENT", "APPROVE_DOCUMENT", "REJECT_DOCUMENT", "CREATE_USER"].every((a) => auditActions.includes(a)), "audit covers key activities");

// ─── Reports & dashboard ─────────────────────────────────────────
section("Reports & dashboard");
const dash = (await req("GET", "/dashboard", { token: adminTok })).body;
ok(dash.cards.totalDocuments >= 4 && dash.cards.completed >= 2 && dash.cards.rejected >= 1, "dashboard counters reflect activity");
const adminRep = (await req("GET", "/reports/admin", { token: adminTok })).body;
ok(typeof adminRep.avgApprovalDelayHours === "number" && adminRep.byStatus, "admin report shape");
const myRep = (await req("GET", "/reports/me", { token: reqTok })).body;
ok(myRep.uploaded >= 4, "my report counts my uploads");

// ─── Notifications ───────────────────────────────────────────────
section("Notifications");
const notif = (await req("GET", "/notifications", { token: reqTok })).body;
ok(notif.notifications.some((n) => n.type === "DOCUMENT_COMPLETED"), "requester notified of completion");
ok(notif.notifications.some((n) => n.type === "DOCUMENT_REJECTED"), "requester notified of rejection");
const app1Notif = (await req("GET", "/notifications", { token: app1Tok })).body;
ok(app1Notif.notifications.some((n) => ["SIGNATURE_REQUEST", "APPROVAL_REQUIRED"].includes(n.type)), "signatory notified of request");
if (notif.notifications[0]) ok((await req("POST", `/notifications/${notif.notifications[0].id}/read`, { token: reqTok })).status === 200, "mark notification read");

// ─── Integration (same backend reflects across clients) ──────────
section("Integration / cross-client consistency");
const adminSeesDoc = (await req("GET", `/documents/${doc1.id}`, { token: adminTok }));
ok(adminSeesDoc.body?.status === "COMPLETED", "action by signatory visible to admin (shared backend)");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) { console.log("\nFailures:"); fails.forEach((f) => console.log("  - " + f)); }
process.exit(fail ? 1 : 0);
