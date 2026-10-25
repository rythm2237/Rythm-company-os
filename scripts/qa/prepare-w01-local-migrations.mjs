#!/usr/bin/env node
/**
 * W01: prepare a disposable, unauthenticated LOCAL Supabase migration replay.
 * Copies only repository SQL; never connects to a remote Supabase project.
 *
 * The original filenames are not all Supabase CLI-compatible 14-digit versions.
 * We normalize names ONLY inside the disposable CI workspace, retain a
 * source->temporary mapping, and never rewrite original migration files.
 *
 * Historical owner seed is excluded: it references an existing human's UUID.
 * Such an exclusion means replay parity is NOT yet proven; this is a diagnostic.
 */
import assert from "node:assert/strict";
import { readFileSync, readdirSync, mkdirSync, writeFileSync, copyFileSync } from "node:fs";
import { resolve, join, basename } from "node:path";
import { createHash } from "node:crypto";

const source = resolve("supabase/migrations");
const allowedIgnored = new Set(["202608050002_seed_company.sql", "20260927104500_2nya_align_portfolio_seed_with_current_site.sql"]);
const cliVersion = "2.84.2";
const forbidden = [
  "SUPABASE_ACCESS_TOKEN",
  "SUPABASE_DB_PASSWORD",
  "SUPABASE_SERVICE_ROLE_KEY",
  "SUPABASE_SECRET_KEY",
];
function isOfflineEnvironment() {
  for (const key of forbidden) {
    assert(!process.env[key], "Forbidden remote or service credential in disposable CI: " + key);
  }
}
function getSources() {
  return readdirSync(source).filter((name) => name.endsWith(".sql")).sort();
}
// Both historical *preflight* files have a lexically later suffix but explicitly
// belong before their corresponding migrations. Do not modify source SQL.
const preflightPairs = [
  ["202608060002a_production_hardening_preflight.sql", "202608060002_production_hardening.sql"],
  ["202608060004a_agent_visual_identity_preflight.sql", "202608060004_agent_visual_identity.sql"],
];
function replayOrder(sourceNames) {
  const files = sourceNames.filter((name) => !allowedIgnored.has(name));
  for (const [preflight, main] of preflightPairs) {
    assert(files.includes(preflight) && files.includes(main), "Missing reviewed migration/preflight pair");
    files.splice(files.indexOf(preflight), 1);
    files.splice(files.indexOf(main), 0, preflight);
  }
  assert(files.indexOf(preflightPairs[0][0]) < files.indexOf(preflightPairs[0][1]));
  assert(files.indexOf(preflightPairs[1][0]) < files.indexOf(preflightPairs[1][1]));
  return files;
}
function normalize(names, target) {
  assert(target, "Missing test workspace argument");
  assert(process.env.GITHUB_WORKSPACE || process.env.W01_ALLOW_LOCAL_TEST === "true",
    "Must be in GitHub Actions or explicitly authorized disposable local test");
  isOfflineEnvironment();
  const srcFiles = getSources();
  assert.equal(srcFiles.length, 218, "Source baseline migration count changed: recapture W01 manifest");
  assert(srcFiles.includes("202608050002_seed_company.sql"), "Historical owner seed not found: review exclusion");
  assert(srcFiles.every((name) => /^[0-9]{12}(?:[0-9]{2}|[a-z])?_[a-z0-9_]+\.sql$/.test(name)),
    "Unrecognized original migration naming pattern");
  assert(srcFiles.filter((name) => /seed|fixture/i.test(name)).every((name) => allowedIgnored.has(name)),
    "Additional seed-like migration requires human review and exclusion strategy");
  const dest = resolve(target);
  const migrations = join(dest, "supabase", "migrations");
  mkdirSync(migrations, { recursive: true });
  const mapping = [];
  let count = 0;
  const baseTime = Date.UTC(2026, 9, 25, 0, 0, 0);
  for (const name of srcFiles.filter((x) => allowedIgnored.has(x))) {
    const checksum = createHash("sha256").update(readFileSync(join(source, name))).digest("hex");
    mapping.push({ source: name, sha256: checksum, action: "excluded_real_data_seed" });
  }
  for (const name of replayOrder(srcFiles)) {
    const content = readFileSync(join(source, name));
    const checksum = createHash("sha256").update(content).digest("hex");
    // Timestamped 14-digit version is CLI-compliant and increasing.
    const date = new Date(baseTime + count * 1000);
    const ver = date.toISOString().slice(0, 19).replace(/[-T:]/g, "");
    const targetName = ver + "_w01_source_" + String(count).padStart(3, "0") + ".sql";
    copyFileSync(join(source, name), join(migrations, targetName));
    mapping.push({ source: name, local_file: targetName, sha256: checksum, action: "local_copy_only" });
    count++;
  }
  assert.equal(count, srcFiles.length - allowedIgnored.size);
  assert(!mapping.some((x) => x.action === "local_copy_only" && x.source.includes("seed_company")));
  const manifest = {
    version: 1,
    cli_version: cliVersion,
    source_migration_count: srcFiles.length,
    local_replay_count: count,
    excluded_data_seeds: [...allowedIgnored],
    warning: "Normalized local names, moved two preflight migrations before their parent SQL, excluded two real-data seeds. DIAGNOSTIC ONLY: not original execution order, exact history, or production schema parity.",
    mapping,
  };
  writeFileSync(join(dest, "w01-local-migration-map.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  console.log("W01 local-only migration map: " + srcFiles.length + " source SQL; " + count + " replay copies; " + allowedIgnored.size + " quarantined real-data seeds.");
  console.log("W01 map file created in disposable workspace. No source file rewritten. No credentials loaded.");
  return manifest;
}
function selfTest() {
  const sources = getSources();
  assert.equal(sources.length, 218);
  assert(sources.includes("202608050002_seed_company.sql"));
  assert(allowedIgnored.size === 2);
  const sorted = [...sources].sort();
  assert.deepEqual(sources, sorted);
  const order = replayOrder(sources);
  for (const [a,b] of preflightPairs) assert(order.indexOf(a) < order.indexOf(b));
  isOfflineEnvironment();
  console.log("W01 PASS: local replay preparation invariant self-test; no database connection made");
}
try {
  if (process.argv.includes("--self-test")) selfTest();
  else normalize(getSources(), process.argv[2]);
} catch (error) {
  console.error("W01 FAIL: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
