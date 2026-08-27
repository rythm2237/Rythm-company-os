import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import { synthesizeCompanyBootstrapProposal } from "../lib/company-bootstrap/proposal";

const root = process.cwd();
const read = (relative: string) => fs.readFileSync(path.join(root, relative), "utf8");

const migration = read("supabase/migrations/20260827133000_phase3_company_auto_bootstrap_foundation.sql");
const catalog = read("supabase/migrations/20260827143000_phase3_bootstrap_tool_catalog.sql");
const phase2Gateway = read("lib/integrations/execution-gateway.ts");
const providerExecutors = read("lib/integrations/provider-executors.ts");
const registry = read("lib/integrations/registry.ts");
const bootstrapTools = read("lib/company-bootstrap/register-tools.ts");
const discovery = read("lib/company-bootstrap/discovery.ts");
const actions = read("app/(app)/company/bootstrap/actions.ts");

assert.match(migration, /create table if not exists public\.company_bootstrap_runs/i);
assert.match(migration, /enable row level security/i);
assert.match(migration, /public\.is_org_owner\(organization_id\)/i);
assert.match(migration, /record_company_bootstrap_discovery_service_v1/i);
assert.match(migration, /Service role required/i);
assert.match(migration, /proposal_digest/i);
assert.match(migration, /Proposal changed; review the latest proposal before confirming/i);
assert.match(migration, /execution_required', true/i);
assert.doesNotMatch(migration, /gmail\.send|calendar\.write/i);

// Phase 3 must build on the governed Phase 2 execution path rather than introduce an ungoverned lane.
assert.match(phase2Gateway, /requestToolExecution/);
assert.match(providerExecutors, /executeGoogle/);
assert.match(registry, /google_workspace\.calendar/);
assert.match(registry, /google_workspace\.email/);
assert.match(discovery, /requestToolExecution/);
assert.match(discovery, /executeApprovedToolRequest/);
assert.match(discovery, /limited_enforced/);
assert.match(discovery, /company_bootstrap_discovery/);
assert.doesNotMatch(discovery, /gmail\.googleapis\.com|www\.googleapis\.com/);

// The dedicated bootstrap adapter is strictly metadata/read-only and bounded.
assert.match(bootstrapTools, /google_workspace\.bootstrap/);
assert.match(bootstrapTools, /gmail\.bootstrap\.read/);
assert.match(bootstrapTools, /calendar\.bootstrap\.read/);
assert.match(bootstrapTools, /format=metadata/);
assert.match(bootstrapTools, /metadataHeaders=From/);
assert.match(bootstrapTools, /metadataHeaders=Subject/);
assert.match(bootstrapTools, /rawBodiesPersisted: false/);
assert.match(bootstrapTools, /attachmentsPersisted: false/);
assert.match(bootstrapTools, /descriptionsPersisted: false/);
assert.match(bootstrapTools, /locationsPersisted: false/);
assert.match(bootstrapTools, /Math\.min\(Number\(context\.request\.input\.maxResults/);
assert.doesNotMatch(bootstrapTools, /messages\/send|calendar\.write|email\.send/);

assert.match(catalog, /'google_workspace\.bootstrap'/);
assert.match(catalog, /'gmail\.bootstrap\.read'/);
assert.match(catalog, /'calendar\.bootstrap\.read'/);
assert.match(catalog, /'gmail\.readonly'/);
assert.match(catalog, /'calendar\.readonly'/);
assert.match(catalog, /'read'/);
assert.match(catalog, /external_side_effect[\s\S]*false/);

// User initiation validates least-privilege scopes before creating a run.
assert.match(actions, /gmail\.readonly/);
assert.match(actions, /calendar\.readonly/);
assert.match(actions, /runCompanyBootstrapDiscovery/);

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

console.log("Phase 3 Company Auto-Bootstrap governed discovery validation passed.");
