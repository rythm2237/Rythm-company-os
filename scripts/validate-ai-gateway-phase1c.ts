import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { executeAiRequest } from "../lib/ai/request-gateway";
import { fallbackRoutingDecision, routeRequest as legacyRouteRequest, routeRequestV2, RoutingPolicyError } from "../lib/ai/adaptive-router";
import { deterministicRequestIntelligence, INTENT_TAXONOMY_VERSION, REQUEST_INTELLIGENCE_VERSION } from "../lib/ai/request-intelligence";
import { DEFAULT_MODEL_REGISTRY_VERSION, getModelRegistry } from "../lib/ai/model-registry";
import { getProviderEligibility } from "../lib/ai/provider-eligibility";
import { telemetryRow, type AiRoutingTelemetryRecord } from "../lib/ai/routing-telemetry";
import type { AiGatewayRequest } from "../lib/ai/gateway-contracts";
import type { AgentRoutingPolicy, TenantAiPolicy } from "../lib/ai/routing-types";
import type { RunAgentInput } from "../lib/ai/agent-provider";

process.env.OPENAI_API_KEY = "phase-1c-openai-test-key";
process.env.ANTHROPIC_API_KEY = "phase-1c-anthropic-test-key";
process.env.GEMINI_API_KEY = "phase-1c-google-test-key";
process.env.VERCEL_ENV = "production";

const organizationId = "00000000-0000-4000-8000-000000000101";
const userId = "00000000-0000-4000-8000-000000000102";
const agentId = "00000000-0000-4000-8000-000000000103";

const allPermissions = ["read", "create", "update", "send", "delete", "publish", "financial", "external_communication", "destructive", "privileged"];
const baseAgent: AgentRoutingPolicy = {
  agentId,
  roleTitle: "Strategy and Technical Analyst",
  allowedTools: ["email", "calendar", "github", "files", "projects", "company_database"],
  permissions: allPermissions,
  riskCeiling: "high",
  modelPolicy: { mode: "adaptive", allowEscalation: true, maxEscalations: 2, maxRetries: 1, costStrategy: "balanced" },
  savedLanguage: "en",
};
const baseTenant: TenantAiPolicy = {
  allowedTiers: ["luna", "terra", "sol"],
  aiBudgetLimit: 100,
  costStrategy: "balanced",
  advancedReasoningAllowed: true,
  userPermissions: allPermissions,
  organizationPolicyVersion: "organization-routing-policy-test-v2",
};

function environment(overrides: Partial<NodeJS.ProcessEnv> = {}): NodeJS.ProcessEnv {
  return {
    ...process.env,
    OPENAI_API_KEY: "phase-1c-openai-test-key",
    ANTHROPIC_API_KEY: "phase-1c-anthropic-test-key",
    GEMINI_API_KEY: "phase-1c-google-test-key",
    VERCEL_ENV: "production",
    NODE_ENV: "test",
    ...overrides,
  };
}

function route(prompt: string, overrides: Partial<Parameters<typeof routeRequestV2>[0]> = {}) {
  const env = overrides.environment ?? environment();
  return routeRequestV2({ prompt, agent: baseAgent, tenant: baseTenant, runtimeEnvironment: "production", environment: env, ...overrides });
}

let passed = 0;
async function test(name: string, action: () => void | Promise<void>) {
  await action();
  passed += 1;
  console.log(`✓ ${name}`);
}

function gatewayRequest(overrides: Partial<AiGatewayRequest> = {}): AiGatewayRequest {
  return {
    organizationId,
    correlationId: "00000000-0000-4000-8000-000000000104",
    actor: { type: "user", userId, agentId },
    feature: "agent.console",
    prompt: "Summarize the current status.",
    systemInstructions: "Remain advisory and preserve human authority.",
    agentPolicy: baseAgent,
    tenantPolicy: baseTenant,
    ...overrides,
  };
}

async function main() {
await test("language classification covers English, Persian, mixed Persian/English, Japanese, French and German", () => {
  const cases = [
    ["Please summarize this report.", "en"],
    ["لطفاً این گزارش را خلاصه کن.", "fa"],
    ["لطفاً status report پروژه را summarize کن.", "fa"],
    ["このレポートを要約してください。", "ja"],
    ["Veuillez résumer ce rapport en français.", "fr"],
    ["Bitte fassen Sie diesen Bericht auf Deutsch zusammen.", "de"],
  ] as const;
  for (const [prompt, expected] of cases) {
    const result = deterministicRequestIntelligence({ prompt, agent: baseAgent, tenant: baseTenant });
    assert.equal(result.language, expected, prompt);
    assert.equal(result.responseLanguage, expected, prompt);
  }
  const mixed = deterministicRequestIntelligence({ prompt: cases[2][0], agent: baseAgent, tenant: baseTenant });
  assert.deepEqual(mixed.detectedLanguages, ["fa", "en"]);
  assert.ok(mixed.reasonCodes.includes("MIXED_LANGUAGE"));
});

await test("explicit response language remains distinct from detected request language", () => {
  const result = deterministicRequestIntelligence({ prompt: "این گزارش را بررسی کن و به انگلیسی پاسخ بده", agent: baseAgent, tenant: baseTenant });
  assert.equal(result.language, "fa");
  assert.equal(result.responseLanguage, "en");
});

await test("controlled intent taxonomy is versioned and classifies representative product intents", () => {
  const cases = [
    ["What is ARR?", "information"],
    ["Draft a customer update.", "drafting"],
    ["Analyze these unit economics.", "analysis"],
    ["Create a go-to-market roadmap.", "planning"],
    ["Should we enter Japan next quarter?", "decision_support"],
    ["Summarize this report.", "summarization"],
    ["Rewrite this paragraph.", "transformation"],
    ["Debug this TypeScript function.", "coding"],
    ["Use the calendar tool to find availability.", "tool_execution"],
    ["Coordinate a cross-department handoff.", "workflow_coordination"],
    ["Run a Boardroom deliberation about expansion.", "meeting_deliberation"],
    ["Find the refund policy in company knowledge.", "knowledge_retrieval"],
    ["Send the contract to the customer now.", "high_impact_action"],
  ] as const;
  for (const [prompt, intent] of cases) {
    const result = deterministicRequestIntelligence({ prompt, agent: baseAgent, tenant: baseTenant });
    assert.equal(result.intent, intent, prompt);
    assert.equal(result.intentTaxonomyVersion, INTENT_TAXONOMY_VERSION);
  }
});

await test("simple requests avoid unnecessary high-tier routing and length alone does not imply complexity", () => {
  for (const prompt of ["What is ARR?", "Rewrite this sentence clearly.", "Summarize this note."]) {
    const result = route(prompt);
    assert.equal(result.complexity, "low");
    assert.equal(result.selectedTier, "luna");
    assert.equal(result.selectedCapabilityTier, "fast");
  }
  const longSimple = route(Array.from({ length: 1100 }, () => "hello").join(" "));
  assert.equal(longSimple.complexity, "low");
});

await test("existing Production callers retain the v1 compatibility router until Phase 1D", () => {
  const legacy = legacyRouteRequest({ prompt: "Summarize this note.", agent: baseAgent, tenant: baseTenant });
  assert.equal(legacy.routingVersion, "adaptive-v1-compat");
  const proposed = route("Summarize this note.");
  assert.match(proposed.routingVersion, /^adaptive-router-v2/);
});

await test("multi-constraint cross-functional planning selects advanced reasoning", () => {
  const result = route("Create an end-to-end migration strategy for a cross-functional Finance and Legal program. Evaluate trade-offs, assumptions, security, dependencies, and a multi-step rollout.");
  assert.equal(result.complexity, "high");
  assert.equal(result.reasoningDepth, "deep");
  assert.equal(result.selectedCapabilityTier, "advanced_reasoning");
  assert.equal(result.selectedTier, "sol");
  assert.ok(result.reasonCodes.includes("ADVANCED_REASONING_REQUIRED"));
});

await test("coding and multimodal requirements select eligible capabilities", () => {
  const coding = route("Debug this TypeScript function and explain the bug.");
  assert.equal(coding.intent, "coding");
  assert.equal(coding.selectedCapabilityTier, "coding");
  assert.notEqual(coding.selectedTier, "luna");
  const multimodal = route("Inspect this image attachment and summarize the layout.", { attachments: [{ mimeType: "image/png" }] });
  assert.equal(multimodal.selectedCapabilityTier, "multimodal");
  assert.ok(multimodal.requiredModalities.includes("image"));
});

await test("tool requirements are detected without granting authority", () => {
  const result = deterministicRequestIntelligence({
    prompt: "Send this email to the customer now.",
    agent: { ...baseAgent, allowedTools: ["email"], permissions: ["read"] },
    tenant: { ...baseTenant, userPermissions: ["read"] },
  });
  assert.deepEqual(result.requiredTools, ["email"]);
  assert.equal(result.authorizationSignal, "denied");
  assert.equal(result.humanReviewRequired, true);
  assert.ok(result.reasonCodes.includes("PERMISSION_DENIED"));
});

await test("unavailable tools remain visible and trigger escalation instead of fake completion", () => {
  const result = deterministicRequestIntelligence({ prompt: "Use GitHub to review the pull request.", agent: { ...baseAgent, allowedTools: [] }, tenant: baseTenant });
  assert.deepEqual(result.requiredTools, ["github"]);
  assert.deepEqual(result.unavailableTools, ["github"]);
  assert.ok(result.reasonCodes.includes("TOOL_UNAVAILABLE"));
});

await test("high-impact financial, legal, destructive and privileged actions preserve governance", () => {
  for (const prompt of ["Pay the supplier now.", "Sign the contract now.", "Delete the production database.", "Grant privileged admin access."]) {
    const result = route(prompt);
    assert.equal(result.risk, "high", prompt);
    assert.equal(result.humanReviewRequired, true, prompt);
    assert.equal(result.selectedCapabilityTier, "high_accuracy", prompt);
    assert.equal(result.selectedTier, "sol", prompt);
  }
});

await test("context and memory requirements are signaled without loading all company memory", () => {
  const result = deterministicRequestIntelligence({ prompt: "Use company knowledge and the current project policy from our previous conversation.", requestType: "agent.console", agent: baseAgent, tenant: baseTenant });
  assert.ok(result.contextRequirements.includes("conversation"));
  assert.ok(result.contextRequirements.includes("company"));
  assert.ok(result.contextRequirements.includes("project"));
  assert.ok(result.contextRequirements.includes("company_knowledge"));
  assert.equal("memoryContent" in result, false);
});

await test("context limits fail safely instead of choosing an unsupported candidate", () => {
  assert.throws(() => route("Analyze the supplied context.", { contextCharacterCount: 5_000_000 }), (error: unknown) => {
    assert.ok(error instanceof RoutingPolicyError);
    assert.ok(error.reasonCodes.includes("CONTEXT_LIMIT_EXCEEDED"));
    assert.ok(error.reasonCodes.includes("NO_ELIGIBLE_MODEL"));
    return true;
  });
});

await test("cost-aware selection chooses the cheapest eligible model without capability downgrade", () => {
  const standard = route("Compare these options and recommend the best one.", { agent: { ...baseAgent, modelPolicy: { ...baseAgent.modelPolicy, costStrategy: "economy" } } });
  assert.equal(standard.selectedTier, "luna");
  assert.ok(standard.reasonCodes.includes("COST_OPTIMIZED"));
  const advanced = route("Create an end-to-end migration strategy with multi-step security and architecture trade-offs.", { agent: { ...baseAgent, modelPolicy: { ...baseAgent.modelPolicy, costStrategy: "economy" } } });
  assert.notEqual(advanced.selectedTier, "luna");
  assert.ok(advanced.selectedCapabilityTier === "advanced_reasoning" || advanced.selectedCapabilityTier === "high_accuracy");
});

await test("Production provider eligibility remains OpenAI-only even when all provider keys exist", () => {
  assert.equal(getProviderEligibility("openai", "production", environment()).eligible, true);
  assert.equal(getProviderEligibility("anthropic", "production", environment()).eligible, false);
  assert.equal(getProviderEligibility("google", "production", environment()).eligible, false);
  const env = environment({ RYTHM_MODEL_LUNA_PROVIDER: "anthropic" });
  const decision = route("What is ARR?", { environment: env });
  assert.equal(decision.selectedProvider, "openai");
  assert.ok(decision.reasonCodes.includes("PROVIDER_NOT_APPROVED"));
});

await test("invalid registry configuration and disabled models fail closed", () => {
  const invalid = environment({ RYTHM_MODEL_LUNA_PROVIDER: "invalid", RYTHM_MODEL_TERRA_PROVIDER: "invalid", RYTHM_MODEL_SOL_PROVIDER: "invalid" });
  assert.throws(() => route("What is ARR?", { environment: invalid }), /No Production-eligible model/);
  const disabled = environment({ RYTHM_MODEL_LUNA_ENABLED: "false", RYTHM_MODEL_TERRA_ENABLED: "false", RYTHM_MODEL_SOL_ENABLED: "false" });
  assert.throws(() => route("What is ARR?", { environment: disabled }), /No Production-eligible model/);
});

await test("runtime_model remains optional and fixed-model exceptions remain explicit", () => {
  const adaptive = route("Summarize this note.", { agent: { ...baseAgent, modelPolicy: { mode: "adaptive", allowEscalation: true, maxEscalations: 1, maxRetries: 1, costStrategy: "balanced" } } });
  assert.equal(adaptive.selectedModel.length > 0, true);
  const fixed = route("Summarize this note.", { agent: { ...baseAgent, modelPolicy: { mode: "fixed", fixedProvider: "openai", fixedModel: "gpt-5.6-terra", allowEscalation: false, maxEscalations: 0, maxRetries: 0, costStrategy: "balanced" } } });
  assert.equal(fixed.selectedModel, "gpt-5.6-terra");
  assert.ok(fixed.reasonCodes.includes("FIXED_MODEL_EXCEPTION"));
  const legacyUnknown = route("Summarize this note.", { agent: { ...baseAgent, modelPolicy: { mode: "fixed", fixedProvider: "openai", fixedModel: "legacy-openai-model", allowEscalation: false, maxEscalations: 0, maxRetries: 0, costStrategy: "balanced" } } });
  assert.ok(legacyUnknown.reasonCodes.includes("MODEL_METADATA_UNKNOWN"));
});

await test("unapproved or disabled fixed models never silently execute an unrelated model", () => {
  assert.throws(() => route("Summarize this note.", { agent: { ...baseAgent, modelPolicy: { mode: "fixed", fixedProvider: "anthropic", fixedModel: "claude-disabled", allowEscalation: false, maxEscalations: 0, maxRetries: 0, costStrategy: "balanced" } } }), /not Production-approved/);
  const env = environment({ RYTHM_MODEL_TERRA_ENABLED: "false" });
  assert.throws(() => route("Summarize this note.", { environment: env, agent: { ...baseAgent, modelPolicy: { mode: "fixed", fixedProvider: "openai", fixedModel: "gpt-5.6-terra", allowEscalation: false, maxEscalations: 0, maxRetries: 0, costStrategy: "balanced" } } }), /disabled/);
});

await test("timeout and provider failure fallback remain capability-safe and Production-approved", () => {
  const current = route("What is ARR?");
  const fallback = fallbackRoutingDecision(current, { prompt: "What is ARR?", agent: baseAgent, tenant: baseTenant, runtimeEnvironment: "production", environment: environment() }, "timeout");
  assert.ok(fallback);
  assert.notEqual(fallback?.selectedModel, current.selectedModel);
  assert.equal(fallback?.selectedProvider, "openai");
  assert.ok(fallback?.reasonCodes.includes("ESCALATION_REQUIRED"));
  const fixed = route("What is ARR?", { agent: { ...baseAgent, modelPolicy: { mode: "fixed", fixedProvider: "openai", fixedModel: "gpt-5.6-luna", fixedModelFallback: "deny", allowEscalation: false, maxEscalations: 0, maxRetries: 0, costStrategy: "balanced" } } });
  assert.equal(fallbackRoutingDecision(fixed, { prompt: "What is ARR?", agent: { ...baseAgent, modelPolicy: { mode: "fixed", fixedProvider: "openai", fixedModel: "gpt-5.6-luna", fixedModelFallback: "deny", allowEscalation: false, maxEscalations: 0, maxRetries: 0, costStrategy: "balanced" } }, tenant: baseTenant, runtimeEnvironment: "production", environment: environment() }, "provider_unavailable"), null);
});

await test("every decision carries router, policy, classifier, taxonomy and registry versions plus structured reasons", () => {
  const decision = route("Analyze our multi-step strategy and recommend a plan.");
  assert.match(decision.routingVersion, /^adaptive-router-v2/);
  assert.equal(decision.policyVersion, baseTenant.organizationPolicyVersion);
  assert.equal(decision.classifierVersion, REQUEST_INTELLIGENCE_VERSION);
  assert.equal(decision.intentTaxonomyVersion, INTENT_TAXONOMY_VERSION);
  assert.equal(decision.modelRegistryVersion, DEFAULT_MODEL_REGISTRY_VERSION);
  assert.ok(decision.reasonCodes.length > 0);
  assert.equal(typeof decision.reasonSummary, "string");
});

await test("shadow integration records proposed versus actual once without changing execution", async () => {
  let providerCalls = 0;
  const telemetry: AiRoutingTelemetryRecord[] = [];
  const actual = legacyRouteRequest({ prompt: "Analyze the current status.", requestId: "00000000-0000-4000-8000-000000000104", agent: baseAgent, tenant: baseTenant, forcedTier: "terra" });
  const response = await executeAiRequest(gatewayRequest(), {
    loadRollout: async () => ({ mode: "shadow", source: "organization", policyVersion: "pilot-shadow-v1", killSwitchActive: false, reasonCodes: ["organization_routing_mode"] }),
    execute: async (input: RunAgentInput) => {
      providerCalls += 1;
      assert.equal(input.authoritativeDecision, undefined);
      await input.onRoutingDecision?.(actual);
      return { outputText: "legacy output", actualModel: actual.selectedModel, providerLatencyMs: 15, routingDecision: actual, fallbackUsed: false, executionPolicy: "adaptive" };
    },
    telemetryWriter: async (record) => { telemetry.push(record); },
  });
  assert.equal(providerCalls, 1);
  assert.equal(response.outputText, "legacy output");
  assert.equal(telemetry.length, 1);
  assert.ok(telemetry[0].proposed);
  assert.equal(telemetry[0].actual?.selectedModel, actual.selectedModel);
  const row = telemetryRow(telemetry[0]);
  assert.equal(row.classifier_version, REQUEST_INTELLIGENCE_VERSION);
  assert.equal(row.model_registry_version, DEFAULT_MODEL_REGISTRY_VERSION);
  assert.equal(row.policy_version, "pilot-shadow-v1");
  assert.equal(row.adaptive_policy_version, baseTenant.organizationPolicyVersion);
});

await test("telemetry is content-minimized and contains no prompt, payload, chain-of-thought or secret", () => {
  const decision = route("password=hunter2 Authorization: Bearer secret-token Summarize this note.");
  const row = telemetryRow({
    correlationId: decision.requestId,
    organizationId,
    userId,
    agentId,
    requestType: "agent.console",
    routingMode: "shadow",
    proposed: decision,
    actual: null,
    executionPolicy: "adaptive",
    fallbackUsed: false,
    reasonCodes: decision.reasonCodes,
    policyVersion: "pilot-shadow-v1",
    pricingVersion: "test-pricing",
    success: true,
  });
  const serialized = JSON.stringify(row);
  assert.equal("prompt" in row, false);
  assert.equal("chain_of_thought" in row, false);
  assert.equal(serialized.includes("hunter2"), false);
  assert.equal(serialized.includes("secret-token"), false);
});

await test("model registry metadata is capability-based and configuration-driven", () => {
  const registry = getModelRegistry(environment({ RYTHM_MODEL_LUNA_ESTIMATED_LATENCY_MS: "777", RYTHM_MODEL_REGISTRY_VERSION: "registry-test-v9" }));
  assert.equal(registry.length, 3);
  assert.ok(registry.every((model) => model.capabilityTiers.length && model.supportedModalities.includes("text")));
  assert.equal(registry.find((model) => model.tier === "luna")?.estimatedLatencyMs, 777);
  assert.ok(registry.some((model) => model.capabilityTiers.includes("high_accuracy")));
});

await test("Phase 1C migration is additive and leaves tenant RLS/grants untouched", () => {
  const sql = readFileSync("supabase/migrations/20260825100348_phase1c_request_intelligence_telemetry.sql", "utf8").toLowerCase();
  assert.match(sql, /alter table public\.ai_routing_decisions/);
  assert.match(sql, /add column if not exists classifier_version/);
  assert.match(sql, /add column if not exists model_registry_version/);
  assert.match(sql, /add column if not exists proposed_capability_tier/);
  assert.doesNotMatch(sql, /drop table|truncate table|delete from|disable row level security/);
  assert.doesNotMatch(sql, /grant |revoke |create policy|drop policy/);
});

console.log(`Phase 1C Request Intelligence and Adaptive Routing v2 validation passed: ${passed} checks.`);
}

main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
