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
const allowedIgnored = new Set(["202608050002_seed_company.sql"]);
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
function normalize(names, target) {
  assert(target, "Missing test workspace argument");
  assert(process.env.GITHUB_WORKSPACE || process.env.W01_ALLOW_LOCAL_TEST === "true",
    "Must be in GitHub Actions or explicitly authorized disposable local test");
  isOfflineEnvironment();
  const srcFiles = getSources();
  assert.equal(srcFiles.length, 218, "Source baseline migration count changed: recapture W01 manifest");
  assert(srcFiles.includes("202608050002_seed_company.sql"), "Historical owner seed not found: review exclusion");
  assert(srcFiles.every((name) => /^[0-9]{12}[a-z]?_[a-z0-9_]+\.sql$/.test(name)),
    "Unrecognized original migration naming pattern");
  assert(srcFiles.filter((name) => /seed|fixture/i.test(name)).every((name) => allowedIgnored.has(name)),
    "Additional seed-like migration requires human review and exclusion strategy");
  const dest = resolve(target);
  const migrations = join(dest, "supabase", "migrations");
  mkdirSync(migrations, { recursive: true });
  const mapping = [];
  let count = 0;
  const baseTime = Date.UTC(2026, 9, 25, 0, 0, 0);
  for (const name of srcFiles) {
    const content = readFileSync(join(source, name));
    const checksum = createHash("sha256").update(content).digest("hex");
    if (allowedIgnored.has(name)) {
      mapping.push({ source: name, sha256: checksum, action: "excluded_owner_seed" });
      continue;
    }
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
    excluded_historical_owner_seed: [...allowedIgnored],
    warning: "Normalized local filenames and omitted human-owner seed. Does NOT establish history equivalence or physical schema parity.",
    mapping,
  };
  writeFileSync(join(dest, "w01-local-migration-map.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  console.log("W01 local-only migration map: " + srcFiles.length + " source SQL; " + count + " replay copies; " + allowedIgnored.size + " quarantined owner seed.");
  console.log("W01 map file created in disposable workspace. No source file rewritten. No credentials loaded.");
  return manifest;
}
function selfTest() {
  const sources = getSources();
  assert.equal(sources.length, 218);
  assert(sources.includes("202608050002_seed_company.sql"));
  assert(allowedIgnored.size === 1);
  const sorted = [...sources].sort();
  assert.deepEqual(sources, sorted);
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
