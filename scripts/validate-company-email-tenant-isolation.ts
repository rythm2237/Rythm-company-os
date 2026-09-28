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
const outboundEnablement = readFileSync(
  "supabase/migrations/20260928170000_enable_managed_outbound_email.sql",
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
requireText(
  route,
  '.from("communication_provider_connections")',
  "tenant outbound provider lookup",
);
requireText(
  route,
  'providerConnection?.status !== "connected"',
  "connected provider enforcement",
);
requireText(
  route,
  "providerConnection.outbound_enabled !== true",
  "tenant outbound enablement enforcement",
);

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

// Managed outbound is enabled, but auto-send stays disabled and approval-required.
requireText(outboundEnablement, "outbound_enabled = true", "existing tenant outbound activation");
requireText(outboundEnablement, "true, true", "new tenant inbound/outbound activation");
requireText(outboundEnablement, "status = 'connected'", "provider connected state");
requireText(outboundEnablement, "auto_send_enabled = false", "auto-send remains disabled");
requireText(outboundEnablement, "default_approval_mode = 'approval_required'", "approval requirement retained");
requireText(outboundEnablement, "'transport_state', 'connected'", "connected transport metadata");

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
requireText(
  outboundEnablement,
  "revoke all on function public.provision_default_communication_workspace() from public, anon, authenticated",
  "outbound provisioning function RPC hardening",
);
requireText(
  outboundEnablement,
  "grant execute on function public.provision_default_communication_workspace() to service_role",
  "outbound provisioning function service execution",
);

console.log("Company email and tenant isolation validation passed.");
