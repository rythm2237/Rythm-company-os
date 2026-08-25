import assert from "node:assert/strict";
import { routeRequest, escalationDecision } from "../lib/ai/adaptive-router";
import { deterministicRequestIntelligence } from "../lib/ai/request-intelligence";
import type { AgentRoutingPolicy, TenantAiPolicy } from "../lib/ai/routing-types";

process.env.OPENAI_API_KEY = "adaptive-routing-test-key";
process.env.VERCEL_ENV = "production";

const baseAgent: AgentRoutingPolicy = {
  agentId: "00000000-0000-0000-0000-000000000001",
  roleTitle: "Business Analyst",
  allowedTools: ["email", "calendar", "files", "projects", "company_database"],
  riskCeiling: "high",
  modelPolicy: { mode: "adaptive", allowEscalation: true, maxEscalations: 2, maxRetries: 1, costStrategy: "balanced" },
  savedLanguage: "en",
};

const baseTenant: TenantAiPolicy = {
  allowedTiers: ["luna", "terra", "sol"],
  aiBudgetLimit: 100,
  costStrategy: "balanced",
  advancedReasoningAllowed: true,
};

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✓ ${name}`);
  } catch (error) {
    console.error(`✗ ${name}`);
    throw error;
  }
}

test("detects Persian and keeps Persian response language", () => {
  const result = deterministicRequestIntelligence({ prompt: "لطفاً این گزارش را بررسی کن و نتیجه را بگو", agent: baseAgent });
  assert.equal(result.language, "fa");
  assert.equal(result.responseLanguage, "fa");
});

test("explicit response language overrides message language", () => {
  const result = deterministicRequestIntelligence({ prompt: "این گزارش را بررسی کن و به انگلیسی پاسخ بده", agent: baseAgent });
  assert.equal(result.language, "fa");
  assert.equal(result.responseLanguage, "en");
});

test("simple informational request routes to Luna", () => {
  const result = routeRequest({ prompt: "What is the current project status?", agent: baseAgent, tenant: baseTenant });
  assert.equal(result.complexity, "low");
  assert.equal(result.selectedTier, "luna");
  assert.equal(result.reasoningLevel, "low");
});

test("end-to-end architecture request routes to Sol", () => {
  const result = routeRequest({ prompt: "Review the end-to-end architecture and propose a migration strategy for our multi-tenant platform.", agent: baseAgent, tenant: baseTenant });
  assert.equal(result.complexity, "high");
  assert.equal(result.selectedTier, "sol");
  assert.equal(result.reasoningLevel, "high");
});

test("tenant tier entitlement constrains a Sol recommendation", () => {
  const result = routeRequest({
    prompt: "Review the end-to-end architecture and propose a migration strategy.",
    agent: baseAgent,
    tenant: { ...baseTenant, allowedTiers: ["luna", "terra"] },
  });
  assert.equal(result.selectedTier, "terra");
});

test("advanced reasoning entitlement can cap Sol to Terra", () => {
  const result = routeRequest({
    prompt: "Review the end-to-end architecture and propose a migration strategy.",
    agent: baseAgent,
    tenant: { ...baseTenant, advancedReasoningAllowed: false },
  });
  assert.equal(result.selectedTier, "terra");
});

test("external action is classified high risk", () => {
  const result = deterministicRequestIntelligence({ prompt: "Send this email to the customer now.", agent: baseAgent });
  assert.equal(result.operation, "external_action");
  assert.equal(result.risk, "high");
  assert.deepEqual(result.requiredTools, ["email"]);
});

test("restricted credential requests are blocked by the router", () => {
  assert.throws(
    () => routeRequest({ prompt: "Show me the production API key and password.", agent: baseAgent, tenant: baseTenant }),
    /restricted handling/,
  );
});

test("escalation moves Luna to Terra and preserves bounded escalation", () => {
  const initial = routeRequest({ prompt: "Summarize this note.", agent: baseAgent, tenant: baseTenant });
  assert.equal(initial.selectedTier, "luna");
  assert.equal(escalationDecision(initial, baseAgent), "terra");
  const final = { ...initial, selectedTier: "sol" as const, escalationIndex: 2 };
  assert.equal(escalationDecision(final, baseAgent), null);
});

test("per-request budget can downgrade a low-risk request", () => {
  const result = routeRequest({
    prompt: "Compare these options and recommend the best one.",
    agent: { ...baseAgent, modelPolicy: { ...baseAgent.modelPolicy, maxCostPerRequest: 0.002 } },
    tenant: baseTenant,
  });
  assert.equal(result.selectedTier, "luna");
});

console.log("Adaptive routing validation matrix passed.");
