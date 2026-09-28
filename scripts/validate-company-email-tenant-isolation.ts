import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

const route = readFileSync(
  "app/api/communication/outbound/resend/route.ts",
  "utf8",
);
const hardening = readFileSync(
  "supabase/migrations/20260928154000_company_email_tenant_hardening.sql",
  "utf8",
).toLowerCase();
const fkSemantics = readFileSync(
  "supabase/migrations/20260928154100_tenant_fk_delete_semantics.sql",
  "utf8",
).toLowerCase();

function requireText(source: string, value: string, label: string) {
  assert.ok(source.includes(value), `${label}: missing ${value}`);
}

// Customer-selected company identity drives the visible outbound sender.
requireText(route, "safeEmailDisplayName", "tenant sender branding helper");
requireText(route, '.from("organizations")', "organization identity lookup");
requireText(
  route,
  "from: `${safeEmailDisplayName(organization.name)} <${mailbox.address}>`",
  "company-branded From header",
);
requireText(route, 'sendingDomain: "rythm-os.com"', "verified sending domain status");
requireText(route, 'approvalRequired: true', "outbound governance remains explicit");

// New company namespace + automatic mailboxes.
requireText(hardening, "allocate_organization_email_identity_v1", "race-safe namespace allocator");
requireText(hardening, "pg_advisory_xact_lock", "concurrent slug claim serialization");
requireText(hardening, "new.primary_email := v_candidate || '@rythm-os.com'", "primary address allocation");
requireText(hardening, "new.slug || '@' || v_transport_domain", "bare primary mailbox");
for (const mailbox of ["contact", "support", "sales", "finance", "management"]) {
  requireText(hardening, `('${mailbox}'`, `${mailbox} mailbox provisioning`);
}
requireText(hardening, "communication_mailboxes_lower_address_uidx", "global mailbox uniqueness");
requireText(hardening, "organizations_lower_primary_email_uidx", "global primary email uniqueness");

// Tenant data graph cannot link across organization boundaries.
for (const constraint of [
  "agents_organization_department_tenant_fkey",
  "agents_organization_reports_to_tenant_fkey",
  "departments_organization_manager_tenant_fkey",
  "departments_organization_parent_tenant_fkey",
]) {
  requireText(hardening, constraint, `${constraint} creation`);
  requireText(fkSemantics, constraint, `${constraint} final semantics`);
}
assert.ok(
  !fkSemantics.includes("on delete set null"),
  "final composite tenant constraints must not null organization_id",
);

// Medium-risk messages map to a valid thread priority while keeping medium risk.
requireText(hardening, "v_priority := 'normal'", "valid communication thread priority");
requireText(hardening, "v_risk := 'medium'", "medium governance risk retained");

// Trigger-only definer functions are not exposed as public RPCs.
for (const signature of [
  "public.allocate_organization_email_identity_v1()",
  "public.provision_default_communication_workspace()",
  "public.communication_runtime_triage()",
]) {
  requireText(
    hardening,
    `revoke all on function ${signature} from public, anon, authenticated`,
    `${signature} RPC hardening`,
  );
  requireText(
    hardening,
    `grant execute on function ${signature} to service_role`,
    `${signature} service execution`,
  );
}

console.log("Company email and tenant isolation validation passed.");
