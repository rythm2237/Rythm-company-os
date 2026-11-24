// Start the candidate locally with the isolated Staging Supabase credentials.
// Only disposable, randomly named fixtures are created.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const project = "viqjdgohtxqkrdgwtull";
const backend = `https://${project}.supabase.co`;
const app = "http://localhost:3000";
const bucket = "ai-workspace-private";
assert.equal(process.env.W17_STAGING_REF, project);
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, backend);
assert.equal(process.env.RYTHM_ENV, "staging");
assert.equal(process.env.RYTHM_AGENT_EXECUTION_ENABLED, "false");
assert.equal(process.env.RYTHM_EXTERNAL_ACTIONS_ENABLED, "false");
assert.notEqual(process.env.VERCEL_ENV, "production");
const anon = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
assert.ok(anon && key, "Staging keys must be configured server-side");

const admin = createClient(backend, key, { auth: { persistSession: false, autoRefreshToken: false } });
const fixtures = [];

function checked(result, operation) {
  if (result.error) throw new Error(`${operation} failed (${result.error.code ?? result.error.status ?? "unknown"})`);
  return result.data;
}

async function seed() {
  const suffix = randomUUID();
  const email = `w17-${suffix}@example.test`;
  const password = randomBytes(32).toString("base64url") + "Aa1!";
  const { user } = checked(await admin.auth.admin.createUser({ email, password, email_confirm: true }), "create synthetic identity");
  const fixture = { user: user.id, org: randomUUID(), workspace: randomUUID(), file: randomUUID(), body: "w17-file-" + suffix };
  fixtures.push(fixture);
  checked(await admin.from("organizations").insert({
    id: fixture.org, name: "W17 " + suffix, slug: "w17-" + suffix, owner_user_id: fixture.user, status: "draft",
  }), "create synthetic organization");
  checked(await admin.from("organization_members").insert({
    organization_id: fixture.org, user_id: fixture.user, role: "owner", membership_status: "active",
  }), "register synthetic owner");
  // File routes provision credits for an unconfigured account. Preconfigure the
  // synthetic plan so these privacy checks create no immutable ledger entries.
  const account = checked(await admin.from("aiw_accounts").insert({
    user_id: fixture.user, kind: "personal", plan_code: "free_trial", plan_status: "active",
  })
    .select("id").single(), "create AI account");
  checked(await admin.from("aiw_workspaces").insert({
    id: fixture.workspace, account_id: account.id, kind: "personal", name: "W17 personal", created_by: fixture.user,
  }), "create AI workspace");

  fixture.path = `${fixture.workspace}/${fixture.file}/canary.txt`;
  checked(await admin.storage.from(bucket).upload(fixture.path, Buffer.from(fixture.body), { contentType: "text/plain" }), "upload synthetic file");
  checked(await admin.from("aiw_files").insert({
    id: fixture.file, workspace_id: fixture.workspace, filename: "canary.txt", mime_type: "text/plain",
    storage_path: fixture.path, byte_size: Buffer.byteLength(fixture.body),
    sha256: createHash("sha256").update(fixture.body).digest("hex"), ingestion_status: "ready",
    chunk_count: 1, created_by: fixture.user,
  }), "register file metadata");
  checked(await admin.from("aiw_file_chunks").insert({
    workspace_id: fixture.workspace, file_id: fixture.file, chunk_index: 0, content: fixture.body,
  }), "register derived chunk");

  const cookies = new Map();
  const auth = createServerClient(backend, anon, {
    cookies: {
      getAll: () => [...cookies].map(([name, value]) => ({ name, value })),
      setAll: entries => entries.forEach(({ name, value }) => cookies.set(name, value)),
    },
  });
  checked(await auth.auth.signInWithPassword({ email, password }), "synthetic login");
  fixture.cookie = [...cookies].map(([name, value]) => `${name}=${encodeURIComponent(value)}`).join("; ");
  return fixture;
}

async function request(fixture, path, init = {}) {
  return fetch(app + path, {
    ...init, redirect: "manual", signal: AbortSignal.timeout(15000),
    headers: { cookie: fixture.cookie, origin: app, ...init.headers },
  });
}

async function assertFile(fixture, present) {
  for (const [relation, column] of [["aiw_files", "id"], ["aiw_file_chunks", "file_id"]]) {
    const data = checked(await admin.from(relation).select("id").eq(column, fixture.file)
      .eq("workspace_id", fixture.workspace), "inspect " + relation);
    assert.equal(data.length, present ? 1 : 0, relation);
  }
  const objects = checked(await admin.storage.from(bucket).list(`${fixture.workspace}/${fixture.file}`), "inspect private Storage folder");
  assert.equal(objects.some(object => object.name === "canary.txt"), present, "binary presence");
  if (present) {
    const blob = checked(await admin.storage.from(bucket).download(fixture.path), "download synthetic binary");
    assert.equal(await blob.text(), fixture.body);
  }
}

try {
  const a = await seed();
  const b = await seed();
  const profile = await request(a, "/api/privacy/export?scope=account");
  assert.equal(profile.status, 200);
  assert.equal((await profile.json()).account.id, a.user);
  assert.match(profile.headers.get("cache-control") ?? "", /no-store/);

  for (const requestType of ["access", "export", "deletion"]) {
    const receipt = await request(a, "/api/privacy/requests", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ requestType, scope: "account" }),
    });
    assert.equal(receipt.status, 201);
    assert.equal((await receipt.json()).request.status, "received");
  }
  const foreign = await request(a, `/api/privacy/export?organizationId=${b.org}`);
  assert.equal(foreign.status, 403);
  assert.deepEqual(await foreign.json(), { error: "FORBIDDEN" });

  await assertFile(a, true);
  await assertFile(b, true);
  const deletePath = "/api/ai-workspace/files?id=";
  assert.equal((await request(a, deletePath + b.file, { method: "DELETE" })).status, 404);
  assert.equal((await request(a, deletePath + a.file, { method: "DELETE" })).status, 200);
  await assertFile(a, false);
  await assertFile(b, true);
  console.log("PASS W17 hosted fixture: privacy intake, profile export, foreign export denial, private file and derived chunk removal, and second workspace preserved");
} finally {
  const failures = [];
  for (const fixture of fixtures) {
    const steps = [
      ["privacy cases", () => admin.from("privacy_requests").delete().eq("requested_by_user_id", fixture.user)],
      ["organization", () => admin.from("organizations").delete().eq("id", fixture.org)],
      ["personal workspace", () => admin.from("aiw_workspaces").delete().eq("id", fixture.workspace).eq("created_by", fixture.user)],
      ["identity", () => admin.auth.admin.deleteUser(fixture.user)],
    ];
    if (fixture.path) steps.unshift(["private object", () => admin.storage.from(bucket).remove([fixture.path])]);
    for (const [label, clean] of steps) {
      try {
        checked(await clean(), label);
      } catch (error) {
        failures.push(error.message);
      }
    }
  }
  if (failures.length) {
    console.error("Synthetic fixture cleanup failed", failures.join(", "));
    process.exitCode = 1;
  }
}
