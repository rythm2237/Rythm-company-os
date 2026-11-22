import assert from "node:assert/strict";
import { createAssessmentBudget } from "../lib/agent-assessment/budget";
import { GTM_CASES } from "../lib/agent-assessment/gtm-blueprint";
import { fingerprintSnapshot, scoreCase, summarizeAssessment, type AssessmentCase } from "../lib/agent-assessment/scoring";

function fixture(test: AssessmentCase, fraction = 1) {
  const answer = "Synthetic known-answer fixture.";
  return {
    caseId: test.id,
    complete: true,
    answer,
    criticalFailure: false,
    grades: test.rubric.map(({ name, max }) => ({
      name, score: Math.floor(max * fraction), rationale: "Fixed grade for scoring test", quote: answer,
    })),
  };
}

const baseline = GTM_CASES.map((test) => fixture(test));
const report = summarizeAssessment(GTM_CASES, baseline);
assert.equal(report.level, "Senior");
assert.equal(report.status, "provisional");
assert.deepEqual(report.dimensions.map(({ dimension, average }) => [dimension, average]), [
  ["professional", 100], ["rythm", 100], ["tenant", null],
]);
assert.equal(summarizeAssessment(GTM_CASES, baseline.slice(0, 1)).level, null);
const retest = GTM_CASES.map((test) => fixture(test, test.kind === "holdout" ? 0.6 : 1));
assert.equal(summarizeAssessment(GTM_CASES, retest).level, "Advanced");
const failed = baseline.map((item, index) => index === 0 ? { ...item, criticalFailure: true } : item);
assert.equal(summarizeAssessment(GTM_CASES, failed).level, null);
const tenantCase: AssessmentCase = { ...GTM_CASES[0], id: "tenant-fixture", dimension: "tenant" };
assert.equal(summarizeAssessment([...GTM_CASES, tenantCase], [...retest, fixture(tenantCase)]).level, "Advanced");
assert.throws(() => summarizeAssessment(GTM_CASES, [...baseline, baseline[0]]), /Duplicate/);
assert.throws(() => scoreCase(GTM_CASES[0], { ...baseline[0], complete: false }), /Incomplete/);
assert.throws(() => scoreCase(GTM_CASES[0], { ...baseline[0], answer: "Different answer." }), /supporting evidence/);
assert.throws(() => scoreCase(GTM_CASES[0], {
  ...baseline[0], grades: baseline[0].grades.map((grade, index) => index === 0 ? { ...grade, score: NaN } : grade),
}), /criterion/);
assert.equal(fingerprintSnapshot({ role: "GTM", model: "fixture" }), fingerprintSnapshot({ model: "fixture", role: "GTM" }));
assert.notEqual(fingerprintSnapshot({ model: "fixture" }), fingerprintSnapshot({ model: "next" }));
console.log("PASS: deterministic capability scoring, coverage, governance, holdout, tenant separation, completeness and snapshot fingerprint (synthetic fixtures).");

let now = 0;
const limits = { calls: 2, tokens: 20, costMicrousd: 30, durationMs: 100 };
const budget = createAssessmentBudget(limits, () => now);
const request = { tokens: 10, costMicrousd: 15, timeoutMs: 50 };
assert.throws(() => createAssessmentBudget({ ...limits, costMicrousd: 0 }).reserve(request), /exhausted/);
assert.throws(() => budget.reserve({ ...request, tokens: 21 }), /exhausted/);
budget.reserve(request);
now = 51;
assert.throws(() => budget.reserve(request), /exhausted/);
budget.reserve({ ...request, timeoutMs: 49 });
assert.throws(() => budget.reserve({ ...request, timeoutMs: 49 }), /exhausted/);
assert.deepEqual(budget.reserved(), { calls: 2, tokens: 20, costMicrousd: 30 });
console.log("PASS: pre-call budget reservation (zero spend, call, token, cost and duration limits).");
