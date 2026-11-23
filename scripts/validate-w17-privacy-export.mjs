import assert from "node:assert/strict";
import { build } from "esbuild";

const result = await build({
  entryPoints: ["app/api/privacy/export/route.ts"],
  bundle: true,
  write: false,
  format: "esm",
  plugins: [{
    name: "privacy-route-fixture",
    setup(builder) {
      builder.onResolve({ filter: /^(next\/server|@\/lib\/supabase\/auth-server)$/ }, (args) => ({
        path: args.path,
        namespace: "fixture",
      }));
      builder.onLoad({ filter: /.*/, namespace: "fixture" }, ({ path }) => ({
        contents: path === "next/server"
          ? "export const NextResponse = Response;"
          : "export const createAuthServerClient = async () => globalThis.privacyExportFixture;",
      }));
    },
  }],
});

const { GET } = await import("data:text/javascript;base64," +
  Buffer.from(result.outputFiles[0].text).toString("base64"));
const organization = "tenant-b";
const memberships = [
  { organization_id: "tenant-a", user_id: "owner-a", role: "owner", membership_status: "active" },
  { organization_id: organization, user_id: "inactive-b", role: "owner", membership_status: "inactive" },
  { organization_id: organization, user_id: "viewer-b", role: "viewer", membership_status: "active" },
];

for (const [user, status] of [[null, 401], ["owner-a", 403], ["inactive-b", 403], ["viewer-b", 403]]) {
  const queries = [];
  globalThis.privacyExportFixture = {
    auth: { getUser: async () => ({ data: { user: user ? { id: user } : null } }) },
    from(table) {
      queries.push(table);
      assert.equal(table, "organization_members", "denied export queried payload tables");
      const filters = new Map();
      const query = {
        select: () => query,
        eq(key, value) {
          filters.set(key, value);
          return query;
        },
        async maybeSingle() {
          return {
            data: memberships.find((row) => [...filters].every(([key, value]) => row[key] === value)) ?? null,
          };
        },
      };
      return query;
    },
  };
  const response = await GET({ nextUrl: new URL(`https://synthetic.invalid/api/privacy/export?organizationId=${organization}`) });
  assert.equal(response.status, status);
  assert.deepEqual(await response.json(), { error: status === 401 ? "UNAUTHORIZED" : "FORBIDDEN" });
  assert.deepEqual(queries, user ? ["organization_members"] : []);
}
const accountUser = { id: "subject-a", email: "subject-a@example.invalid" };
const profile = { full_name: "Synthetic Subject A" };
let profileReads = 0;
globalThis.privacyExportFixture = {
  auth: { getUser: async () => ({ data: { user: accountUser } }) },
  from(table) {
    profileReads++;
    assert.equal(table, "customer_profiles");
    const query = {
      select(columns) {
        assert.equal(columns, "full_name,company_name,country_code,preferred_language,onboarding_status,created_at,updated_at");
        return query;
      },
      eq(column, value) {
        assert.equal(column, "user_id");
        assert.equal(value, accountUser.id);
        return query;
      },
      maybeSingle: async () => ({ data: profile }),
    };
    return query;
  },
};

const mixedScope = await GET({ nextUrl: new URL("https://synthetic.invalid/api/privacy/export?scope=account&organizationId=tenant-b") });
assert.equal(mixedScope.status, 400);
assert.equal(profileReads, 0);
const accountExport = await GET({ nextUrl: new URL("https://synthetic.invalid/api/privacy/export?scope=account&userId=subject-b") });
assert.equal(accountExport.status, 200);
assert.match(accountExport.headers.get("cache-control"), /no-store/);
const payload = await accountExport.json();
assert.equal(payload.scope, "account-profile");
assert.equal(payload.account.id, accountUser.id);
assert.deepEqual(payload.profile, profile);
assert.equal(profileReads, 1);
delete globalThis.privacyExportFixture;
console.log("W17 export handler: account profile keyed to authenticated subject, cross-scope request rejected (mock dependencies)");
console.log("W17 export handler: anonymous, foreign owner, inactive owner and viewer denied before data queries (mock dependencies)");
