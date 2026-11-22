import { open, readFile } from "node:fs/promises";
import { createControlledAssessmentTransport } from "../lib/agent-assessment/openai-transport";
import { CONTROLLED_RUN_LIMITS, runControlledGtmAssessment } from "../lib/agent-assessment/run-controlled";

async function main() {
  const [snapshotPath, holdoutPath, reportPath] = process.argv.slice(2);
  if (!snapshotPath || !holdoutPath || !reportPath) {
    console.error("Usage: run-controlled-gtm-assessment <reviewed-staging-snapshot.json> <private-holdout.json> <new-report.json>");
    process.exitCode = 1;
    return;
  }
  const approvedCostMicrousd = Number(process.env.RYTHM_ASSESSMENT_APPROVED_MICROUSD);
  if (!Number.isSafeInteger(approvedCostMicrousd) || approvedCostMicrousd < CONTROLLED_RUN_LIMITS.costMicrousd) {
    console.error(`Set RYTHM_ASSESSMENT_APPROVED_MICROUSD to an explicitly approved cap of at least ${CONTROLLED_RUN_LIMITS.costMicrousd}.`);
    process.exitCode = 1;
    return;
  }
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey?.trim()) {
    console.error("OPENAI_API_KEY is missing in this execution environment.");
    process.exitCode = 1;
    return;
  }
  const [snapshot, privateHoldout] = await Promise.all([snapshotPath, holdoutPath].map(async (path) =>
    JSON.parse(await readFile(path, "utf8"))));
  // Reserve the local report path before spending. A failed attempt retains its own record.
  const file = await open(reportPath, "wx", 0o600);
  try {
    const result = await runControlledGtmAssessment({
      snapshot,
      privateHoldout,
      approvedCostMicrousd,
      generate: createControlledAssessmentTransport(apiKey),
    });
    await file.writeFile(JSON.stringify(result, null, 2) + "\n");
    console.log("Controlled assessment completed. Review the private report before assigning a level.");
  } catch {
    await file.writeFile(JSON.stringify({ status: "failed", level: null }) + "\n");
    throw new Error("Controlled assessment failed.");
  } finally {
    await file.close();
  }
}

main().catch(() => {
  console.error("Controlled assessment could not be completed. No level was assigned.");
  process.exitCode = 1;
});
