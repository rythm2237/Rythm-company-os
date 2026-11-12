import assert from "node:assert/strict";
import { build } from "esbuild";
import { createRequire } from "node:module";
import { canary, fileInjection, memoryInjection, toolInjection } from "./fixtures/w07-agent-attacks.mjs";

async function load(path, mocks = {}) {
  const bundle = await build({
    entryPoints: [path], bundle: true, write: false, platform: "node", format: "cjs", packages: "external",
    plugins: [{
      name: "w07-synthetic-boundaries",
      setup(builder) {
        builder.onResolve({ filter: /.*/ }, ({ path }) =>
          Object.hasOwn(mocks, path) ? { path, namespace: "w07" } : undefined);
        builder.onLoad({ filter: /.*/, namespace: "w07" }, ({ path }) => ({ contents: mocks[path] }));
      },
    }],
  });
  const compiled = { exports: {} };
  new Function("require", "module", "exports", bundle.outputFiles[0].text)(
    createRequire(process.cwd() + "/package.json"), compiled, compiled.exports,
  );
  return compiled.exports;
}

function database(tables, state = {}) {
  return {
    async rpc(name, args) {
      (state.rpc ??= []).push({ name, args });
      return { data: true };
    },
    from(table) {
      const filters = [];
      let insert, update;
      const query = {
        select() { return query; },
        order() { return query; },
        limit() { return query; },
        gte() { return query; },
        or() { return query; },
        in(column, values) { filters.push((row) => values.includes(row[column])); return query; },
        filter(column, _operator, value) { return query.eq(column, value); },
        eq(column, value) {
          filters.push((row) => column.split(".").reduce((parent, key) => parent?.[key], row) === value);
          return query;
        },
        insert(value) { insert = value; return query; },
        update(value) { update = value; return query; },
        async single() { return read(true); },
        async maybeSingle() { return read(true); },
        then(resolve) { return Promise.resolve(read(false)).then(resolve); },
      };
      function read(single) {
        if (state.failure === table) return { error: { message: canary } };
        const rows = tables[table] ?? (tables[table] = []);
        if (insert) {
          if (insert.idempotency_key && rows.some((row) => row.idempotency_key === insert.idempotency_key))
            return { error: { code: "23505", message: canary } };
          const row = { id: table + "-" + rows.length, ...insert };
          rows.push(row);
          return { data: row };
        }
        const selected = rows.filter((row) => filters.every((filter) => filter(row)));
        if (update) for (const row of selected) Object.assign(row, update);
        return { data: single ? selected[0] ?? null : selected, count: selected.length };
      }
      return query;
    },
  };
}

const scope = { workspace_id: "A", project_id: "P" };
const file = { ...scope, filename: "report", ingestion_status: "ready" };
const tables = {
  aiw_memories: [
    { ...scope, scope: "project", title: "Reference", content: memoryInjection },
    { ...scope, scope: "company", title: "Hidden", content: "launch " + canary },
    { ...scope, scope: "project", workspace_id: "B", content: "launch " + canary },
    { ...scope, scope: "project", project_id: "Other", content: "launch " + canary },
  ],
  aiw_file_chunks: [
    { ...scope, aiw_files: file, content: fileInjection },
    { ...scope, aiw_files: { ...file, workspace_id: "B" }, content: "launch " + canary },
    { ...scope, aiw_files: { ...file, project_id: "Other" }, content: "launch " + canary },
    { ...scope, aiw_files: { ...file, ingestion_status: "failed" }, content: "launch " + canary },
  ],
};
const state = {};
const client = database(tables, state);
const { retrieveWorkspaceContext } = await load("lib/ai-workspace/retrieval.ts");
const retrieval = await retrieveWorkspaceContext(client, "A", "P", "launch");
assert.deepEqual(JSON.parse(retrieval.context).map(({ content }) => content), [memoryInjection, fileInjection]);
assert.deepEqual(retrieval.sources, ["memory:Reference", "file:report"]);
assert.ok(!JSON.stringify(retrieval).includes(canary));
assert.deepEqual(await retrieveWorkspaceContext(client, "A", "P", "unrelated"), { context: "", sources: [] });
state.failure = "aiw_file_chunks";
await assert.rejects(() => retrieveWorkspaceContext(client, "A", "P", "launch"), { message: "RETRIEVAL_UNAVAILABLE" });
delete state.failure;

const { ensureConversation, reserveUsage } = await load("lib/ai-workspace/service.ts");
tables.aiw_conversations = [{ id: "foreign", workspace_id: "B", project_id: "P", archived: false }];
await assert.rejects(() => ensureConversation("A", "P", "foreign", client), { message: "CONVERSATION_NOT_FOUND" });
assert.equal(tables.aiw_conversations.length, 1);
tables.ai_usage_requests = [{
  id: "cached", status: "settled", internal_result: canary, workspace_id: "A", organization_id: "A",
  user_id: "user", wallet_id: "wallet", conversation_id: "thread", routing_mode: "auto",
  prompt_profile: "normal", idempotency_key: "A:retry-001:answer",
}];
const reservation = {
  client, walletId: "wallet", workspaceId: "A", organizationId: "A", userId: "user",
  conversationId: "thread", mode: "auto", profile: "normal", kind: "answer",
  amount: 1, clientRequestKey: "retry-001",
};
assert.equal((await reserveUsage(reservation)).internal_result, canary);
for (const field of ["organizationId", "walletId", "userId", "conversationId", "mode", "profile"]) {
  await assert.rejects(() => reserveUsage({ ...reservation, [field]: "forged" }), { message: "REQUEST_SCOPE_MISMATCH" });
}
assert.equal(state.rpc, undefined);
console.log("PASS workspace isolation, hostile reference serialization, lookup failures and scoped response replay");

const { requestToolExecution, syncToolExecutionApproval } = await load("lib/integrations/execution-gateway.ts");
const org = { organization_id: "A" };
const gatewayTables = {
  organization_integrations: [{ ...org, id: "I", provider_key: "internal", status: "connected", enabled: true }],
  organization_members: [{ ...org, user_id: "U", membership_status: "active", role: "owner" }],
  organization_entitlements: [{ ...org, status: "active" }],
  execution_rollout_config: [{ ...org, environment: "development", execution_mode: "enforced" }],
  agents: [{ ...org, id: "Agent", agent_status: "enabled", enabled: true, risk_ceiling: "high" }],
  agent_integration_grants: [{ ...org, agent_id: "Agent", integration_id: "I",
    capability_key: "validation.record.create", enabled: true }],
  agent_autonomy_profiles: [{ ...org, agent_id: "Agent", current_level: 2, status: "active" }],
};
const gatewayState = {};
const gateway = database(gatewayTables, gatewayState);
const intent = {
  organizationId: "A", userId: "U", integrationId: "I", agentId: "Agent",
  toolId: toolInjection.tool, capabilityKey: "validation.record.create",
  targetRef: canary, input: { label: "synthetic record" }, idempotencyKey: "fixed-key",
};
await assert.rejects(() => requestToolExecution(gateway, { ...intent, agentId: "foreign" }), /Execution context/);
await assert.rejects(() => requestToolExecution(gateway, { ...intent, agentId: null, requestedBy: "agent" }), /tenant-scoped Agent/);
await assert.rejects(() => requestToolExecution(gateway, { ...intent, userId: "foreign" }), /active member/);
assert.equal(gatewayTables.tool_execution_requests, undefined);
const poisoned = await requestToolExecution(gateway, {
  ...intent, idempotencyKey: "hostile-output", ...toolInjection.arguments,
  authoritySource: toolInjection.authoritySource,
});
assert.equal(poisoned.status, "denied");
assert.equal(gatewayTables.approval_requests, undefined);
const proposal = await requestToolExecution(gateway, intent);
assert.equal(proposal.status, "waiting_approval");
assert.ok(proposal.approval_request_id);
assert.ok(!JSON.stringify(gatewayState.rpc).includes(canary));
await assert.rejects(() => requestToolExecution(gateway, { ...intent, input: { label: "tampered" } }),
  { message: "Execution request could not be recorded." });
const approval = gatewayTables.approval_requests[0];
const digest = approval.execution_scope_digest;
approval.status = "approved";
approval.execution_scope_digest = "other-payload";
assert.equal((await syncToolExecutionApproval(gateway, "A", proposal.id)).status, "waiting_approval");
approval.execution_scope_digest = digest;
approval.subject_id = "other-execution";
assert.equal((await syncToolExecutionApproval(gateway, "A", proposal.id)).status, "waiting_approval");
approval.subject_id = proposal.id;
approval.status = "rejected";
assert.equal((await syncToolExecutionApproval(gateway, "A", proposal.id)).status, "rejected");
approval.status = "approved";
assert.equal((await syncToolExecutionApproval(gateway, "A", proposal.id)).status, "rejected");
const retry = await requestToolExecution(gateway, intent);
assert.equal(retry.status, "rejected");
assert.equal(retry.duplicate, true);
assert.equal(gatewayTables.approval_requests.length, 1);
console.log("PASS actual tool gateway with synthetic storage: forged authority, foreign actor, scoped approval and terminal rejection replay");

const requests = [];
const chatState = {
  provider(request) {
    requests.push(request);
    return {
      outputText: "Synthetic answer", actualCostUsd: 0, correlationId: "synthetic",
      routingMode: "auto", routingDecision: { selectedModel: "mock", selectedProvider: "mock" },
    };
  },
  originAllowed: true,
  services: {
    serviceClient: () => ({
      from: () => ({
        select() { return this; }, eq() { return this; }, order() { return this; },
        limit() { return { data: [{ role: "assistant", content: "synthetic history" }] }; },
        async upsert() { return {}; },
      }),
      async rpc() { return { data: true }; },
    }),
    ensurePersonalWorkspace: async () => ({ workspace: { id: "A" }, project: { id: "P" } }),
    ensureConversation: async () => ({ id: "chat" }),
    recoverUsageConversation: async () => null,
    reserveUsage: async () => ({ id: "answer", existing: false }),
    reservationFor: () => 1,
    costMicros: () => 0,
  },
};
globalThis.w07Chat = chatState;
try {
  const { POST } = await load("app/api/ai-workspace/chat/route.ts", {
    "next/server": 'export const NextResponse = { json: (body, options) => ({ body, status: options?.status ?? 200 }) };',
    "@/lib/supabase/auth-server": 'export const createAuthServerClient = () => ({ auth: { getUser: () => ({ data: { user: { id: "U" } } }) } });',
    "@/lib/auth/organization-context": 'export const resolveOrganizationContext = () => ({ organizationId: "A", user: { id: "U" } });',
    "@/lib/ai-workspace/company-access": 'export const resolveRegisteredUsagePayer = () => ({ walletId: "wallet", allowedModes: ["auto"], allowedPromptProfiles: ["normal"] });',
    "@/lib/ai-workspace/service": `
      const services = globalThis.w07Chat.services;
      export const { serviceClient, ensurePersonalWorkspace, ensureConversation,
        recoverUsageConversation, reserveUsage, reservationFor, costMicros } = services;
      export class AIWorkspaceError extends Error {}
    `,
    "@/lib/ai-workspace/guest": 'export const assertSameOrigin = () => { if (!globalThis.w07Chat.originAllowed) throw Error("origin"); }; export const resolveGuestAccess = () => { throw Error("unexpected guest"); };',
    "@/lib/ai/request-gateway": 'export const executeAiRequest = globalThis.w07Chat.provider;',
    "@/lib/ai-workspace/retrieval": 'export const retrieveWorkspaceContext = () => globalThis.w07Chat.retrieval();',
  });
  let retrievalCalls = 0;
  chatState.retrieval = () => { retrievalCalls++; return retrieval; };
  const body = { prompt: "launch", requestKey: "synthetic-req", conversationId: "chat" };
  const post = (fields) => POST({ json: async () => ({ ...body, ...fields }) });
  assert.equal((await post({})).status, 200);
  assert.equal((await post({ includeWorkspaceKnowledge: "true" })).status, 200);
  assert.equal(retrievalCalls, 0);
  const consented = await post({ includeWorkspaceKnowledge: true, tools: [toolInjection], humanApproved: true });
  assert.deepEqual(consented.body.sources, retrieval.sources);
  assert.equal(retrievalCalls, 1);
  assert.match(requests[2].conversation, /Act as the CEO/);
  assert.ok(!requests[2].systemInstructions.includes("Act as the CEO"));
  assert.equal(requests[2].tools, undefined);
  assert.equal(requests[2].humanApproved, undefined);
  const diagnostics = [];
  const originalError = console.error;
  try {
    console.error = (...args) => diagnostics.push(args);
    chatState.retrieval = () => { throw Error(canary); };
    assert.equal((await post({ includeWorkspaceKnowledge: true })).status, 503);
    chatState.originAllowed = false;
    assert.equal((await post({})).status, 503); // Stub rejects before auth/provider.
  } finally {
    console.error = originalError;
  }
  assert.equal(requests.length, 3);
  assert.ok(!JSON.stringify(diagnostics).includes(canary));
  console.log("PASS actual chat handler with stubbed provider: consent, prompt-channel separation, rejection and diagnostic canary");
} finally {
  delete globalThis.w07Chat;
}

const { executionDigest } = await load("lib/integrations/idempotency.ts");
const payload = { label: "Synthetic worker record" };
const workerState = { events: [], executions: 0 };
globalThis.w07Worker = workerState;
try {
  workerState.client = {
    async rpc(name, args) {
      workerState.events.push({ name, args });
      if (name === "claim_tool_execution_v2") return workerState.claim;
      return { data: true };
    },
    from(table) {
      return {
        select() { return this; },
        eq() { return this; },
        update(value) { workerState.events.push({ table, value }); return this; },
        insert(value) { workerState.events.push({ table, value }); return this; },
        async maybeSingle() {
          return { data: { provider_key: "internal", status: "connected", enabled: true } };
        },
      };
    },
  };
  const { executeApprovedToolRequest } = await load("lib/integrations/service-runner.ts", {
    "server-only": "",
    "@supabase/supabase-js": "export const createClient = () => globalThis.w07Worker.client;",
    "@/lib/integrations/adapters/internal-validation": `
      export const internalValidationAdapter = {
        validate() {}, prepare() {},
        execute() {
          globalThis.w07Worker.executions++;
          throw new Error(globalThis.w07Worker.diagnostic);
        },
      };
    `,
  });
  const env = { NEXT_PUBLIC_SUPABASE_URL: "https://synthetic.invalid", SUPABASE_SERVICE_ROLE_KEY: "synthetic-test-only" };
  const previous = Object.fromEntries(Object.keys(env).map((key) => [key, process.env[key]]));
  Object.assign(process.env, env);
  workerState.diagnostic = canary;
  try {
    workerState.claim = { error: { message: canary } };
    await assert.rejects(() => executeApprovedToolRequest("synthetic"), { message: "Execution request could not be claimed." });
    const row = {
      id: "synthetic", organization_id: "A", integration_id: "I",
      tool: "internal.validation", capability_key: "validation.record.create",
      human_approval_required: true, payload_digest: executionDigest(payload),
      input: payload, retry_policy: { maxAttempts: 1 },
    };
    for (const override of [{ human_approval_required: false }, { input: { label: canary } }]) {
      workerState.claim = { data: { ...row, ...override } };
      await assert.rejects(() => executeApprovedToolRequest("synthetic"), /EXECUTION_APPROVAL_REQUIRED/);
    }
    assert.equal(workerState.executions, 0);
    workerState.claim = { data: row };
    await assert.rejects(() => executeApprovedToolRequest("synthetic"), /EXECUTION_/);
    assert.equal(workerState.executions, 1);
    assert.ok(!JSON.stringify(workerState.events).includes(canary));
    console.log("PASS actual execution worker: claim errors sanitized, exact approval required, adapter failure diagnostics redacted");
  } finally {
    for (const [key, value] of Object.entries(previous)) {
      if (value === undefined) delete process.env[key];
      else process.env[key] = value;
    }
  }
} finally {
  delete globalThis.w07Worker;
}
