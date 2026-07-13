// eSign MICO360 — document comments/notes thread QA (run against a live server).
//   node server/test/qa-comments.mjs
// Covers: post/list, participant notifications, access rules (outsider blocked),
// validation, delete-own vs moderate, and the history event.
const API = process.env.QA_API || "http://localhost:4400/api";
let pass = 0, fail = 0; const fails = [];
const ok = (c, m) => { if (c) pass++; else { fail++; fails.push(m); console.log("  ✗", m); } };
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
  return { status: res.status, data, body: data?.data };
}
const login = async (e, p) => (await req("POST", "/auth/login", { json: { email: e, password: p } }))?.body?.token;
const stamp = Date.now();
const em = (n) => `qac_${n}_${stamp}@mico360.com`;

console.log("\n===== eSign MICO360 — Comments QA =====");
const admin = await login("admin@mico360.com", "Admin@123");
const roles = (await req("GET", "/roles", { token: admin })).body;
const roleId = (n) => roles.find((r) => r.name === n)?.id;
const profile = (await req("POST", "/profiles", { token: admin, json: { name: `QAC ${stamp}` } })).body;
const otherProfile = (await req("POST", "/profiles", { token: admin, json: { name: `QAC Other ${stamp}` } })).body;
const mk = async (n, role, pid) => (await req("POST", "/users", { token: admin, json: { fullName: `QAC ${n}`, email: em(n), password: "User@123", roleId: roleId(role), profileIds: [pid] } })).body;
const requester = await mk("req", "Requester", profile.id);
const approver = await mk("app", "Approver", profile.id);
await mk("out", "Requester", otherProfile.id); // outsider — different company
const reqTok = await login(em("req"), "User@123");
const appTok = await login(em("app"), "User@123");
const outTok = await login(em("out"), "User@123");

// A document with a workflow so the approver is a participant.
const fd = new FormData();
fd.set("title", `Comments Doc ${stamp}`); fd.set("profileId", profile.id);
fd.set("file", new Blob([`comments test ${stamp}`], { type: "text/plain" }), "c.txt");
const doc = (await req("POST", "/documents/upload", { token: reqTok, form: fd })).body;
await req("POST", `/documents/${doc.id}/submit`, { token: reqTok, json: { signatoryIds: [approver.id] } });

section("Post & list");
const c1 = await req("POST", `/documents/${doc.id}/comments`, { token: reqTok, json: { body: "Please review section 2 carefully." } });
ok(c1.status === 200 && c1.body?.body?.includes("section 2"), "uploader can post a comment");
ok(c1.body?.author?.fullName === "QAC req", "comment carries the author's name");
const list1 = await req("GET", `/documents/${doc.id}/comments`, { token: appTok });
ok(list1.status === 200 && list1.body?.length === 1, "participant (approver) sees the thread");

section("Notifications fan-out");
const appNotifs = (await req("GET", "/notifications", { token: appTok })).body;
ok(appNotifs?.notifications?.some((n) => n.type === "COMMENT_ADDED" && n.title.includes("Comments Doc")), "approver notified of the new comment");
const reply = await req("POST", `/documents/${doc.id}/comments`, { token: appTok, json: { body: "Reviewed — looks fine." } });
ok(reply.status === 200, "approver can reply");
const reqNotifs = (await req("GET", "/notifications", { token: reqTok })).body;
ok(reqNotifs?.notifications?.some((n) => n.type === "COMMENT_ADDED"), "uploader notified of the reply");
const selfNotify = appNotifs?.notifications?.filter((n) => n.type === "COMMENT_ADDED" && n.body?.startsWith("QAC app")).length ?? 0;
ok(selfNotify === 0, "author is not notified of their own comment");

section("Validation & access rules");
ok((await req("POST", `/documents/${doc.id}/comments`, { token: reqTok, json: { body: "   " } })).status === 400, "blank comment rejected (400)");
ok((await req("POST", `/documents/${doc.id}/comments`, { token: reqTok, json: { body: "x".repeat(2001) } })).status === 400, "over-long comment rejected (400)");
ok((await req("GET", `/documents/${doc.id}/comments`, { token: outTok })).status === 404, "outsider cannot read the thread (404)");
ok((await req("POST", `/documents/${doc.id}/comments`, { token: outTok, json: { body: "sneaky" } })).status === 404, "outsider cannot post (404)");

section("Delete: own vs moderate");
const mine = c1.body; const theirs = reply.body;
ok((await req("DELETE", `/documents/${doc.id}/comments/${theirs.id}`, { token: reqTok })).status === 403, "cannot delete someone else's comment (403)");
ok((await req("DELETE", `/documents/${doc.id}/comments/${mine.id}`, { token: reqTok })).status === 200, "author deletes their own comment");
ok((await req("DELETE", `/documents/${doc.id}/comments/${theirs.id}`, { token: admin })).status === 200, "admin can moderate (delete any comment)");
const list2 = await req("GET", `/documents/${doc.id}/comments`, { token: reqTok });
ok(list2.body?.length === 0, "thread empty after deletions");

section("History");
const hist = (await req("GET", `/documents/${doc.id}/history`, { token: reqTok })).body;
ok(hist?.some((e) => e.action === "COMMENT"), "COMMENT event recorded in document history");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) { console.log("\nFailures:"); fails.forEach((f) => console.log("  - " + f)); }
process.exit(fail ? 1 : 0);
