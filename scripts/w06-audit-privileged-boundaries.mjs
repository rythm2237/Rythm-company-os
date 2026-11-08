import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

// W06 inventory: real checked-out source, no customer records or secret values.
const files = [];
function visit(path) {
  let entries;
  try { entries = readdirSync(path, { withFileTypes: true }); } catch { return; }
  for (const entry of entries) {
    if (["node_modules", ".next", ".git", ".vercel", "coverage", "dist", "test-results"].includes(entry.name)) continue;
    const child = join(path, entry.name);
    if (entry.isDirectory()) visit(child);
    else if (/\.(ts|tsx|mjs|js)$/.test(entry.name))
      files.push(child.replaceAll("\\", "/"));
  }
}
// Scan the whole checkout, including scripts, server actions and public bundles.
visit(".");
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
  const type = api ? "api" : action ? "server-action" :
    path.startsWith("supabase/functions/") ? "edge" :
    path.startsWith("scripts/") ? "script-or-test" :
    path.startsWith("public/") ? "public-asset" : "module";
  const priority = /(?:webhook|inbound|dispatch|cron|server\/|service-runner|billing)/i.test(path) ? "P0" :
    (api || action || type === "edge" ? "P1" : "P2");
  const triage = guards.length ? "AUTH_MARKER_REQUIRES_RUNTIME_EVIDENCE" :
    (type === "script-or-test" ? "SCRIPT_FIXTURE_REVIEW" : "CALLER_AUTH_REVIEW");
  rows.push({ path, hits, type, priority, triage, guards, directReadCandidate: directRead });
  if (path.startsWith("public/") || /^\s*["']use client["'];?/m.test(lines.slice(0, 8).join("\n")))
    browserLeaks.push(path);
  if ((api || action) && directRead && !guards.length)
    missingGate.push(path);
}
const contracts = [
  ["lib/supabase/server.ts", source => assert.match(source, /typeof window !== "undefined"/)],
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
  ["supabase/functions/two-nya-push/index.ts", source => {
    assert.ok(source.indexOf("const validSignature = await crypto.subtle.verify(") >= 0);
    assert.ok(source.indexOf("if (!validSignature) return") < source.indexOf("const db = createClient("), "unsigned requests cannot construct privileged client");
    assert.ok(source.indexOf("if (!validSignature) return") < source.indexOf('.select("public_key,private_key")'), "private VAPID read must follow signed POST authorization");
    assert.match(source, /\.select\("public_key"\)\.eq\("singleton", true\)/);
    assert.doesNotMatch(source, /error_message:\s*String\(|console\.error\("two_nya_push_exception",\s*error/);
  }],
  ["lib/2nya-nailart/push-dispatch.ts", source => {
    assert.match(source,/typeof window !== "undefined"/);
    assert.match(source,/createHmac\("sha256", secret\)/);
  }],
  ...["admin","book","contact-message","manage"].map(name => [
    "app/api/2nya-nailart/" + name + "/route.ts",
    source => { assert.match(source,/dispatchNailPush\(/); assert.doesNotMatch(source,/fetch\([^)]*two-nya-push/); },
  ]),
  ["app/(app)/evaluations/page.tsx", source => {
    assert.match(source, /await requireOwnerOrganizationContext\(\)/);
    assert.match(source, /\.eq\("organization_id", organizationId\)/);
    assert.doesNotMatch(source, /\.from\("organizations"\)|completeOrganizations|namedRythm/);
  }],
  ["lib/integrations/error-normalization.ts", source => {
    assert.match(source, /sanitizedError: "EXECUTION_UNKNOWN"/);
    assert.match(source, /sanitizedError: "EXECUTION_TIMEOUT"/);
    assert.doesNotMatch(source, /sanitizedError:\s*(?:message|redactSecretText\(error\.message\))/);
  }],
  ...["projects/analyze", "projects/completion", "projects/roadmap"].map(name => [
    "app/api/" + name + "/route.ts",
    source => { assert.doesNotMatch(source,/error:\s*(?:error\s+instanceof\s+Error\s*\?\s*error\.message|\w+\.error\.message)/); },
  ]),
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
  schedulerWebhooks: files.filter(p => p.startsWith("app/api/") && p.endsWith("/route.ts") && /(?:^|\/)(?:webhook|webhooks|inbound|dispatch|cron)(?:\/|$)/.test(p)),
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
