import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { synthesizeCompanyBootstrapProposal } from "../lib/company-bootstrap/proposal";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20260827133000_phase3_company_auto_bootstrap_foundation.sql");
const phase2Gateway = read("lib/integrations/execution-gateway.ts");
const providerExecutors = read("lib/integrations/provider-executors.ts");
const registry = read("lib/integrations/registry.ts");

assert.match(migration, /create table if not exists public\.company_bootstrap_runs/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /public\.is_org_owner\(organization_id\)/i);
assert.match(migration, /record_company_bootstrap_discovery_service_v1/i);
assert.match(migration, /Service role required/i);
assert.match(migration, /proposal_digest/i);
assert.match(migration, /Proposal changed; review the latest proposal before confirming/i);
assert.match(migration, /execution_required', true/i);
assert.doesNotMatch(migration, /gmail\.send|calendar\.write/i);

// Phase 3 must build on the governed Phase 2 execution path rather than introduce a direct provider lane.
assert.match(phase2Gateway, /requestToolExecution/);
assert.match(providerExecutors, /executeGoogle/);
assert.match(registry, /google_workspace\.calendar/);
assert.match(registry, /google_workspace\.email/);

const proposal = synthesizeCompanyBootstrapProposal({
  accountEmail: "ceo@example-company.com",
  emails: [
    { id: "1", from: "client@customer-a.com", subject: "Customer proposal and pricing review" },
    { id: "2", from: "dev@example-company.com", subject: "API release and deployment plan" },
    { id: "3", from: "finance@example-company.com", subject: "Invoice and budget review" },
    { id: "4", from: "ops@example-company.com", subject: "Operations workflow planning" },
  ],
  calendarEvents: [
    { id: "c1", summary: "Product sprint planning", attendees: ["dev@example-company.com"] },
    { id: "c2", summary: "Customer demo", attendees: ["buyer@customer-a.com"] },
  ],
});

assert.equal(proposal.version, "phase3-pilot-v1");
assert.equal(proposal.mode, "proposal_only");
assert.equal(proposal.sources.raw_email_bodies_persisted, false);
assert.equal(proposal.sources.attachments_persisted, false);
assert.equal(proposal.governance.human_ceo_confirmation_required, true);
assert.equal(proposal.governance.external_actions_allowed, false);
assert.equal(proposal.governance.agents_initial_status, "paused");
assert.ok(proposal.proposed_structure.departments.length >= 2);
assert.ok(proposal.proposed_structure.agents.length >= 2);
assert.ok(proposal.proposed_structure.agents.every((agent) => agent.external_actions_allowed === false));
assert.ok(proposal.proposed_structure.agents.every((agent) => agent.initial_status === "paused"));

console.log("Phase 3 Company Auto-Bootstrap foundation validation passed.");
