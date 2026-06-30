// End-to-end workflow smoke test against the running API.
const API = "http://localhost:4400/api";
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) { pass++; console.log("  ✓", m); } else { fail++; console.log("  ✗ FAIL:", m); } };

async function req(method, path, { token, json, form } = {}) {
  const headers = {};
  if (token) headers.Authorization = `Bearer ${token}`;
  let body;
  if (json) { headers["Content-Type"] = "application/json"; body = JSON.stringify(json); }
  if (form) body = form;
  const res = await fetch(API + path, { method, headers, body });
  const text = await res.text();
  let data; try { data = JSON.parse(text); } catch { data = text; }
  return { status: res.status, data, headers: res.headers };
}
const login = async (email, password) => (await req("POST", "/auth/login", { json: { email, password } })).data.data.token;

console.log("\n== eSign MICO360 — workflow smoke test ==\n");

// Auth
const adminTok = await login("admin@mico360.com", "Admin@123");
ok(!!adminTok, "admin login returns token");
const reqTok = await login("requester@mico360.com", "User@123");
const appTok = await login("approver@mico360.com", "User@123");
const mgrTok = await login("manager@mico360.com", "User@123");
ok(reqTok && appTok && mgrTok, "requester/approver/manager login");

// RBAC: requester must NOT access user management
const denied = await req("GET", "/users", { token: reqTok });
ok(denied.status === 403, "RBAC: requester blocked from /users (403)");
const allowed = await req("GET", "/users", { token: adminTok });
ok(allowed.status === 200, "RBAC: admin allowed on /users (200)");

// requester profile
const me = (await req("GET", "/auth/me", { token: reqTok })).data.data;
const profileId = me.profiles[0]?.id;
ok(!!profileId, `requester has a profile (${me.profiles[0]?.name})`);

// upload + auto convert
const form = new FormData();
form.set("title", "Rig A-12 Safety Report");
form.set("profileId", profileId);
form.set("file", new Blob(["Quarterly safety inspection for offshore rig A-12.\nRequires management sign-off."], { type: "text/plain" }), "report.txt");
const up = (await req("POST", "/documents/upload", { token: reqTok, form })).data.data;
ok(up?.status === "PDF_CONVERTED", `upload + auto PDF convert (status=${up?.status})`);
const docId = up.id;

// signatories via scoped lookup
const sigs = (await req("GET", `/lookups/profiles/${profileId}/signatories`, { token: reqTok })).data.data;
ok(Array.isArray(sigs) && sigs.length >= 2, `lookup signatories in profile (${sigs.length})`);
const approver = sigs.find((s) => s.email === "approver@mico360.com");
const manager = sigs.find((s) => s.email === "manager@mico360.com");

// access rule: cannot pick a signatory outside the profile — make a lone-profile user
//   (admin creates a new profile + user, then requester submit to that user must 403)
const otherProf = (await req("POST", "/profiles", { token: adminTok, json: { name: `Solo-${Date.now()}` } })).data.data;
const outsider = (await req("POST", "/users", { token: adminTok, json: { fullName: "Out Sider", email: `out${Date.now()}@x.com`, password: "User@123", profileIds: [otherProf.id] } })).data.data;
const badSubmit = await req("POST", `/documents/${docId}/submit`, { token: reqTok, json: { signatoryIds: [outsider.id] } });
ok(badSubmit.status === 403, "access rule: signatory outside profile rejected (403)");

// submit sequential to approver then manager
const sub = await req("POST", `/documents/${docId}/submit`, { token: reqTok, json: { signatoryIds: [approver.id, manager.id], approvalMode: "SEQUENTIAL", comment: "Please review" } });
ok(sub.data.data?.status === "PENDING_APPROVAL", `submit -> PENDING_APPROVAL`);

// sequential enforcement: manager (2nd) cannot approve before approver (1st)
const early = await req("POST", `/documents/${docId}/decision`, { token: mgrTok, json: { decision: "APPROVE" } });
ok(early.status === 400, "sequential: 2nd signatory blocked until 1st acts (400)");

// approver approves
const a1 = await req("POST", `/documents/${docId}/decision`, { token: appTok, json: { decision: "APPROVE", comment: "Looks good" } });
ok(a1.data.data?.status === "PARTIALLY_APPROVED", `approver approves -> PARTIALLY_APPROVED`);

// manager places a stamp then approves -> should finalize
const stamps = (await req("GET", `/lookups/profiles/${profileId}/stamps`, { token: mgrTok })).data.data;
ok(stamps.length >= 1, `company stamp available in profile (${stamps.length})`);
const place = await req("POST", `/documents/${docId}/placements`, { token: mgrTok, json: { kind: "STAMP", page: 1, x: 0.6, y: 0.8, width: 0.25, height: 0.1, stampId: stamps[0].id } });
ok(place.status === 200, "manager places company stamp on PDF copy");

const a2 = await req("POST", `/documents/${docId}/decision`, { token: mgrTok, json: { decision: "APPROVE" } });
ok(a2.data.data?.status === "COMPLETED", `final approval -> COMPLETED (final PDF generated)`);

// download the final signed PDF (requester has DOWNLOAD)
const dl = await fetch(`${API}/documents/${docId}/download/final`, { headers: { Authorization: `Bearer ${reqTok}` } });
const buf = Buffer.from(await dl.arrayBuffer());
ok(dl.status === 200 && buf.slice(0, 4).toString() === "%PDF", `download final signed PDF (${buf.length} bytes, %PDF header)`);

// original is preserved & still downloadable, untouched
const orig = await fetch(`${API}/documents/${docId}/download/original`, { headers: { Authorization: `Bearer ${reqTok}` } });
const otext = await orig.text();
ok(otext.includes("Quarterly safety inspection"), "original document preserved untouched");

// document history / audit trail
const hist = (await req("GET", `/documents/${docId}/history`, { token: reqTok })).data.data;
const actions = hist.map((h) => h.action);
ok(["UPLOADED", "CONVERTED", "SUBMITTED", "APPROVED", "STAMPED", "COMPLETED"].every((a) => actions.includes(a)), `audit trail complete: ${actions.join(",")}`);

// dashboard
const dash = (await req("GET", "/dashboard", { token: adminTok })).data.data;
ok(dash.cards.totalDocuments >= 1 && dash.cards.completed >= 1, `dashboard stats (docs=${dash.cards.totalDocuments}, completed=${dash.cards.completed})`);

// notifications for the requester (completion)
const notif = (await req("GET", "/notifications", { token: reqTok })).data.data;
ok(notif.notifications.some((n) => n.type === "DOCUMENT_COMPLETED"), "requester notified of completion");

console.log(`\n== ${pass} passed, ${fail} failed ==\n`);
process.exit(fail ? 1 : 0);
