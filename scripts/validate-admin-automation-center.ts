import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const root = process.cwd();
const read = (path: string) => readFileSync(resolve(root, path), "utf8");
const vercel = JSON.parse(read("vercel.json")) as { crons?: Array<{ path: string; schedule: string }> };
const dispatchRoute = read("app/api/admin/automation/dispatch/route.ts");
const executor = read("lib/admin/automation/executor.ts");
const monitoring = read("lib/admin/automation/google-monitoring.ts");
const crawlyMonitoring = read("lib/admin/automation/crawly-monitoring.ts");
const searchConsole = read("lib/admin/integrations/google-search-console.ts");
const callback = read("app/api/integrations/google-workspace/callback/route.ts");
const connectRoute = read("app/api/admin/integrations/google-search-console/connect/route.ts");
const migration = read("supabase/migrations/20260909164448_admin_automation_integrations.sql");
const crawlyMigration = read("supabase/migrations/20260911205500_configure_crawly_authority_monitoring.sql");
const robots = read("app/robots.ts");
const adminPage = read("app/(app)/admin/automation/page.tsx");

assert.equal(vercel.crons?.length, 1, "Hobby plan must keep one dispatcher cron.");
assert.equal(vercel.crons?.[0]?.path, "/api/admin/automation/dispatch");
assert.match(vercel.crons?.[0]?.schedule ?? "", /^\d+ \d+ \* \* \*$/, "Dispatcher must run no more than daily on Hobby.");
assert.match(dispatchRoute, /process\.env\.CRON_SECRET/);
assert.match(dispatchRoute, /authorization !== `Bearer \$\{secret\}`/);
assert.match(dispatchRoute, /status: 401/);

for (const handler of ["system_health", "seo_site_health", "ai_usage_cost", "security_health", "core_web_vitals", "search_index_monitoring", "authority_monitoring"]) {
  assert.match(executor, new RegExp(`${handler}:`), `Missing allowlisted handler ${handler}.`);
}
assert.match(executor, /runCrawlyAuthorityMonitoring/, "Authority Monitoring must use the Crawly provider adapter.");
assert.match(executor, /for \(const task of data \?\? \[\]\)/, "Dispatcher must isolate task executions.");
assert.doesNotMatch(executor, /eval\(|new Function|child_process/, "Automation handlers must not execute arbitrary code.");

assert.match(crawlyMonitoring, /process\.env\.CRAWLY_API_KEY/);
assert.match(crawlyMonitoring, /https:\/\/www\.getcrawly\.com\/api\/v1\/backlinks/);
assert.match(crawlyMonitoring, /allowedHosts: \[CRAWLY_HOST\]/, "Crawly network access must remain host allowlisted.");
assert.match(crawlyMonitoring, /Authorization: `Bearer \$\{apiKey\}`/);
assert.match(crawlyMonitoring, /maxRedirects: 0/, "Crawly provider requests must not follow redirects.");
assert.match(crawlyMonitoring, /referringDomains/);
assert.match(crawlyMonitoring, /totalBacklinks/);
assert.doesNotMatch(crawlyMonitoring, /[?&]key=/, "Crawly API credentials must never be sent in the URL.");

assert.match(crawlyMigration, /'provider', 'crawly'/);
assert.match(crawlyMigration, /'required_env', 'CRAWLY_API_KEY'/);
assert.match(crawlyMigration, /configuration_status = 'needs_configuration'/, "Authority Monitoring must stay fail-closed until the key is validated.");
assert.match(crawlyMigration, /'domain', 'rythm-os\.com'/);

assert.match(monitoring, /Google Search Console API/);
assert.match(monitoring, /https:\/\/searchconsole\.googleapis\.com\/webmasters\/v3\/sites/);
assert.doesNotMatch(monitoring, /https:\/\/www\.googleapis\.com\/webmasters\/v3\/sites/);
assert.match(monitoring, /scope: "sampled_monitored_urls"/);
assert.match(monitoring, /CrUX real-user field data/);
assert.match(monitoring, /Lighthouse lab data/);
assert.match(monitoring, /INP is reported only from CrUX field data/);
assert.match(monitoring, /url\.origin === SITE_ORIGIN/);
assert.match(searchConsole, /webmasters\.readonly/);
assert.match(searchConsole, /https:\/\/searchconsole\.googleapis\.com\/webmasters\/v3\/sites/);
assert.doesNotMatch(searchConsole, /https:\/\/www\.googleapis\.com\/webmasters\/v3\/sites/);
assert.match(searchConsole, /get_platform_integration_secret_service_v1/);
assert.match(callback, /verifyGoogleSearchConsoleState/);
assert.match(callback, /getPlatformAdminContext/);
assert.match(callback, /storeGoogleSearchConsoleCredential/);
assert.match(connectRoute, /searchParams\.set\("scope", GOOGLE_SEARCH_CONSOLE_SCOPE\)/, "Search Console consent must request only its read-only scope.");
assert.doesNotMatch(connectRoute, /gmail|calendar|openid|\"email\"/, "Search Console consent must not request unrelated scopes.");
assert.match(connectRoute, /Cross-origin request denied/, "OAuth initiation must reject cross-origin posts.");

assert.match(migration, /alter table public\.platform_integrations enable row level security/);
assert.match(migration, /platform_integrations_admin_read/);
assert.match(migration, /revoke all on table public\.platform_integrations from public, anon, authenticated/);
assert.match(migration, /grant select on table public\.platform_integrations to authenticated/);
assert.match(migration, /request_role <> 'service_role'/);
assert.match(migration, /provider_state":"CONFIGURATION_REQUIRED"/);
assert.doesNotMatch(migration, /refresh_token\s+text|access_token\s+text/, "OAuth tokens must not be table columns.");

assert.match(robots, /"\/admin\/"/);
assert.match(adminPage, /getPlatformAdminContext/);
assert.match(adminPage, /Connect read-only/);

console.log("Admin Automation Center validation passed.");
