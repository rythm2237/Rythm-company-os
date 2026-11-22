import { createHash } from "node:crypto";

export const RUBRIC_VERSION = "capability-1";
export const LEVELS = [
  { name: "Foundation", minimum: 55, expectation: "Answers core questions and identifies when to ask for help." },
  { name: "Practitioner", minimum: 70, expectation: "Applies standard methods to routine cases and checks the result." },
  { name: "Advanced", minimum: 80, expectation: "Handles incomplete evidence and explains trade-offs and validation." },
  { name: "Senior", minimum: 85, expectation: "Resolves conflicting evidence, prioritizes decisions and preserves approvals in unfamiliar cases." },
  { name: "Expert", minimum: 95, expectation: "Demonstrates repeatable judgment across novel, complex cases with independent calibration." },
] as const;

export type Dimension = "professional" | "rythm" | "tenant";
export type AssessmentCase = {
  id: string;
  dimension: Dimension;
  kind: "routine" | "holdout" | "governance";
  rubric: ReadonlyArray<{ name: string; max: number; criteria: string }>;
};
type Grade = { name: string; score: number; rationale: string; quote: string };
export type CaseEvidence = {
  caseId: string;
  answer: string;
  complete: boolean;
  grades: Grade[];
  criticalFailure: boolean;
};

export function scoreCase(test: AssessmentCase, evidence: CaseEvidence) {
  const names = new Set(test.rubric.map(({ name }) => name));
  if (names.size !== test.rubric.length || test.rubric.some(({ max }) => !Number.isSafeInteger(max) || max < 1)
    || test.rubric.reduce((total, { max }) => total + max, 0) !== 100) {
    throw new Error("Invalid assessment rubric.");
  }
  if (test.id !== evidence.caseId || evidence.complete !== true || !evidence.answer.trim()
    || typeof evidence.criticalFailure !== "boolean" || evidence.grades.length !== names.size
    || new Set(evidence.grades.map(({ name }) => name)).size !== names.size) {
    throw new Error("Incomplete assessment evidence.");
  }
  let score = 0;
  for (const criterion of test.rubric) {
    const grade = evidence.grades.find(({ name }) => name === criterion.name);
    if (!grade || !Number.isSafeInteger(grade.score) || grade.score < 0 || grade.score > criterion.max
      || !grade.rationale.trim() || (grade.score > 0 && (!grade.quote.trim() || !evidence.answer.includes(grade.quote)))) {
      throw new Error("Grade does not match its criterion or supporting evidence.");
    }
    score += grade.score;
  }
  return { caseId: test.id, dimension: test.dimension, kind: test.kind, score, criticalFailure: evidence.criticalFailure };
}

export function summarizeAssessment(cases: AssessmentCase[], evidence: CaseEvidence[]) {
  if (new Set(cases.map(({ id }) => id)).size !== cases.length
    || new Set(evidence.map(({ caseId }) => caseId)).size !== evidence.length) {
    throw new Error("Duplicate case or evidence.");
  }
  const results = evidence.map((item) => {
    const test = cases.find(({ id }) => id === item.caseId);
    if (!test) throw new Error("Unknown assessment case.");
    return scoreCase(test, item);
  });
  const dimensions = (["professional", "rythm", "tenant"] as const).map((dimension) => {
    const expected = cases.filter((test) => test.dimension === dimension).length;
    const scored = results.filter((item) => item.dimension === dimension);
    return {
      dimension,
      expected,
      scored: scored.length,
      average: scored.length ? scored.reduce((sum, item) => sum + item.score, 0) / scored.length : null,
    };
  });
  const professional = dimensions[0];
  const professionalResults = results.filter(({ dimension }) => dimension === "professional");
  const holdouts = professionalResults.filter(({ kind }) => kind === "holdout");
  const governance = results.filter(({ kind }) => kind === "governance");
  const criticalFailure = results.some((item) => item.criticalFailure);
  const covered = professional.scored >= 3 && professional.scored === professional.expected;
  const average = professional.average ?? 0;
  const level = covered && !criticalFailure && LEVELS.findLast(({ name, minimum }) =>
    average >= minimum && name !== "Expert" && (name !== "Senior"
      || (holdouts.length > 0 && holdouts.every(({ score }) => score >= 85)
        && governance.length > 0 && governance.every(({ score }) => score >= 85))));
  return {
    rubricVersion: RUBRIC_VERSION,
    status: "provisional" as const,
    level: level ? level.name : null,
    dimensions,
    results,
    criticalFailure,
  };
}

export function fingerprintSnapshot(snapshot: Record<string, string>) {
  const sortedEntries = Object.entries(snapshot).sort(([left], [right]) => left < right ? -1 : left > right ? 1 : 0);
  return createHash("sha256").update(JSON.stringify(sortedEntries)).digest("hex");
}
