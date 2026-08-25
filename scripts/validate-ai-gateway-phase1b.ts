import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeAiRequest } from "../lib/ai/request-gateway";
import { resolveRoutingRollout, type RoutingMode } from "../lib/ai/routing-rollout";
import { telemetryRow, type AiRoutingTelemetryRecord } from "../lib/ai/routing-telemetry";
import type { AiGatewayRequest } from "../lib/ai/gateway-contracts";
import type { RoutingDecision } from "../lib/ai/routing-types";
import type { RunAgentInput } from "../lib/ai/agent-provider";

let passed = 0;
async function test(name: string, action: () => void | Promise<void>) {
  await action();
  passed += 1;
  console.log(`✓ ${name}`);
}

const organizationId = "00000000-0000-4000-8000-000000000001";
const userId = "00000000-0000-4000-8000-000000000002";
const agentId = "00000000-0000-4000-8000-000000000003";

function decision(overrides: Partial<RoutingDecision> = {}): RoutingDecision {
  return {
    requestId: "00000000-0000-4000-8000-000000000004",
    language: "en", responseLanguage: "en", intent: "information", taskType: "read", operation: "read",
    complexity: "low", risk: "low", reasoningRequirement: "low", requiredTools: [], requiredCapabilities: [],
    recommendedTier: "luna", confidence: 0.95, allowEscalation: true, classificationSource: "deterministic",
    selectedTier: "luna", selectedProvider: "openai", selectedModel: "gpt-5.6-luna", reasoningLevel: "low",
    estimatedCostUsd: 0.001, escalationIndex: 0, routingVersion: "adaptive-v1",
    ...overrides,
  };
}

function request(overrides: Partial<AiGatewayRequest> = {}): AiGatewayRequest {
  return {
    organizationId,
    correlationId: "00000000-0000-4000-8000-000000000004",
    actor: { type: "user", userId, agentId },
    feature: "agent.console",
    prompt: "Summarize the status.",
    systemInstructions: "Remain advisory.",
    ...overrides,
  };
}

const rollout = (mode: RoutingMode) => async () => ({ mode, source: "organization" as const, policyVersion: "pilot-v1", killSwitchActive: false, reasonCodes: ["organization_routing_mode"] });

function executionHarness(actualDecision = decision(), executionPolicy: "adaptive" | "legacy_fallback" | "fixed_model" = "adaptive") {
  let calls = 0;
  let authoritative: RoutingDecision | undefined;
  return {
    execute: async (input: RunAgentInput) => {
      calls += 1;
      authoritative = input.authoritativeDecision;
      const selected = input.authoritativeDecision ?? actualDecision;
      await input.onRoutingDecision?.(selected);
      return {
        outputText: "done",
        actualModel: selected.selectedModel,
        usage: { inputTokens: 100, cachedTokens: 20, outputTokens: 25, reasoningTokens: 5 },
        providerLatencyMs: 12,
        routingDecision: selected,
        fallbackUsed: executionPolicy === "legacy_fallback",
        executionPolicy,
      };
    },
    calls: () => calls,
    authoritative: () => authoritative,
  };
}

function telemetryHarness() {
  const records: AiRoutingTelemetryRecord[] = [];
  return { writer: async (record: AiRoutingTelemetryRecord) => { records.push(record); }, records };
}

async function main() {
process.env.VERCEL_ENV = "production";
process.env.OPENAI_API_KEY = "phase-1b-test-key";
delete process.env.RYTHM_AI_ROUTING_KILL_SWITCH;

await test("mode resolution supports off, shadow and enforced with organization precedence", () => {
  for (const mode of ["off", "shadow", "enforced"] as RoutingMode[]) {
    const resolved = resolveRoutingRollout({ environment: "production", organizationId, rows: [
      { scope: "global", environment: null, organization_id: null, routing_mode: "off", kill_switch: false, policy_version: "global-v1" },
      { scope: "environment", environment: "production", organization_id: null, routing_mode: "shadow", kill_switch: false, policy_version: "env-v1" },
      { scope: "organization", environment: null, organization_id: organizationId, routing_mode: mode, kill_switch: false, policy_version: "org-v1" },
    ] });
    assert.equal(resolved.mode, mode);
    assert.equal(resolved.source, "organization");
  }
});

await test("missing and malformed rollout configuration fail safely to off", () => {
  assert.equal(resolveRoutingRollout({ environment: "production", organizationId, rows: [] }).mode, "off");
  const invalid = resolveRoutingRollout({ environment: "production", organizationId, rows: [
    { scope: "organization", environment: null, organization_id: organizationId, routing_mode: "surprise", kill_switch: false, policy_version: "x" },
  ] });
  assert.equal(invalid.mode, "off");
  assert.equal(invalid.source, "invalid");
});

await test("database and environment kill switches deterministically force off", () => {
  const row = { scope: "organization", environment: null, organization_id: organizationId, routing_mode: "enforced", kill_switch: true, policy_version: "org-v1" };
  assert.equal(resolveRoutingRollout({ environment: "production", organizationId, rows: [row] }).mode, "off");
  assert.equal(resolveRoutingRollout({ environment: "production", organizationId, rows: [{ ...row, kill_switch: false }], environmentKillSwitch: "true" }).mode, "off");
  assert.equal(resolveRoutingRollout({ environment: "production", organizationId, rows: [{ ...row, kill_switch: false }], environmentKillSwitch: "malformed" }).mode, "off");
});

await test("off keeps existing execution authoritative and does not evaluate a shadow proposal", async () => {
  const executor = executionHarness(decision({ selectedTier: "terra", selectedModel: "gpt-5.6-terra" }));
  const telemetry = telemetryHarness();
  let evaluations = 0;
  const response = await executeAiRequest(request(), {
    loadRollout: rollout("off"),
    evaluateRouting: (input) => { evaluations += 1; return decision({ requestId: input.requestId }); },
    execute: executor.execute,
    telemetryWriter: telemetry.writer,
  });
  assert.equal(evaluations, 0);
  assert.equal(executor.calls(), 1);
  assert.equal(executor.authoritative(), undefined);
  assert.equal(response.routingDecision.selectedTier, "terra");
  assert.equal(response.proposedRoutingDecision, null);
});

await test("shadow records proposed versus actual while executing the provider exactly once", async () => {
  const proposed = decision({ selectedTier: "luna", selectedModel: "gpt-5.6-luna" });
  const actual = decision({ selectedTier: "terra", selectedModel: "gpt-5.6-terra", estimatedCostUsd: 0.01 });
  const executor = executionHarness(actual);
  const telemetry = telemetryHarness();
  let evaluations = 0;
  const response = await executeAiRequest(request(), {
    loadRollout: rollout("shadow"),
    evaluateRouting: () => { evaluations += 1; return proposed; },
    execute: executor.execute,
    telemetryWriter: telemetry.writer,
  });
  assert.equal(evaluations, 1);
  assert.equal(executor.calls(), 1);
  assert.equal(executor.authoritative(), undefined);
  assert.equal(response.routingDecision.selectedTier, "terra");
  assert.equal(response.proposedRoutingDecision?.selectedTier, "luna");
  assert.equal(telemetry.records.length, 1);
  assert.equal(telemetry.records[0].proposed?.selectedModel, "gpt-5.6-luna");
  assert.equal(telemetry.records[0].actual?.selectedModel, "gpt-5.6-terra");
});

await test("controlled enforced makes the eligible router decision authoritative", async () => {
  const proposed = decision({ selectedTier: "sol", selectedModel: "gpt-5.6-sol" });
  const executor = executionHarness();
  const response = await executeAiRequest(request(), {
    loadRollout: rollout("enforced"), evaluateRouting: () => proposed, execute: executor.execute, telemetryWriter: async () => {},
  });
  assert.equal(executor.calls(), 1);
  assert.equal(executor.authoritative(), proposed);
  assert.equal(response.routingDecision.selectedModel, "gpt-5.6-sol");
});

await test("enforced rejects Anthropic and Google before provider execution", async () => {
  for (const provider of ["anthropic", "google"] as const) {
    const executor = executionHarness();
    const telemetry = telemetryHarness();
    await assert.rejects(executeAiRequest(request(), {
      loadRollout: rollout("enforced"),
      evaluateRouting: () => decision({ selectedProvider: provider, selectedModel: `${provider}-disabled` }),
      execute: executor.execute,
      telemetryWriter: telemetry.writer,
    }), /not eligible/);
    assert.equal(executor.calls(), 0);
    assert.equal(telemetry.records[0].success, false);
    assert.ok(telemetry.records[0].reasonCodes.includes("provider_not_production_approved"));
  }
});

await test("shadow never executes an ineligible proposal and keeps the OpenAI baseline authoritative", async () => {
  const executor = executionHarness(decision({ selectedProvider: "openai", selectedModel: "gpt-5.6-terra", selectedTier: "terra" }));
  const telemetry = telemetryHarness();
  const response = await executeAiRequest(request(), {
    loadRollout: rollout("shadow"),
    evaluateRouting: () => decision({ selectedProvider: "anthropic", selectedModel: "claude-disabled" }),
    execute: executor.execute,
    telemetryWriter: telemetry.writer,
  });
  assert.equal(executor.calls(), 1);
  assert.equal(response.routingDecision.selectedProvider, "openai");
  assert.equal(telemetry.records[0].proposed?.selectedProvider, "anthropic");
  assert.ok(telemetry.records[0].reasonCodes.includes("provider_not_production_approved"));
});

await test("pre-selection routing failures persist explicit null selection fields", async () => {
  const telemetry = telemetryHarness();
  await assert.rejects(executeAiRequest(request(), {
    loadRollout: rollout("enforced"),
    evaluateRouting: () => { throw new Error("No configured RYTHM model tier is available for this request."); },
    execute: executionHarness().execute,
    telemetryWriter: telemetry.writer,
  }));
  const row = telemetryRow(telemetry.records[0]);
  assert.equal(row.proposed_model, null);
  assert.equal(row.actual_model, null);
  assert.equal(row.provider, null);
  assert.equal(row.execution_status, "failed");
});

await test("correlation, versions, tokens, cost and latency remain content-minimized", async () => {
  const telemetry = telemetryHarness();
  const executor = executionHarness();
  const response = await executeAiRequest(request({ prompt: "password=hunter2 Authorization: Bearer secret-token" }), {
    loadRollout: rollout("shadow"), evaluateRouting: () => decision(), execute: executor.execute, telemetryWriter: telemetry.writer,
  });
  const row = telemetryRow(telemetry.records[0]);
  assert.equal(row.request_id, response.correlationId);
  assert.equal(row.policy_version, "pilot-v1");
  assert.match(String(row.router_version), /adaptive/);
  assert.equal(row.input_tokens, 100);
  assert.equal(row.output_tokens, 25);
  assert.equal(row.provider_latency_ms, 12);
  assert.equal("prompt" in row, false);
  assert.equal(JSON.stringify(row).includes("hunter2"), false);
  assert.equal(JSON.stringify(row).includes("secret-token"), false);
  assert.notEqual(row.actual_cost_usd, row.estimated_cost_usd);
});

await test("legacy fallback, adaptive agents without runtime_model and fixed-model exceptions remain distinct", async () => {
  const legacyTelemetry = telemetryHarness();
  await executeAiRequest(request({ legacyFallback: { provider: "openai", model: "legacy-model", reason: "legacy_agent" } }), {
    loadRollout: rollout("off"), execute: executionHarness(decision(), "legacy_fallback").execute, telemetryWriter: legacyTelemetry.writer,
  });
  assert.equal(legacyTelemetry.records[0].executionPolicy, "legacy_fallback");
  const adaptive = await executeAiRequest(request({ legacyFallback: undefined }), {
    loadRollout: rollout("enforced"), evaluateRouting: () => decision(), execute: executionHarness().execute, telemetryWriter: async () => {},
  });
  assert.equal(adaptive.executionPolicy, "adaptive");
  const fixedTelemetry = telemetryHarness();
  await executeAiRequest(request({ agentPolicy: { modelPolicy: { mode: "fixed", fixedProvider: "openai", fixedModel: "gpt-fixed" } } }), {
    loadRollout: rollout("enforced"), evaluateRouting: () => decision({ selectedModel: "gpt-fixed" }), execute: executionHarness(decision({ selectedModel: "gpt-fixed" }), "fixed_model").execute, telemetryWriter: fixedTelemetry.writer,
  });
  assert.equal(fixedTelemetry.records[0].executionPolicy, "fixed_model");
});

await test("operational telemetry failure does not fail a valid request", async () => {
  const response = await executeAiRequest(request(), {
    loadRollout: rollout("off"), execute: executionHarness().execute, telemetryWriter: async () => { throw new Error("api_key=secret-value"); },
  });
  assert.equal(response.outputText, "done");
});

await test("migration is additive, least-privilege and tenant-scoped", () => {
  const sql = readFileSync("supabase/migrations/20260825085135_phase1b_routing_modes_telemetry.sql", "utf8").toLowerCase();
  assert.match(sql, /alter table public\.ai_routing_decisions[\s\S]*add column if not exists routing_mode/);
  assert.match(sql, /routing_mode in \('off', 'shadow', 'enforced'\)/);
  assert.match(sql, /revoke all on table public\.ai_routing_decisions from public, anon, authenticated/);
  assert.match(sql, /grant select, insert on table public\.ai_routing_decisions to authenticated/);
  assert.match(sql, /alter column provider drop not null/);
  assert.match(sql, /om\.organization_id = ai_routing_decisions\.organization_id/);
  assert.match(sql, /om\.user_id = \(select auth\.uid\(\)\)/);
  assert.doesNotMatch(sql, /create policy[\s\S]{0,120}to anon/);
  assert.doesNotMatch(sql, /drop table|truncate table|delete from public\.ai_routing_decisions/);
});

console.log(`Phase 1B routing modes and telemetry validation passed: ${passed} checks.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
