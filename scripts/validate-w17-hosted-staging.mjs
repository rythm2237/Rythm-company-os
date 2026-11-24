// Start the candidate locally with the isolated Staging Supabase credentials.
// Only disposable, randomly named fixtures are created.
import assert from "node:assert/strict";
import { createHash, randomBytes, randomUUID } from "node:crypto";
import { createServerClient } from "@supabase/ssr";
import { createClient } from "@supabase/supabase-js";

const project = "viqjdgohtxqkrdgwtull";
const disposable = process.env.W17_DISPOSABLE_SUPABASE === "true";
const backend = disposable ? "http://127.0.0.1:54321" : `https://${project}.supabase.co`;
const app = "http://localhost:3000";
const bucket = "ai-workspace-private";
if (!disposable) assert.equal(process.env.W17_STAGING_REF, project);
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
  checked(await admin.from("customer_profiles").upsert({ user_id: fixture.user, full_name: "W17 Synthetic" }),
    "seed synthetic profile");
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
  fixture.account = account.id;
  checked(await admin.from("aiw_workspaces").insert({
    id: fixture.workspace, account_id: account.id, kind: "personal", name: "W17 personal", created_by: fixture.user,
  }), "create AI workspace");

  const wallet = checked(await admin.from("usage_wallets").insert({
    personal_account_id: fixture.account, payer_type: "personal",
  }).select("id").single(), "create synthetic wallet");
  fixture.wallet = wallet.id;
  fixture.usage = randomUUID();
  checked(await admin.from("ai_usage_requests").insert({
    id: fixture.usage, wallet_id: fixture.wallet, workspace_id: fixture.workspace, user_id: fixture.user,
    request_kind: "file_ingestion", routing_mode: "auto", prompt_profile: "normal", reserved_micros: 0,
    status: "settled", internal_result: fixture.body, idempotency_key: `${fixture.workspace}:file-${fixture.file}:file_ingestion`,
  }), "seed synthetic extraction result");

  fixture.path = `${fixture.workspace}/${fixture.file}/canary.txt`;
  checked(await admin.storage.from(bucket).upload(fixture.path, Buffer.from(fixture.body), { contentType: "text/plain" }), "upload synthetic file");
  checked(await admin.from("aiw_files").insert({
    id: fixture.file, workspace_id: fixture.workspace, filename: "canary.txt", mime_type: "text/plain",
    storage_path: fixture.path, byte_size: Buffer.byteLength(fixture.body),
    sha256: createHash("sha256").update(fixture.body).digest("hex"), ingestion_status: "ready",
    chunk_count: 1, created_by: fixture.user, usage_request_id: disposable ? null : fixture.usage,
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
  const { session } = checked(await auth.auth.signInWithPassword({ email, password }), "synthetic login");
  fixture.token = session.access_token;
  fixture.refreshToken = session.refresh_token;
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
  const usage = checked(await admin.from("ai_usage_requests").select("id,status,internal_result")
    .eq("id", fixture.usage).single(), "inspect extraction result and accounting record");
  assert.equal(usage.status, "settled");
  assert.equal(usage.internal_result, present ? fixture.body : null);
}

async function deleteFixture(fixture) {
  const steps = [
    ["privacy cases", () => admin.from("privacy_requests").delete().eq("requested_by_user_id", fixture.user)],
    ["usage request", () => admin.from("ai_usage_requests").delete().eq("wallet_id", fixture.wallet)],
    ["organization", () => admin.from("organizations").delete().eq("id", fixture.org)],
    ["personal workspace", () => admin.from("aiw_workspaces").delete().eq("id", fixture.workspace).eq("created_by", fixture.user)],
    ["identity", () => admin.auth.admin.deleteUser(fixture.user)],
  ];
  if (fixture.path) steps.unshift(["private object", () => admin.storage.from(bucket).remove([fixture.path])],
    ["file and chunks", () => admin.from("aiw_files").delete().eq("id", fixture.file).eq("workspace_id", fixture.workspace)]);
  for (const [label, clean] of steps) {
    if (label === "usage request" && !fixture.wallet) continue;
    checked(await clean(), label);
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
  const finalizeBeforeStorage = checked(await admin.rpc("aiw_erase_personal_file", {
    p_user_id: a.user, p_file_id: a.file, p_finalize: true,
  }).single(), "attempt finalize before removing binary");
  assert.equal(finalizeBeforeStorage.outcome, "object_present");
  checked(await admin.from("aiw_files").update({ ingestion_status: "processing" }).eq("id", a.file), "simulate in-flight ingestion");
  assert.equal((await request(a, deletePath + a.file, { method: "DELETE" })).status, 409);
  await assertFile(a, true);
  checked(await admin.from("aiw_files").update({ ingestion_status: "ready" }).eq("id", a.file), "complete synthetic ingestion");
  // Simulate a prior attempt that removed the binary before SQL finalization.
  checked(await admin.storage.from(bucket).remove([a.path]), "remove synthetic binary before retry");
  assert.equal((await request(a, deletePath + a.file, { method: "DELETE" })).status, 200);
  await assertFile(a, false);
  await assertFile(b, true);
  await deleteFixture(a);
  fixtures.splice(fixtures.indexOf(a), 1);
  const publicClient = createClient(backend, anon, { auth: { persistSession: false, autoRefreshToken: false } });
  const previousSession = await publicClient.auth.getUser(a.token);
  assert.ok(previousSession.error);
  assert.equal(previousSession.data.user, null);
  const previousRefresh = await publicClient.auth.refreshSession({ refresh_token: a.refreshToken });
  assert.ok(previousRefresh.error);
  const deletedProfile = checked(await admin.from("customer_profiles").select("user_id")
    .eq("user_id", a.user).maybeSingle(), "check deleted profile");
  assert.equal(deletedProfile, null);
  assert.equal((await request(b, "/api/privacy/export?scope=account")).status, 200);
  console.log("PASS W17: file retry, binary/chunks/extraction erasure, accounting preservation, synthetic identity deletion, token rejection, and second workspace preserved");
} finally {
  const failures = [];
  for (const fixture of fixtures) {
    try {
      await deleteFixture(fixture);
    } catch (error) {
      failures.push(error.message);
    }
  }
  if (failures.length) {
    console.error("Synthetic fixture cleanup failed", failures.join(", "));
    process.exitCode = 1;
  }
}
