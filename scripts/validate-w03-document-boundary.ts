// Isolated handler regression only: this does not prove live HTTP or Storage RLS.
import assert from "node:assert/strict";
import { createRequire } from "node:module";
import { build } from "esbuild";

async function main() {
  const state = { context: null as unknown, serviceCalls: 0, filters: [] as unknown[][] };
  const fixtureGlobal = globalThis as typeof globalThis & { w03Fixture?: typeof state };
  fixtureGlobal.w03Fixture = state;
  try {
    const built = await build({ entryPoints: ["app/api/crm/documents/[id]/route.ts"], bundle: true, write: false, platform: "node", format: "cjs", packages: "external", plugins: [{
      name: "w03-isolated-boundaries", setup(b) {
        b.onResolve({ filter: /^@\/lib\/(auth\/organization-context|supabase\/server)$/ }, a => ({ path: a.path, namespace: "w03" }));
        b.onLoad({ filter: /.*/, namespace: "w03" }, a => ({ loader: "js", contents: a.path.includes("organization-context")
          ? "export async function resolveOrganizationContext(){return globalThis.w03Fixture.context}"
          : "export function createServerSupabaseClient(){globalThis.w03Fixture.serviceCalls++;return {storage:{from:()=>({download:async()=>({data:new Blob(['W03 synthetic bytes']),error:null})})}}}" }));
      },
    }] });
    const mod = { exports: {} as { GET: (r: Request, p: {params: Promise<{id: string}>}) => Promise<Response> } };
    new Function("require", "module", "exports", built.outputFiles[0].text)(createRequire(process.cwd() + "/package.json"), mod, mod.exports);
    const org = "00000000-0000-4000-8000-000000000001";
    const foreignId = "00000000-0000-4000-8000-000000000002";
    const invoke = (id = foreignId) => mod.exports.GET(new Request("https://fixture.test/api/crm/documents/" + id), { params: Promise.resolve({ id }) });
    assert.equal((await invoke()).status, 401);
    let result: {data: unknown; error: unknown} = { data: null, error: null };
    const query = { select: () => query, eq: (...args: unknown[]) => { state.filters.push(args); return query; }, maybeSingle: async () => result };
    state.context = { organizationId: org, supabase: { from: () => query, rpc: async () => ({ error: { message: "denied" } }) } };
    assert.equal((await invoke("invalid")).status, 404);
    assert.equal((await invoke()).status, 404);
    assert.ok(state.filters.some(f => f[0] === "organization_id" && f[1] === org));
    assert.ok(state.filters.some(f => f[0] === "id" && f[1] === foreignId));
    result = { data: null, error: { message: "RLS denied" } };
    assert.equal((await invoke()).status, 404);
    result = { data: { confidentiality: "contract", contract_id: foreignId, project_id: foreignId }, error: null };
    assert.equal((await invoke()).status, 503);
    assert.equal(state.serviceCalls, 0, "Denied metadata/audit must never reach privileged file storage");
    result = { data: { confidentiality: "operational", file_name: "fixture.txt", mime_type: "text/plain", storage_path: "synthetic-only" }, error: null };
    const positive = await invoke();
    assert.equal(positive.status, 200);
    assert.equal(await positive.text(), "W03 synthetic bytes");
    assert.equal(state.serviceCalls, 1, "Positive control must reach the storage adapter");
    console.log("PASS W03 isolated document handler: auth, invalid ID, foreign/missing row, query failure and audit failure deny before privileged storage. LIVE HTTP/STORAGE: NOT RUN.");
  } finally { delete fixtureGlobal.w03Fixture; }
}
main().catch(() => { console.error("FAIL W03 isolated document boundary regression"); process.exitCode = 1; });
