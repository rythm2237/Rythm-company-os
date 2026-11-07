// W03 + W05 integrated security regression: positive fixtures must obey W05
// tenant-scoped object key and MIME validation; never relax the route guard.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

async function main() {
  const org = "00000000-0000-4000-8000-000000000001";
  const otherOrg = "00000000-0000-4000-8000-000000000009";
  const documentId = "00000000-0000-4000-8000-000000000002";
  const projectId = "00000000-0000-4000-8000-000000000003";
  const pdf = new Blob(["%PDF-1.7\nW03-W05 synthetic tenant document"], { type: "application/pdf" });
  const state = { context: null as unknown, doc: null as unknown, queryError: null as unknown, filters: [] as unknown[][], privilegedDownloads: 0, auditDenied: false, allowed: true, fileAuditCalls: [] as unknown[] };
  const globalFixture = globalThis as typeof globalThis & { w03Fixture?: typeof state };
  globalFixture.w03Fixture = state;
  const query = {
    select() { return this; },
    eq(...args: unknown[]) { state.filters.push(args); return this; },
    async maybeSingle() { return { data: state.doc, error: state.queryError }; },
  };
  try {
    const built = await build({
      entryPoints: ["app/api/crm/documents/[id]/route.ts"],
      bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
      plugins: [{ name: "w03-w05-private-file-boundary", setup(b) {
        const shims: Record<string, string> = {
          "@/lib/auth/organization-context": "export async function resolveOrganizationContext(){return globalThis.w03Fixture.context}",
          "@/lib/supabase/server": `export function createServerSupabaseClient(){globalThis.w03Fixture.privilegedDownloads++;return {storage:{from:()=>({download:async()=>({data:new Blob(['%PDF-1.7\\nW03-W05 synthetic tenant document'],{type:'application/pdf'}),error:null})})}}}`,
          "@/lib/crm/access": "export async function canCrm(){return globalThis.w03Fixture.allowed}",
          "@/lib/security/private-file-audit": "export async function logPrivateFileAccess(row){globalThis.w03Fixture.fileAuditCalls.push(row);return !globalThis.w03Fixture.auditDenied}",
        };
        b.onResolve({ filter: new RegExp("^@/lib/(auth/organization-context|supabase/server|crm/access|security/private-file-audit)$") }, a => ({ path: a.path, namespace: "w03w05" }));
        b.onLoad({ filter: /.*/, namespace: "w03w05" }, a => ({ contents: shims[a.path], loader: "js" }));
      } }],
    });
    const mod = { exports: {} as { GET: (r: Request, p: { params: Promise<{ id: string }> }) => Promise<Response> } };
    new Function("require", "module", "exports", built.outputFiles[0].text)(createRequire(process.cwd() + "/package.json"), mod, mod.exports);
    const invoke = (id = documentId) => mod.exports.GET(
      new Request("https://fixture.invalid/api/crm/documents/" + id), { params: Promise.resolve({ id }) });
    const authorized = { organizationId: org, user: { id: documentId }, role: "owner", supabase: { from: () => query, rpc: async () => ({ error: null }) } };
    const document = (extra: Record<string, unknown> = {}) => ({
      id: documentId, organization_id: org, project_id: projectId, contract_id: null,
      storage_path: `${org}/${projectId}/${documentId}-report.pdf`,
      file_name: "report.pdf", mime_type: "application/pdf", byte_size: pdf.size,
      confidentiality: "operational", ...extra,
    });
    assert.equal((await invoke()).status, 401, "anonymous denied");
    state.context = authorized;
    assert.equal((await invoke("not-a-uuid")).status, 404, "invalid id denied");
    assert.equal((await invoke()).status, 404, "missing document denied");
    assert.ok(state.filters.some(f => f[0] === "organization_id" && f[1] === org));
    assert.ok(state.filters.some(f => f[0] === "id" && f[1] === documentId));

    state.queryError = { message: "RLS denied" };
    assert.equal((await invoke()).status, 404, "RLS denial remains private");
    state.queryError = null;
    state.doc = document({ organization_id: otherOrg });
    assert.equal((await invoke()).status, 404, "forged tenant metadata blocked");
    state.doc = document({ storage_path: `${otherOrg}/${projectId}/report.pdf` });
    assert.equal((await invoke()).status, 404, "foreign object key blocked before service role");
    state.doc = document({ storage_path: "synthetic-only" });
    assert.equal((await invoke()).status, 404, "unbound object key blocked");
    state.doc = document({ confidentiality: "contract", contract_id: documentId, storage_path: `${org}/contracts/${documentId}/report.pdf` });
    state.allowed = false;
    assert.equal((await invoke()).status, 404, "confidential capability denied");
    state.allowed = true;
    assert.equal(state.privilegedDownloads, 0, "no forbidden case reaches privileged Storage");

    state.doc = document();
    state.auditDenied = true;
    assert.equal((await invoke()).status, 503, "private-file grant audit failure fails closed");
    state.auditDenied = false;
    const response = await invoke();
    assert.equal(response.status, 200, "valid authorized PDF downloads");
    assert.equal(await response.text(), await pdf.text(), "authorized bytes match");
    assert.match(response.headers.get("cache-control") || "", /no-store/);
    assert.equal(state.privilegedDownloads, 2, "only authorized/controlled cases reached the Storage adapter");
    assert.ok(state.fileAuditCalls.some((row:any) => row.outcome === "denied"));
    assert.ok(state.fileAuditCalls.some((row:any) => row.outcome === "granted"));
    state.context = null;
    assert.equal((await invoke()).status, 401, "revoked context has no access");
    console.log("PASS W03+W05 integrated CRM document boundary: tenant/RLS/object keys, capability, immutable audit, MIME/bytes, HTTP 401/404/503/200");
  } finally { delete globalFixture.w03Fixture; }
}
main().catch(error => { console.error("FAIL W03+W05 integrated CRM document boundary", error); process.exitCode = 1; });
