import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

const orgA = "11111111-1111-4111-8111-111111111111";
const orgB = "22222222-2222-4222-8222-222222222222";
const project = "33333333-3333-4333-8333-333333333333";
const contract = "44444444-4444-4444-8444-444444444444";
const fileId = "55555555-5555-4555-8555-555555555555";
const objectKey = `${orgA}/${project}/${fileId}-report.pdf`;
const pdf = new Blob(["%PDF-1.7\\nsynthetic payload"], { type: "application/pdf" });
const tests = globalThis;
let downloadCount = 0;
const query = {
  select() { return this; }, eq() { return this; },
  maybeSingle: async () => ({ data: tests.w05DocFound === false ? null : tests.w05Document, error: null }),
};
const membershipQuery = {
  select() { return this; }, eq() { return this; },
  maybeSingle: async () => ({ data: tests.w05MemberActive === false ? null : { user_id: fileId }, error: null }),
};
tests.w05Client = {
  from(table) { return table === "organization_members" ? membershipQuery : query; },
  rpc: async () => ({ error: tests.w05AuditError ? { code: "AUDIT_FAILED" } : null }),
  storage: { from: () => ({ download: async () => {
    downloadCount++;
    return tests.w05ObjectMissing ? { data: null, error: { code: "not_found" } } : { data: tests.w05Blob || pdf, error: null };
  } }) },
};
tests.w05Service = { storage: tests.w05Client.storage };
const authContext = {
  organizationId: orgA, role: "owner", user: { id: fileId },
  entitlement: { status: "active" }, supabase: tests.w05Client,
};
tests.w05Context = authContext;

const plugins = [{
  name: "w05-synthetic-auth-and-storage",
  setup(b) {
    const shim = {
      "@/lib/auth/organization-context": `export async function resolveOrganizationContext(){return globalThis.w05Context}; export function isOrganizationEntitlementActive(){return globalThis.w05EntitlementActive!==false}`,
      "@/lib/crm/access": "export async function canCrm(){return globalThis.w05Allowed!==false}",
      "@/lib/supabase/server": "export function createServerSupabaseClient(){return globalThis.w05Service}",
    };
    b.onResolve({ filter: /^@\/lib\/(auth\/organization-context|crm\/access|supabase\/server)$/ },
      (args) => ({ path: args.path, namespace: "w05shim" }));
    b.onLoad({ filter: /.*/, namespace: "w05shim" },
      (args) => ({ contents: shim[args.path], loader: "js" }));
  },
}];
async function loadRoute(path) {
  const built = await build({
    entryPoints: [path], bundle: true, write: false, platform: "node",
    format: "cjs", packages: "external", plugins, logLevel: "silent",
  });
  const mod = { exports: {} };
  new Function("require", "module", "exports", built.outputFiles[0].text)(
    createRequire(process.cwd() + "/package.json"), mod, mod.exports);
  return mod.exports;
}
const crm = await loadRoute("app/api/crm/documents/[id]/route.ts");
const company = await loadRoute("app/api/company-library/documents/[id]/route.ts");
const request = new Request("https://fixture.invalid/document");
const crmGet = () => crm.GET(request, { params: Promise.resolve({ id: fileId }) });
const companyGet = () => company.GET(request, { params: Promise.resolve({ id: fileId }) });
const resetDoc = () => { tests.w05Document = {
  id: fileId, organization_id: orgA, file_name: "report.pdf",
  mime_type: "application/pdf", byte_size: pdf.size, storage_path: objectKey,
  confidentiality: "contract", contract_id: contract, project_id: project,
}; };
resetDoc();
tests.w05DocFound = true;
tests.w05Allowed = true;

tests.w05Context = null;
assert.equal((await crmGet()).status, 401, "unauthenticated user denied");
tests.w05Context = authContext;
tests.w05DocFound = false;
assert.equal((await crmGet()).status, 404, "unresolved document denied");
tests.w05DocFound = true;
resetDoc();
tests.w05Document.storage_path = `${orgB}/${project}/${fileId}-report.pdf`;
const prior = downloadCount;
assert.equal((await crmGet()).status, 404, "foreign-tenant path denied before service role");
assert.equal(downloadCount, prior, "forbidden path cannot invoke privileged download");
resetDoc();
tests.w05Allowed = false;
assert.equal((await crmGet()).status, 404, "same-tenant unauthorized contract capability denied");
assert.equal(downloadCount, prior, "denied capability cannot invoke privileged download");
tests.w05Allowed = true;
tests.w05AuditError = true;
assert.equal((await crmGet()).status, 503, "audit failure fails closed");
assert.equal(downloadCount, prior, "audit failure prevents file retrieval");
tests.w05AuditError = false;
const ok = await crmGet();
assert.equal(ok.status, 200, "authorized synthetic CRM download");
assert.match(ok.headers.get("Cache-Control") || "", /no-store/);
assert.match(ok.headers.get("Content-Disposition") || "", /attachment/);
assert.equal(await ok.text(), await pdf.text(), "authorized bytes match synthetic fixture");

tests.w05Blob = new Blob(["<script>bad</script>"], { type: "application/pdf" });
assert.equal((await crmGet()).status, 404, "declared PDF with invalid bytes is denied");
tests.w05Blob = pdf;

tests.w05MemberActive = false;
const beforeCompany = downloadCount;
assert.equal((await companyGet()).status, 404, "revoked company owner denied at request time");
assert.equal(downloadCount, beforeCompany);
tests.w05MemberActive = true;
tests.w05Document = { id:fileId, storage_path:`${orgB}/forged.pdf`, source_filename:"report.pdf",
  mime_type:"application/pdf", file_size_bytes:pdf.size };
assert.equal((await companyGet()).status, 404, "company library foreign path denied");
assert.equal(downloadCount, beforeCompany);
tests.w05Document.storage_path = `${orgA}/${fileId}-report.pdf`;
const companyOk = await companyGet();
assert.equal(companyOk.status, 200, "authorized company library download");
assert.equal(await companyOk.text(), await pdf.text());
assert.match(companyOk.headers.get("Cache-Control") || "", /no-store/);
tests.w05Context = { ...authContext, role: "member" };
assert.equal((await companyGet()).status, 404, "nonowner denied");
resetDoc();
assert.equal((await crmGet()).status, 200, "CRM grant remains independent of company-owner role");
console.log("PASS: isolated W05 real HTTP handlers: CRM 401/404/503/200, IDOR, role/capability, audit fail-closed, MIME, revocation, private Library");
