#!/usr/bin/env node
// W01 offline baseline checker. No network, credentials, or database writes.
import assert from "node:assert/strict";
import { readFileSync, readdirSync } from "node:fs";
import { resolve } from "node:path";

const defaultPath = "docs/qa/W01_BASELINE_SNAPSHOT.json";
const readJson = (file) => JSON.parse(readFileSync(resolve(file), "utf8"));
const sorted = (list) => [...list].sort((a, b) => a.localeCompare(b));
const records = (list) => list.map(({ version, name }) => version + "_" + name);
const sha = /^[a-f0-9]{40}$/;
const projectRef = /^[a-z0-9]{20}$/;

function validateBaseline(e) {
  assert.equal(e.version, 1);
  assert.match(e.production.github.main_sha, sha);
  assert.equal(e.production.vercel.git_sha, e.production.github.main_sha, "production/main SHA differs");
  assert.equal(e.production.vercel.git_branch, "main");
  assert.equal(e.production.vercel.target, "production");
  assert.equal(e.production.vercel.status, "READY");
  assert(e.production.vercel.aliases.includes("rythm-os.com"), "production alias unverified");
  assert.match(e.production.supabase.project_ref, projectRef);
  assert.equal(e.production.supabase.status, "ACTIVE_HEALTHY");
  assert.match(e.production.supabase.schema_fingerprint_md5, /^[a-f0-9]{32}$/);
  assert.equal(e.production.supabase.schema_inventory_lines > 0, true);

  const inventory = sorted(readdirSync(resolve("supabase/migrations"))
    .filter((name) => name.endsWith(".sql")).map((name) => name.slice(0, -4)));
  const recorded = e.migrations.repository_files;
  assert.deepEqual(inventory, sorted(recorded), "repository migration file drift");
  assert.equal(new Set(recorded).size, recorded.length, "duplicate repository filenames");
  const production = records(e.migrations.production_records);
  assert.equal(new Set(production).size, production.length, "duplicate production migrations");
  const inRepo = new Set(recorded), inProd = new Set(production);
  const nameRepo = new Set(recorded.map((name) => name.replace(/^[^_]+_/, "")));
  const nameProd = new Set(e.migrations.production_records.map((entry) => entry.name));
  const summary = {
    repository: recorded.length,
    production: production.length,
    exact_match: production.filter((name) => inRepo.has(name)).length,
    repository_only_version_name: recorded.filter((name) => !inProd.has(name)).length,
    production_only_version_name: production.filter((name) => !inRepo.has(name)).length,
    repository_only_name: recorded.filter((name) => !nameProd.has(name.replace(/^[^_]+_/, ""))).length,
    production_only_name: e.migrations.production_records.filter((entry) => !nameRepo.has(entry.name)).length,
  };
  assert.deepEqual(summary, e.migrations.summary, "migration drift evidence changed");
  return summary;
}

function validateStaging(a, baseline) {
  const prod = baseline.production.supabase;
  const stage = a.staging;
  assert(stage && typeof stage === "object", "missing staging");
  assert.equal(a.version, 1);
  assert.equal(stage.ref, baseline.staging_candidate.project_ref, "unexpected staging project");
  assert.notEqual(stage.ref, prod.project_ref, "production Supabase ref forbidden");
  assert.match(stage.ref, projectRef);
  assert.equal(stage.status, "ACTIVE_HEALTHY", "staging project inactive");
  assert.equal(stage.url, "https://" + stage.ref + ".supabase.co", "staging URL/project mismatch");
  assert.equal(stage.contains_only_synthetic_data, true, "data isolation not attested");
  assert.equal(stage.external_actions_enabled, false, "outbound actions not disabled");
  assert.equal(stage.agent_execution_enabled, false, "agent execution not disabled");
  assert.equal(stage.payment_live_mode_enabled, false, "live payments not disabled");
  assert.equal(stage.customer_notifications_enabled, false, "external notifications not disabled");
  assert.equal(stage.schema_fingerprint_md5, prod.schema_fingerprint_md5, "physical schema mismatch");
  assert.equal(stage.schema_inventory_lines, prod.schema_inventory_lines, "schema inventory size mismatch");
  assert.deepEqual(sorted(records(stage.migrations)), sorted(records(baseline.migrations.production_records)),
    "database migration history differs from production");
  assert.match(stage.preview_url, /^https:\/\/[^/]+\.vercel\.app$/, "isolated preview URL required");
  assert.notEqual(stage.preview_url, "https://rythm-os.com");
  assert.equal(stage.runtime_supabase_ref, stage.ref, "preview points to wrong Supabase project");
  assert.equal(stage.live_smoke_passed, true, "staging boot/smoke not demonstrated");
  assert.equal(stage.provenance_reviewed, true, "independent evidence review required");
  return true;
}

function testGuards(e) {
  validateBaseline(e);
  const fake = {
    version: 1,
    staging: {
      ref: e.staging_candidate.project_ref,
      status: "ACTIVE_HEALTHY",
      url: "https://" + e.staging_candidate.project_ref + ".supabase.co",
      contains_only_synthetic_data: true,
      external_actions_enabled: false,
      agent_execution_enabled: false,
      payment_live_mode_enabled: false,
      customer_notifications_enabled: false,
      schema_fingerprint_md5: e.production.supabase.schema_fingerprint_md5,
      schema_inventory_lines: e.production.supabase.schema_inventory_lines,
      migrations: e.migrations.production_records,
      preview_url: "https://staging-example.vercel.app",
      runtime_supabase_ref: e.staging_candidate.project_ref,
      live_smoke_passed: true,
      provenance_reviewed: true,
    },
  };
  assert.equal(validateStaging(fake, e), true);
  for (const tamper of [
    { ref: e.production.supabase.project_ref },
    { runtime_supabase_ref: e.production.supabase.project_ref },
    { external_actions_enabled: true },
    { contains_only_synthetic_data: false },
    { schema_fingerprint_md5: "0".repeat(32) },
    { migrations: [] },
    { live_smoke_passed: false },
    { provenance_reviewed: false },
  ]) {
    assert.throws(() => validateStaging({ ...fake, staging: { ...fake.staging, ...tamper } }, e));
  }
  console.log("W01 PASS: eight staging tamper scenarios rejected (in-memory only)");
}

const args = process.argv.slice(2);
const baselineFile = args.find((arg) => arg.endsWith(".json") && !arg.includes("staging-attestation")) ?? defaultPath;
try {
  const e = readJson(baselineFile);
  const summary = validateBaseline(e);
  console.log("W01 PASS: offline snapshot, pinned production SHA, migration inventory and drift metrics");
  console.log("W01 MIGRATIONS: " + JSON.stringify(summary));
  if (args.includes("--self-test")) testGuards(e);
  const at = args.indexOf("--staging");
  if (at >= 0) {
    if (!args[at + 1]) throw new Error("missing staging attestation path");
    const attestation = readJson(args[at + 1]);
    const prohibited = /(service.role|secret|api.key|password|authorization|access.token)/i;
    if (prohibited.test(JSON.stringify(Object.keys(attestation.staging ?? {})))) {
      throw new Error("credential-like fields in attestation");
    }
    validateStaging(attestation, e);
    console.log("W01 PASS: provided staging attestation internally consistent; inspect independent live evidence");
  } else {
    console.log("W01 BLOCKED: live staging boot/migration/preview isolation not tested by offline command");
  }
} catch (error) {
  console.error("W01 FAIL: " + (error instanceof Error ? error.message : String(error)));
  process.exitCode = 1;
}
