import assert from "node:assert/strict";
import { GTM_CASES, GTM_ROLE } from "../lib/agent-assessment/gtm-blueprint";
import { ASSESSMENT_MODEL, CONTROLLED_RUN_LIMITS, runControlledGtmAssessment } from "../lib/agent-assessment/run-controlled";

async function main() {
  let calls = 0;
  const answer = "Synthetic transport fixture.";
  const snapshot = {
    agentCode: "GTM-STRAT-001", canonicalRole: GTM_ROLE, specificationVersion: "fixture",
    approvedSystemInstructions: "Synthetic instruction.",
  };
  const privateHoldout = { version: "fixture", prompt: "New fictional fixture." };
  const approvedCostMicrousd = CONTROLLED_RUN_LIMITS.costMicrousd;
  const generate = async ({ maxOutputTokens }: { maxOutputTokens: number }) => {
    const index = calls++;
    const test = GTM_CASES[Math.floor(index / 2)];
    return {
      text: index % 2 === 0 ? answer : JSON.stringify({
        criticalFailure: false,
        grades: test.rubric.map(({ name, max }) => ({ name, score: max, rationale: "Synthetic grade.", quote: answer })),
      }),
      complete: true, model: ASSESSMENT_MODEL, requestId: String(index + 1), inputTokens: 100, outputTokens: maxOutputTokens,
    };
  };
  const input = { snapshot, privateHoldout, approvedCostMicrousd, generate };

  await assert.rejects(runControlledGtmAssessment({ ...input, approvedCostMicrousd: approvedCostMicrousd - 1 }), /spend cap/);
  await assert.rejects(runControlledGtmAssessment({
    ...input, privateHoldout: { ...privateHoldout, prompt: GTM_CASES.find(({ kind }) => kind === "holdout")!.prompt },
  }), /private holdout/);
  assert.equal(calls, 0);

  const result = await runControlledGtmAssessment(input);
  assert.equal(calls, CONTROLLED_RUN_LIMITS.calls);
  assert.equal(result.report.level, "Senior");
  assert.equal(result.humanReview, "pending");
  assert.equal(result.evidence.length, GTM_CASES.length);
  assert.equal(result.report.dimensions.find(({ dimension }) => dimension === "tenant")?.average, null);
  assert.ok(result.reserved.costMicrousd <= approvedCostMicrousd);

  calls = 0;
  await assert.rejects(runControlledGtmAssessment({
    ...input, generate: async (request) => ({ ...await generate(request), complete: false }),
  }), /incomplete/);
  assert.equal(calls, 1);
  console.log("PASS: controlled run, budget and holdout fail-closed, truncation rejection, distinct tenant dimension (mock transport).");
}

void main().catch((error) => {
  console.error(error);
  process.exitCode = 1;
});
