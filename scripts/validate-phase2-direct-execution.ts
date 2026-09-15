import assert from "node:assert/strict";
import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { GOOGLE_OAUTH_REFRESH_BOUNDARY } from "../lib/company-bootstrap/direct-execution-boundary";
import { DIRECT_EXECUTION_INVENTORY } from "../lib/integrations/direct-execution-inventory";

function files(root: string): string[] {
  return readdirSync(root).flatMap((name) => {
    const path = join(root, name);
    if (name === "node_modules" || name === ".next" || name === ".git") return [];
    return statSync(path).isDirectory() ? files(path) : [path];
  });
}
const sourceFiles = [...files("app"), ...files("lib"), ...files("components")].filter((path) => /\.(ts|tsx)$/.test(path));
const fetchBoundaries = new Set([
  "app/(app)/agents/[code]/benchmark/BenchmarkConsole.tsx",
  "app/(app)/meetings/room/DeliberationConsole.tsx",
  "app/(app)/readiness/ExecuteValidationButton.tsx",
  "app/api/integrations/google-workspace/callback/route.ts",
  "app/api/integrations/google-analytics/callback/route.ts",
  "app/api/integrations/google-search-console/callback/route.ts",
  "app/api/integrations/microsoft-365/callback/route.ts",
  "app/api/meetings/continue-detached/route.ts",
  "components/app-shell/BoardroomFocusBridge.tsx",
  "components/communication/CommunicationDeliveryDock.tsx",
  "components/consumer-withdrawal-form.tsx",
  "components/project-pulse/ProjectPulse.tsx",
  // Project OS client controls call only same-origin, authenticated RYTHM API routes.
  // They do not call providers or execute external side effects directly.
  "components/projects/project-governance-controls.tsx",
  "components/projects/project-live-operations.tsx",
  "components/projects/project-os-controls.tsx",
  "components/projects/ProjectExecutiveSignalEnhancer.tsx",
  "components/projects/approval-decision-discussion.tsx",
  "lib/ai/agent-provider.ts",
  "lib/analytics/public-events.ts",
  "lib/billing/stripe-rest.ts",
  GOOGLE_OAUTH_REFRESH_BOUNDARY.path,
  "lib/integrations/adapters/http.ts",
  "lib/integrations/adapters/customer-connections.ts",
  // Classified in DIRECT_EXECUTION_INVENTORY as a platform control-plane boundary.
  // It may create/read secure cloud-browser infrastructure sessions, but it grants no
  // business-action authority and every provider URL/action remains allowlisted.
  "lib/integrations/computer-use/runtime.ts",
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
const inventoried = new Set([
  ...DIRECT_EXECUTION_INVENTORY.map((item) => item.path),
  GOOGLE_OAUTH_REFRESH_BOUNDARY.path,
]);
const unknown = discovered.filter((path) => !path.startsWith("lib/integrations/adapters/") && !inventoried.has(path));
assert.deepEqual(unknown, [], `Unknown direct provider/external execution paths: ${unknown.join(", ")}`);

const computerUseBoundary = DIRECT_EXECUTION_INVENTORY.find((item) => item.path === "lib/integrations/computer-use/runtime.ts");
assert.ok(computerUseBoundary, "Computer Use boundary must remain explicitly inventoried.");
assert.equal(computerUseBoundary.disposition, "platform_control_boundary");
assert.match(computerUseBoundary.scope, /connection setup control-plane/i);
assert.match(computerUseBoundary.reason, /not authority to execute business actions/i);
assert.match(computerUseBoundary.reviewPoint, /credential-handling/i);

assert.equal(GOOGLE_OAUTH_REFRESH_BOUNDARY.disposition, "platform_control_boundary");
assert.match(GOOGLE_OAUTH_REFRESH_BOUNDARY.scope, /OAuth access-token refresh/);
assert.match(GOOGLE_OAUTH_REFRESH_BOUNDARY.reason, /cannot perform Gmail or Calendar business actions/);
const directSdkPattern = /from\s+["'](?:stripe|resend|@octokit\/rest|googleapis|@microsoft\/microsoft-graph-client|nodemailer|playwright|puppeteer|axios|got|ky)["']/;
assert.deepEqual(
  sourceFiles.filter((path) => directSdkPattern.test(readFileSync(path, "utf8"))),
  [],
  "Direct integration SDK imports are prohibited outside registered adapters.",
);
for (const exception of DIRECT_EXECUTION_INVENTORY.filter((item) => item.disposition === "temporary_exception")) {
  assert.ok(
    exception.owner && exception.scope && exception.risk && exception.reason && exception.migrationPlan && exception.reviewPoint,
    `Incomplete temporary exception: ${exception.path}`,
  );
}
const outbound = readFileSync("app/api/communication/outbound/resend/route.ts", "utf8");
assert.match(outbound, /requestToolExecution/);
assert.doesNotMatch(outbound, /fetch\s*\(\s*["'`]https:\/\//);
const ci = readFileSync(".github/workflows/ci.yml", "utf8");
assert.match(ci, /test:phase2:direct-guard/);
console.log(`Phase 2 direct execution guard passed (${discovered.length} classified provider boundaries, ${allFetchFiles.length} explicit fetch boundaries; 0 unknown).`);
