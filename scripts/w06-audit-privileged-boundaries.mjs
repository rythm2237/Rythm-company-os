import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

// W06 inventory: real checked-out source, no customer records or secret values.
const files = [];
function visit(path) {
  let entries;
  try { entries = readdirSync(path, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (entry.name === "node_modules" || entry.name === ".next") continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) visit(child);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name))
      files.push(child.replaceAll("\\", "/"));
  }
}
for (const root of ["app", "lib", "supabase/functions"]) visit(root);
files.sort();
const symbols = [
  "createServerSupabaseClient", "createBillingAdminClient",
  "createAnalyticsAdminClient", "createKnowledgeAdminClient",
  "createEvaluationAdminClient", "createWorkforceAdminClient",
  "createExecutionServiceClient", "serviceClient",
  "SUPABASE_SERVICE_ROLE_KEY",
];
const privileged = new RegExp("\\b(?:" + symbols.join("|") + ")\\b", "g");
const gateMarkers = [
  ["owner", /\b(resolveOwnerApiOrganizationContext|requireOrganizationContext|requireOwnerOrganizationContext|requireActiveOwnerOrganizationContext|resolveOrganizationContext)\s*\(/],
  ["authenticated", /\b(createAuthServerClient|auth\.getUser|supabase\.auth\.getUser)\s*\(/],
  ["platform-admin", /\b(getPlatformAdminContext|requirePlatformAdmin)\s*\(/],
  ["cron", /\b(authorizeDispatcher|CRON_SECRET|dispatcher_secret_hash)\b/],
  ["signed-webhook", /\b(verifySvixSignature|stripe-signature|verifySignature|webhookSecret|safeEqualText|x-rythm-email-secret)\b/],
  ["guest", /\b(verifyGuest|requireGuest|guestSession|resolveGuest|validateGuest)\w*\s*\(/i],
];
const rows = [], missingGate = [], browserLeaks = [];
for (const path of files) {
  const source = readFileSync(path, "utf8");
  const lines = source.split("\n");
  const hits = [];
  for (let i = 0; i < lines.length; i++) {
    const reg = new RegExp(privileged.source, "g");
    let match;
    while ((match = reg.exec(lines[i]))) hits.push({ line: i + 1, symbol: match[0] });
  }
  if (!hits.length) continue;
  const api = path.startsWith("app/api/");
  const action = path.startsWith("app/") && /\/(?:actions|[\w-]+-actions)\.ts$/.test(path);
  const guards = gateMarkers.filter(([, regex]) => regex.test(source)).map(([label]) => label);
  const directRead = /\.from\s*\(\s*["'][\w.-]+["']\s*\)[\s\S]{0,180}\.select\s*\(/.test(source);
  rows.push({ path, hits, type: api ? "api" : action ? "server-action" : "module", guards, directReadCandidate: directRead });
  if (/^\s*["']use client["'];?/m.test(lines.slice(0, 8).join("\n")))
    browserLeaks.push(path);
  if ((api || action) && directRead && !guards.length)
    missingGate.push(path);
}
const contracts = [
  ["lib/supabase/server.ts", source => assert.match(source, /^import ["']server-only["'];/)],
  ["app/(app)/crm/profile-actions.ts", source => { assert.match(source, /await requireOrganizationContext\(/); assert.match(source, /await requireCrm\(/); assert.ok(source.indexOf("await requireCrm(") < source.indexOf("await import(\"@/lib/supabase/server\")")); }],
  ["app/api/admin/automation/dispatch/route.ts", source => {
    assert.match(source, /timingSafeEqual\(/);
    assert.doesNotMatch(source, /dispatched:\s*results\.length,\s*results\b|error:\s*error\s+instanceof/);
  }],
  ["app/api/projects/dispatch/route.ts", source => {
    assert.match(source, /authorizeDispatcher\(request,service\)/);
    assert.match(source, /Cache-Control["']\s*:\s*["']no-store/);
    assert.doesNotMatch(source, /error:\s*error\s+instanceof|error:\s*\w+\.error\.message/);
  }],
  ["app/api/billing/webhook/route.ts", source => assert.match(source, /verify\(body,signature,secret\)/)],
  ["app/api/communication/inbound/resend/route.ts", source => assert.match(source, /verifySvixSignature\(rawBody,\s*request,\s*webhookSecret\)/)],
  ["app/api/communication/inbound/cloudflare/route.ts", source => assert.match(source, /safeEqualText\(suppliedSecret,\s*expectedSecret\)/)],
];
const failures = [...missingGate.map(p => p + ": privileged read candidate has no recognized caller/trust gate"),
  ...browserLeaks.map(p => p + ": privileged reference in client component")];
for (const [path, check] of contracts) {
  try { check(readFileSync(path, "utf8")); }
  catch (error) { failures.push(path + ": critical backend contract failed (" + error.name + ")"); }
}
const manifest = {
  version: "W06-v1", scannedFiles: files.length, privilegedFiles: rows.length,
  references: rows.reduce((sum, row) => sum + row.hits.length, 0),
  entrypoints: rows.filter(x => x.type !== "module").length,
  schedulerWebhooks: files.filter(p => /^app\/api\/.*(?:webhook|inbound|dispatch)\/route\.ts$/.test(p)),
  rows, missingGate, browserLeaks, failures,
  limitations: [
    "Text-based callsite inventory, not interprocedural dataflow.",
    "Guard marker alone does not prove correct caller-tenant enforcement.",
    "Runtime cross-tenant tests and webhook signature tests are mandatory independent gates.",
  ],
};
const output = "test-results/w06-privileged-boundaries.json";
mkdirSync(dirname(output), { recursive: true });
writeFileSync(output, JSON.stringify(manifest, null, 2) + "\n");
console.log("W06 inventory", JSON.stringify({
  scanned: manifest.scannedFiles, files: rows.length,
  references: manifest.references, entrypoints: manifest.entrypoints,
  schedulerWebhookRoutes: manifest.schedulerWebhooks.length,
  missingGates: missingGate.length, browserLeaks: browserLeaks.length,
  contractFailures: failures.length, output,
}));
for (const error of failures) console.error("W06_BLOCKER", error);
if (failures.length) process.exitCode = 1;
else console.log("PASS W06 static privileged callsite/gate inventory.");
