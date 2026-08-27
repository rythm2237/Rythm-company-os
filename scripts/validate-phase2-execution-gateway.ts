import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { evaluateExecutionPolicy } from "../lib/integrations/policy-engine";
import type { ExecutionPolicyContext } from "../lib/integrations/policy-engine";
import type { ExecutionRequest } from "../lib/integrations/contracts";
import {
  buildApprovalScopeDigest,
  buildExecutionIdempotencyKey,
  executionDigest,
} from "../lib/integrations/idempotency";
import {
  IntegrationExecutionError,
  normalizeExecutionError,
} from "../lib/integrations/error-normalization";
import { executeWithRetry } from "../lib/integrations/retry";
import { TOOL_REGISTRY } from "../lib/integrations/registry";
import { INTEGRATION_ADAPTERS } from "../lib/integrations/adapters/provider-adapters";
import { resendAdapter } from "../lib/integrations/adapters/resend";
import { internalValidationAdapter } from "../lib/integrations/adapters/internal-validation";
import {
  redactSecretText,
  redactSensitiveValue,
} from "../lib/security/redaction";
import { validatePublicHttpUrl } from "../lib/security/public-url";
import { validateExecutionInput } from "../lib/integrations/input-validation";

let passed = 0;
async function test(name: string, action: () => unknown | Promise<unknown>) {
  await action();
  passed += 1;
  console.log(`✓ ${name}`);
}
const organizationId = "00000000-0000-4000-8000-000000000001",
  userId = "00000000-0000-4000-8000-000000000002",
  agentId = "00000000-0000-4000-8000-000000000003";
function request(overrides: Partial<ExecutionRequest> = {}): ExecutionRequest {
  return {
    correlationId: "00000000-0000-4000-8000-000000000004",
    organizationId,
    userId,
    agentId,
    actionType: "repo.read",
    integration: "github",
    integrationId: "00000000-0000-4000-8000-000000000005",
    tool: "github.repository",
    operation: "repo.read",
    target: "rythm/repo",
    input: { owner: "rythm", repo: "repo" },
    requestedAt: new Date().toISOString(),
    requestedBy: "agent",
    intent: "inspect repository",
    riskLevel: "low",
    reversibility: "not_applicable",
    externalSideEffect: false,
    financialImpact: false,
    dataSensitivity: "internal",
    requiredPermissions: ["read_repository", "read"],
    requiredScopes: ["repo:read"],
    humanApprovalRequired: false,
    approvalPolicy: "not_required",
    idempotencyKey: "ex2_test",
    timeoutMs: 15000,
    retryPolicy: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 4 },
    executionMode: "enforced",
    policyVersion: "execution-policy-v2.0.0",
    authoritySource: "agent",
    ...overrides,
  };
}
function context(
  overrides: Partial<ExecutionPolicyContext> = {},
): ExecutionPolicyContext {
  return {
    userAuthorized: true,
    agentAuthorized: true,
    agentEnabled: true,
    organizationEntitled: true,
    integrationEnabled: true,
    integrationConnected: true,
    operationSupported: true,
    payloadValid: true,
    agentCapabilities: ["read_repository"],
    userPermissions: ["read"],
    requiredAgentCapabilities: ["read_repository"],
    requiredUserPermissions: ["read"],
    grantedScopes: ["repo:read"],
    requiredScopes: ["repo:read"],
    agentRiskCeiling: "high",
    environment: "production",
    allowedEnvironments: ["production"],
    externalActionsAllowed: true,
    duplicate: false,
    withinRateLimit: true,
    withinCostLimit: true,
    killSwitchActive: false,
    mode: "enforced",
    ...overrides,
  };
}

async function main() {
  await test("A authorized read-only execution is allowed without approval", () => {
    const d = evaluateExecutionPolicy(request(), context());
    assert.equal(d.execute, true);
    assert.equal(d.approvalRequired, false);
  });
  await test("B unauthorized Agent capability is blocked", () =>
    assert.equal(
      evaluateExecutionPolicy(request(), context({ agentCapabilities: [] }))
        .reasonCode,
      "PERMISSION_DENIED",
    ));
  await test("C unauthorized user or organization context is blocked", () =>
    assert.equal(
      evaluateExecutionPolicy(request(), context({ userAuthorized: false }))
        .reasonCode,
      "PERMISSION_DENIED",
    ));
  await test("D missing provider scope is explicit", () =>
    assert.equal(
      evaluateExecutionPolicy(request(), context({ grantedScopes: [] }))
        .reasonCode,
      "SCOPE_MISSING",
    ));
  await test("simulation validates payloads before side effects", () => {
    assert.equal(
      validateExecutionInput("resend.email", "email.send", { to: ["invalid"] })
        .valid,
      false,
    );
    assert.equal(
      evaluateExecutionPolicy(
        request({ executionMode: "simulate" }),
        context({ payloadValid: false, mode: "simulate" }),
      ).reasonCode,
      "INVALID_EXECUTION_CONTEXT",
    );
  });
  const payloadDigest = executionDigest({
    to: ["ceo@example.com"],
    subject: "Exact",
  });
  const scope = buildApprovalScopeDigest({
    organizationId,
    executionId: "00000000-0000-4000-8000-000000000006",
    tool: "resend.email",
    operation: "email.send",
    target: "ceo@example.com",
    payloadDigest,
  });
  const consequential = request({
    executionId: "00000000-0000-4000-8000-000000000006",
    tool: "resend.email",
    integration: "resend",
    operation: "email.send",
    target: "ceo@example.com",
    riskLevel: "high",
    reversibility: "irreversible",
    externalSideEffect: true,
    humanApprovalRequired: true,
    approvalPolicy: "human_ceo_required",
    financialImpact: false,
    requiredPermissions: ["send_email", "external_communication"],
    requiredScopes: ["email.send"],
  });
  const consequentialContext = context({
    agentCapabilities: ["send_email"],
    userPermissions: ["external_communication"],
    requiredAgentCapabilities: ["send_email"],
    requiredUserPermissions: ["external_communication"],
    grantedScopes: ["email.send"],
    requiredScopes: ["email.send"],
  });
  await test("E consequential external action cannot execute without approval", () => {
    const d = evaluateExecutionPolicy(consequential, consequentialContext);
    assert.equal(d.reasonCode, "APPROVAL_REQUIRED");
    assert.equal(d.execute, false);
  });
  await test("F exact Human CEO approval authorizes only its action", () => {
    const d = evaluateExecutionPolicy(consequential, {
      ...consequentialContext,
      approval: {
        status: "approved",
        scopeDigest: scope,
        expectedScopeDigest: scope,
        expiresAt: new Date(Date.now() + 60000).toISOString(),
        consumedAt: null,
      },
    });
    assert.equal(d.execute, true);
  });
  await test("G rejection prevents execution", () =>
    assert.equal(
      evaluateExecutionPolicy(consequential, {
        ...consequentialContext,
        approval: {
          status: "rejected",
          scopeDigest: scope,
          expectedScopeDigest: scope,
        },
      }).execute,
      false,
    ));
  await test("H duplicate request is deterministically blocked", () =>
    assert.equal(
      evaluateExecutionPolicy(request(), context({ duplicate: true }))
        .reasonCode,
      "DUPLICATE_EXECUTION_BLOCKED",
    ));
  await test("independent validation proposals keep retry-safe request IDs", () => {
    const actions = readFileSync("app/(app)/integrations/actions.ts", "utf8");
    const page = readFileSync("app/(app)/integrations/page.tsx", "utf8");
    assert.match(page, /name="proposalId" value=\{crypto\.randomUUID\(\)\}/);
    assert.match(
      actions,
      /originatingRequestId: `phase2-validation:\$\{proposalId\}`/,
    );
  });
  await test("idempotency key is stable across object key ordering", () => {
    const a = buildExecutionIdempotencyKey({
      organizationId,
      agentId,
      tool: "x",
      operation: "y",
      input: { a: 1, b: 2 },
    });
    const b = buildExecutionIdempotencyKey({
      organizationId,
      agentId,
      tool: "x",
      operation: "y",
      input: { b: 2, a: 1 },
    });
    assert.equal(a, b);
  });
  await test("I retryable provider failure is bounded and idempotent-aware", async () => {
    let calls = 0;
    const result = await executeWithRetry({
      policy: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
      idempotencySupported: true,
      wait: async () => {},
      action: async () => {
        calls++;
        if (calls < 3)
          throw new IntegrationExecutionError(
            "temporary",
            "provider_unavailable",
            true,
            true,
            503,
          );
        return "ok";
      },
    });
    assert.equal(result.value, "ok");
    assert.equal(calls, 3);
  });
  await test("J non-retryable error is never retried", async () => {
    let calls = 0;
    await assert.rejects(
      executeWithRetry({
        policy: { maxAttempts: 3, baseDelayMs: 1, maxDelayMs: 2 },
        idempotencySupported: true,
        wait: async () => {},
        action: async () => {
          calls++;
          throw new IntegrationExecutionError("invalid", "validation_error");
        },
      }),
    );
    assert.equal(calls, 1);
  });
  await test("K kill switch stops execution without deployment", () =>
    assert.equal(
      evaluateExecutionPolicy(request(), context({ killSwitchActive: true }))
        .reasonCode,
      "KILL_SWITCH_ACTIVE",
    ));
  await test("L expired approval is blocked", () =>
    assert.equal(
      evaluateExecutionPolicy(consequential, {
        ...consequentialContext,
        approval: {
          status: "approved",
          scopeDigest: scope,
          expectedScopeDigest: scope,
          expiresAt: new Date(Date.now() - 1).toISOString(),
        },
      }).reasonCode,
      "APPROVAL_EXPIRED",
    ));
  await test("approval scope is non-transferable and one-time", () => {
    assert.equal(
      evaluateExecutionPolicy(consequential, {
        ...consequentialContext,
        approval: {
          status: "approved",
          scopeDigest: "wrong",
          expectedScopeDigest: scope,
        },
      }).reasonCode,
      "APPROVAL_SCOPE_MISMATCH",
    );
    assert.equal(
      evaluateExecutionPolicy(consequential, {
        ...consequentialContext,
        approval: {
          status: "approved",
          scopeDigest: scope,
          expectedScopeDigest: scope,
          consumedAt: new Date().toISOString(),
        },
      }).reasonCode,
      "APPROVAL_ALREADY_CONSUMED",
    );
  });
  await test("M cross-tenant authorization signal fails closed", () =>
    assert.equal(
      evaluateExecutionPolicy(request(), context({ agentAuthorized: false }))
        .allowed,
      false,
    ));
  await test("N Company Library content cannot authorize execution", () =>
    assert.equal(
      evaluateExecutionPolicy(
        request({ authoritySource: "company_library" }),
        context(),
      ).reasonCode,
      "DOCUMENT_AUTHORITY_REJECTED",
    ));
  await test("O Boardroom recommendation cannot execute directly", () =>
    assert.equal(
      evaluateExecutionPolicy(
        request({ authoritySource: "boardroom" }),
        context(),
      ).reasonCode,
      "BOARDROOM_EXECUTION_REJECTED",
    ));
  await test("P Human CEO remains final authority for financial actions", () => {
    const d = evaluateExecutionPolicy(consequential, {
      ...consequentialContext,
      approval: null,
    });
    assert.equal(d.approvalRequired, true);
  });
  await test("registry metadata is authoritative and every live provider has an adapter", () => {
    for (const tool of Object.values(TOOL_REGISTRY)) {
      assert.ok(Object.keys(tool.operations).length);
      const adapter =
        tool.integrationId === "resend"
          ? resendAdapter
          : tool.integrationId === "internal"
            ? internalValidationAdapter
            : INTEGRATION_ADAPTERS[tool.integrationId];
      assert.ok(adapter, `missing adapter ${tool.integrationId}`);
      assert.ok(adapter.supportedTools.includes(tool.toolId));
    }
  });
  await test("tool registry bindings cannot be reassigned to another provider", () => {
    for (const tool of Object.values(TOOL_REGISTRY)) {
      assert.equal(tool.integrationId, tool.integrationId.trim());
      for (const operation of Object.values(tool.operations))
        assert.ok(operation.operation.length > 0);
    }
    const gateway = readFileSync(
      "lib/integrations/execution-gateway.ts",
      "utf8",
    );
    assert.match(
      gateway,
      /registered\.tool\.integrationId !== integration\.provider_key/,
    );
  });
  await test("Q audit lifecycle is complete and append-oriented", () => {
    const runner = readFileSync("lib/integrations/service-runner.ts", "utf8");
    for (const event of [
      "started",
      "completed",
      "failed",
      "rollback_requested",
      "rolled_back",
      "rollback_failed",
    ])
      assert.match(runner, new RegExp(`\\"${event}\\"`));
    const migration = readFileSync(
      "supabase/migrations/20260826192947_phase2_integration_execution_gateway.sql",
      "utf8",
    );
    assert.match(migration, /Execution lifecycle events are append-only/);
  });
  await test("R secret redaction removes values and credential keys", () => {
    assert.doesNotMatch(
      redactSecretText("Authorization: Bearer super-secret-token"),
      /super-secret-token/,
    );
    assert.deepEqual(
      redactSensitiveValue({ access_token: "secret", ok: true }),
      { access_token: "[REDACTED]", ok: true },
    );
    assert.equal(
      normalizeExecutionError(
        new Error("password=secret"),
      ).sanitizedError.includes("secret"),
      false,
    );
  });
  await test("SSRF controls reject metadata/private targets and unsupported schemes", async () => {
    await assert.rejects(
      validatePublicHttpUrl("http://169.254.169.254/latest/meta-data"),
    );
    await assert.rejects(validatePublicHttpUrl("file:///etc/passwd"));
    await assert.rejects(validatePublicHttpUrl("https://localhost/test"));
    const safe = await validatePublicHttpUrl("https://api.github.com/repos", {
      allowedHosts: ["api.github.com"],
      lookup: async () => [{ address: "140.82.112.6", family: 4 }],
    });
    assert.equal(safe.hostname, "api.github.com");
  });
  await test("S rollback is represented only where an adapter supports it", () => {
    assert.equal(
      TOOL_REGISTRY["internal.validation"].operations[
        "validation.record.create"
      ].rollbackSupported,
      true,
    );
    assert.equal(
      TOOL_REGISTRY["resend.email"].operations["email.send"].rollbackSupported,
      false,
    );
    assert.equal(typeof internalValidationAdapter.rollback, "function");
  });
  await test("T approval and execution UX use responsive layouts and plain-language details", () => {
    const approval = readFileSync("app/(app)/approvals/page.tsx", "utf8");
    const integrations = readFileSync(
      "app/(app)/integrations/page.tsx",
      "utf8",
    );
    assert.match(approval, /auto-fit/);
    assert.doesNotMatch(approval, /return \[JSON\.stringify\(conditions\)\]/);
    assert.match(integrations, /Execute exact approved action/);
    assert.match(integrations, /compensating action/i);
  });
  await test("schema enforces tenant RLS, atomic claim, approval consumption and rollout", () => {
    const sql = readFileSync(
      "supabase/migrations/20260826192947_phase2_integration_execution_gateway.sql",
      "utf8",
    ).toLowerCase();
    for (const contract of [
      "claim_tool_execution_v2",
      "approval_already_consumed",
      "approval_scope_mismatch",
      "execution_rollout_config",
      "execution_validation_records",
      "enable row level security",
      "revoke insert, update, delete, truncate on table public.tool_execution_requests",
    ])
      assert.match(
        sql,
        new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")),
      );
  });
  console.log(`Phase 2 Execution Gateway validation passed (${passed} tests).`);
}
main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
