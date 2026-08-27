import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { DIRECT_EXECUTION_INVENTORY } from "../lib/integrations/direct-execution-inventory";

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (name === "node_modules" || name === ".next" || name === ".git")
      return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const sourceFiles = [
  ...files("app"),
  ...files("lib"),
  ...files("components"),
].filter((path) => /\.(ts|tsx)$/.test(path));
const fetchBoundaries = new Set([
  "app/(app)/meetings/room/DeliberationConsole.tsx",
  "app/(app)/readiness/ExecuteValidationButton.tsx",
  "app/api/integrations/google-workspace/callback/route.ts",
  "app/api/meetings/continue-detached/route.ts",
  "components/app-shell/BoardroomFocusBridge.tsx",
  "components/communication/CommunicationDeliveryDock.tsx",
  "components/consumer-withdrawal-form.tsx",
  "components/project-pulse/ProjectPulse.tsx",
  "lib/ai/agent-provider.ts",
  "lib/billing/stripe-rest.ts",
  "lib/integrations/adapters/http.ts",
]);
const allFetchFiles = sourceFiles
  .filter((path) => /\bfetch\s*\(/.test(readFileSync(path, "utf8")))
  .map((path) => relative(".", path));
assert.deepEqual(
  allFetchFiles.filter((path) => !fetchBoundaries.has(path)),
  [],
  "Every new fetch boundary must be explicitly classified by the Phase 2 guard.",
);
const directPatterns = [
  /fetch\s*\(\s*["'`]https:\/\//,
  /new\s+OpenAI\s*\(/,
  /api\.anthropic\.com/,
  /generativelanguage\.googleapis\.com/,
  /stripePost\s*\(/,
  /await\s+fetch\s*\(url/,
];
const discovered = sourceFiles
  .filter((path) => {
    const source = readFileSync(path, "utf8");
    return directPatterns.some((pattern) => pattern.test(source));
  })
  .map((path) => relative(".", path));
const inventoried = new Set(
  DIRECT_EXECUTION_INVENTORY.map((item) => item.path),
);
const unknown = discovered.filter(
  (path) =>
    !path.startsWith("lib/integrations/adapters/") && !inventoried.has(path),
);
assert.deepEqual(
  unknown,
  [],
  `Unknown direct provider/external execution paths: ${unknown.join(", ")}`,
);
const directSdkPattern =
  /from\s+["'](?:stripe|resend|@octokit\/rest|googleapis|@microsoft\/microsoft-graph-client|nodemailer|playwright|puppeteer|axios|got|ky)["']/;
assert.deepEqual(
  sourceFiles.filter((path) =>
    directSdkPattern.test(readFileSync(path, "utf8")),
  ),
  [],
  "Direct integration SDK imports are prohibited outside registered adapters.",
);
for (const exception of DIRECT_EXECUTION_INVENTORY.filter(
  (item) => item.disposition === "temporary_exception",
)) {
  assert.ok(
    exception.owner &&
      exception.scope &&
      exception.risk &&
      exception.reason &&
      exception.migrationPlan &&
      exception.reviewPoint,
    `Incomplete temporary exception: ${exception.path}`,
  );
}
const outbound = readFileSync(
  "app/api/communication/outbound/resend/route.ts",
  "utf8",
);
assert.match(outbound, /requestToolExecution/);
assert.doesNotMatch(outbound, /fetch\s*\(\s*["'`]https:\/\//);
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
assert.match(ci, /test:phase2:direct-guard/);
console.log(
  `Phase 2 direct execution guard passed (${discovered.length} classified provider boundaries, ${allFetchFiles.length} explicit fetch boundaries; 0 unknown).`,
);
