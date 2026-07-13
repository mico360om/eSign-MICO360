// eSign MICO360 — tags/folders + saved filters QA (run against a live server).
//   node server/test/qa-tags-filters.mjs
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
const em = (n) => `qtf_${n}_${stamp}@mico360.com`;

console.log("\n===== eSign MICO360 — Tags & Saved Filters QA =====");
const admin = await login("admin@mico360.com", "Admin@123");
const roles = (await req("GET", "/roles", { token: admin })).body;
const roleId = (n) => roles.find((r) => r.name === n)?.id;
const profile = (await req("POST", "/profiles", { token: admin, json: { name: `QTF ${stamp}` } })).body;
const mk = async (n, role) => (await req("POST", "/users", { token: admin, json: { fullName: `QTF ${n}`, email: em(n), password: "User@123", roleId: roleId(role), profileIds: [profile.id] } })).body;
const requester = await mk("req", "Requester");
const reqTok = await login(em("req"), "User@123");

const upload = async (title) => {
  const fd = new FormData();
  fd.set("title", title); fd.set("profileId", profile.id);
  fd.set("file", new Blob([`tag test ${title} ${stamp}`], { type: "text/plain" }), "d.txt");
  return (await req("POST", "/documents/upload", { token: reqTok, form: fd })).body;
};
const docA = await upload(`Tagged A ${stamp}`);
const docB = await upload(`Tagged B ${stamp}`);

section("Tag definitions");
const created = await req("POST", "/tags", { token: reqTok, json: { name: `Finance ${stamp}`, color: "#1565c0" } });
ok(created.status === 200 && created.body?.name?.startsWith("Finance"), "any user can create a tag");
ok((await req("POST", "/tags", { token: reqTok, json: { name: `Finance ${stamp}` } })).status === 400, "duplicate tag name rejected (400)");
ok((await req("POST", "/tags", { token: reqTok, json: { name: `Bad ${stamp}`, color: "red" } })).status === 400, "invalid color rejected (400)");
const hrTag = (await req("POST", "/tags", { token: admin, json: { name: `HR ${stamp}` } })).body;
const list = await req("GET", "/tags", { token: reqTok });
ok(list.body?.some((t) => t.id === created.body.id), "tag appears in the list");
const financeId = created.body.id;

section("Apply tags to documents");
ok((await req("POST", `/documents/${docA.id}/tags`, { token: reqTok, json: { tagId: financeId } })).status === 200, "apply tag to document A");
await req("POST", `/documents/${docA.id}/tags`, { token: reqTok, json: { tagId: hrTag.id } }); // A: Finance + HR
await req("POST", `/documents/${docB.id}/tags`, { token: reqTok, json: { tagId: financeId } }); // B: Finance
ok((await req("POST", `/documents/${docA.id}/tags`, { token: reqTok, json: { tagId: financeId } })).status === 200, "re-applying same tag is idempotent (no error)");
ok((await req("POST", `/documents/${docA.id}/tags`, { token: reqTok, json: { tagId: "nope" } })).status === 404, "applying an unknown tag → 404");
const docAfull = await req("GET", `/documents/${docA.id}`, { token: reqTok });
ok((docAfull.body?.tags || []).length === 2, "document returns its two tags");
const usage = (await req("GET", "/tags", { token: reqTok })).body.find((t) => t.id === financeId);
ok(usage?.count === 2, "tag usage count reflects both documents");

section("Filter documents by tag (folder view)");
const byHr = await req("GET", `/documents?tagId=${hrTag.id}`, { token: reqTok });
ok(byHr.body?.some((d) => d.id === docA.id) && !byHr.body?.some((d) => d.id === docB.id), "tag filter returns only matching documents");
const byFinance = await req("GET", `/documents?tagId=${financeId}`, { token: reqTok });
ok(byFinance.body?.filter((d) => [docA.id, docB.id].includes(d.id)).length === 2, "both Finance docs returned");

section("Remove tag");
ok((await req("DELETE", `/documents/${docA.id}/tags/${hrTag.id}`, { token: reqTok })).status === 200, "remove a tag from a document");
ok((await req("GET", `/documents?tagId=${hrTag.id}`, { token: reqTok })).body?.length === 0, "document no longer matches the removed tag");

section("Delete tag definition (permission)");
ok((await req("DELETE", `/tags/${hrTag.id}`, { token: reqTok })).status === 403, "non-admin cannot delete a tag definition (403)");
ok((await req("DELETE", `/tags/${hrTag.id}`, { token: admin })).status === 200, "admin deletes a tag definition");

section("Saved filters");
const sf = await req("POST", "/saved-filters", { token: reqTok, json: { name: "My urgent finance", query: { priority: "URGENT", tagId: financeId } } });
ok(sf.status === 200 && sf.body?.query?.tagId === financeId, "save a filter with params");
const mine = await req("GET", "/saved-filters", { token: reqTok });
ok(mine.body?.length === 1 && mine.body[0].name === "My urgent finance", "list my saved filters");
const upd = await req("POST", "/saved-filters", { token: reqTok, json: { name: "My urgent finance", query: { priority: "CRITICAL" } } });
ok((await req("GET", "/saved-filters", { token: reqTok })).body?.length === 1 && upd.body?.query?.priority === "CRITICAL", "re-saving same name updates (no duplicate)");
ok((await req("GET", "/saved-filters", { token: admin })).body?.every((f) => f.name !== "My urgent finance"), "saved filters are private per user");
ok((await req("DELETE", `/saved-filters/${sf.body.id}`, { token: admin })).status === 404, "cannot delete another user's saved filter (404)");
ok((await req("DELETE", `/saved-filters/${sf.body.id}`, { token: reqTok })).status === 200, "owner deletes their saved filter");

console.log(`\n===== ${pass} passed, ${fail} failed =====`);
if (fail) { console.log("\nFailures:"); fails.forEach((f) => console.log("  - " + f)); }
process.exit(fail ? 1 : 0);
