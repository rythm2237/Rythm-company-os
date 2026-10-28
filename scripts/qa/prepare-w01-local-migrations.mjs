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
const allowedIgnored = new Set(["202608050002_seed_company.sql", "20260927104500_2nya_align_portfolio_seed_with_current_site.sql", "20260831014500_consolidate_canonical_rythm_workforce.sql", "20260920213500_web_development_company_commercial_template.sql"]);
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

const recoveredSource = resolve("scripts/qa/recovered-migrations");
const recoveredHashes = new Map([["20260916070836_nail_2nya_booking_platform_foundation.sql","9c61ef81b14e2b0e8291bf83450c0611"],["20260916071435_nail_2nya_grant_hardening.sql","9b1665c6aa47509a190779023a6e563e"],["20260916071630_nail_2nya_security_performance_hardening.sql","09335c309099a96873f59ced6490f660"],["20260916072136_nail_2nya_admin_manual_booking_rpc.sql","38b8a70389f4723773a18f068c933cd2"],["20260916101116_nail_2nya_media_asset_store.sql","9267bc15004b4d0b20ac736295f72629"],["20260916101216_remove_unused_nail_2nya_media_asset_store.sql","f2dedfaabe9562af9943ee6d87fc070c"],["20260916101504_nail_2nya_public_media_chunks.sql","2bb2681383b15aced40e647f631cc063"],["20260916101706_remove_unused_nail_2nya_public_media_chunks.sql","07d7346b189508196e08fc1b479f2a1d"],["20260916103559_nail_2nya_live_booking_pwa_admin_schema_only.sql","bc7daed3dae366299accc9e420544057"],["20260916103747_nail_2nya_realtime_admin_events.sql","768a253c2bfd1c411b3ada3fd0ed2413"],["20260916113906_nail_2nya_claim_admin_grant_hardening.sql","1b54d21b29151e72cfa17894426459d3"],["20260916175126_nail_2nya_public_video_chunks_v4.sql","8977228ddc192545bb516a15b8448c83"],["20260917064924_nail_2nya_public_media_bucket.sql","a0a43614ba014ebc352230c1df807bce"],["20260917065004_nail_2nya_remove_temp_hero_upload_policy.sql","bc9d2566e955a51427cf3ab19057ccaf"],["20260927060117_2nya_customer_push_tables.sql","38cfb26c683d82ef613a3829439f943c"],["20260927060122_2nya_customer_push_rls.sql","e5cb152c8900314e10822cfb5e243486"],["20260927060133_2nya_customer_push_rpc.sql","7407a4d05f92b9ecc61277e166c06ec8"],["20260927060142_2nya_available_dates_rpc.sql","c5e3e91999fc18a594de07e86946bb59"],["20260927060158_2nya_customer_booking_pending.sql","94efc8cc8b344b5decd73ac42090a78f"],["20260927083615_2nya_admin_portfolio_gallery_v2.sql","bd13dd7ae745315ce000a8dd1760e07d"],["20260927133631_nail_2nya_contact_inbox.sql","76e8a4e225afc45af5f79a84ab683ff3"],["20260927134254_nail_2nya_contact_push_claim.sql","5986e01b229ce71a3f6498c57b6b78ad"]]);
function recoveredSources() {
  const actual = readdirSync(recoveredSource).filter(name => name.endsWith(".sql")).sort();
  assert.deepEqual(actual, [...recoveredHashes.keys()].sort(), "Unreviewed supplemental migration");
  for (const name of actual) {
    const digest = createHash("md5").update(readFileSync(join(recoveredSource, name))).digest("hex");
    assert.equal(digest, recoveredHashes.get(name), "Recovered original source checksum mismatch: " + name);
  }
  return actual;
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
  const originals = getSources();
  assert.equal(originals.length, 218, "Original source inventory changed: review baseline");
  const supplements = recoveredSources();
  assert(supplements.every(name => !originals.includes(name)), "Recovered source collides with repository source");
  const srcFiles = [...originals, ...supplements].sort();
  assert(srcFiles.includes("202608050002_seed_company.sql"), "Historical owner seed not found: review exclusion");
  assert(srcFiles.every((name) => /^[0-9]{12}(?:[0-9]{2}|[a-z])?_[a-z0-9_]+\.sql$/.test(name)),
    "Unrecognized original migration naming pattern");
  assert(srcFiles.filter((name) => /seed|fixture/i.test(name)).every((name) => allowedIgnored.has(name)),
    "Additional seed-like migration requires human review and exclusion strategy");
  const dest = resolve(target);
  const migrations = join(dest, "supabase", "migrations");
  mkdirSync(migrations, { recursive: true });
  const coreOnly = process.argv.includes("--core-smoke");
  const coreLimit = 16; // first 16 validated foundation migrations, before historical strategy backfill
  const allOrdered = replayOrder(srcFiles);
  const selected = coreOnly ? allOrdered.slice(0, coreLimit) : allOrdered;
  const mapping = [];
  let count = 0;
  const baseTime = Date.UTC(2026, 9, 25, 0, 0, 0);
  for (const name of srcFiles.filter((x) => allowedIgnored.has(x))) {
    const checksum = createHash("sha256").update(readFileSync(join(source, name))).digest("hex");
    mapping.push({ source: name, sha256: checksum, action: "excluded_live_data_dependency" });
  }
  for (const name of selected) {
    const sourceDirectory = recoveredHashes.has(name) ? recoveredSource : source;
    const content = readFileSync(join(sourceDirectory, name));
    const checksum = createHash("sha256").update(content).digest("hex");
    // Timestamped 14-digit version is CLI-compliant and increasing.
    const date = new Date(baseTime + count * 1000);
    const ver = date.toISOString().slice(0, 19).replace(/[-T:]/g, "");
    const targetName = ver + "_w01_source_" + String(count).padStart(3, "0") + ".sql";
    if (name === "202608060008_first_strategy_cycle.sql") {
      // Historical SQL is invalid against current production structure too.
      // Keep the actual source untouched. Record explicit local-only deviation.
      const src = content.toString("utf8");
      const old = "set status='completed', updated_at=now()";
      assert.equal(src.split(old).length - 1, 1, "Expected historic bad-column statement changed");
      const fixed = src.replace(old, "set status='completed'");
      writeFileSync(join(migrations, targetName), fixed);
    } else {
      copyFileSync(join(sourceDirectory, name), join(migrations, targetName));
    }
    mapping.push({ source: name, local_file: targetName, sha256: checksum, action: name === "202608060008_first_strategy_cycle.sql" ? "local_only_remove_invalid_updated_at" : "local_copy_only" });
    count++;
  }
  assert.equal(count, coreOnly ? coreLimit : srcFiles.length - allowedIgnored.size);
  assert(!mapping.some((x) => x.action === "local_copy_only" && x.source.includes("seed_company")));
  const manifest = {
    version: 1,
    cli_version: cliVersion,
    source_migration_count: srcFiles.length,
    original_repository_count: originals.length,
    recovered_source_count: supplements.length,
    recovered_source_md5: Object.fromEntries(recoveredHashes),
    recovered_schema_only: ['20260916103559_nail_2nya_live_booking_pwa_admin_schema_only.sql'],
    recovered_schema_only_omissions: 'Credential bootstrap INSERT and public profile/service/hour/gallery data updates omitted; DDL/functions/grants/publication retained unchanged.',
    local_replay_count: count,
    mode: coreOnly ? "isolated_core_tenant_smoke" : "all_schema_diagnostic",
    deliberately_unreplayed_sql_count: allOrdered.length - selected.length,
    excluded_data_seeds: [...allowedIgnored],
    warning: "Diagnostic-only replay diverges from original history: normalized filenames; reordered two preflights; skipped two real-data seeds; removed one invalid updated_at assignment in disposable copy. DO NOT apply to production.",
    mapping,
  };
  writeFileSync(join(dest, "w01-local-migration-map.json"), JSON.stringify(manifest, null, 2) + "\n", { mode: 0o600 });
  console.log("W01 local-only migration map: " + srcFiles.length + " source SQL; " + count + " replay copies; " + allowedIgnored.size + " quarantined live-data dependent SQL; mode=" + (coreOnly ? "CORE_SMOKE" : "FULL_DIAGNOSTIC"));
  console.log("W01 map file created in disposable workspace. No source file rewritten. No credentials loaded.");
  return manifest;
}
function selfTest() {
  const sources = getSources();
  assert.equal(sources.length, 218);
  assert.equal(recoveredSources().length, 22);
  assert(sources.includes("202608050002_seed_company.sql"));
  assert(allowedIgnored.size === 4);
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
