"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { runCompanyBootstrapDiscovery } from "@/lib/company-bootstrap/discovery";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fail(message: string): never {
  redirect(`/company/bootstrap?error=${encodeURIComponent(message)}`);
}

export async function startCompanyBootstrap(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const integrationId = text(formData.get("integrationId"));
  if (!integrationId) fail("Select a connected Google Workspace integration.");

  const { data: integration, error: integrationError } = await context.supabase
    .from("organization_integrations")
    .select("id,provider_key,status,enabled,granted_scopes")
    .eq("id", integrationId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();

  if (
    integrationError ||
    !integration ||
    integration.provider_key !== "google_workspace" ||
    integration.status !== "connected" ||
    integration.enabled === false
  ) {
    fail("The selected Google Workspace connection is not available.");
  }

  const grantedScopes = Array.isArray(integration.granted_scopes)
    ? integration.granted_scopes.map((scope) => String(scope).toLowerCase())
    : [];
  const missingScopes = ["gmail.readonly", "calendar.readonly"].filter(
    (scope) => !grantedScopes.includes(scope),
  );
  if (missingScopes.length) {
    fail(
      `The Google Workspace connection is missing the Phase 3 read-only scopes: ${missingScopes.join(", ")}.`,
    );
  }

  const { data: runId, error } = await context.supabase.rpc(
    "create_company_bootstrap_run_v1",
    {
      target_org_id: context.organizationId,
      target_integration_id: integrationId,
    },
  );
  if (error || !runId)
    fail(error?.message ?? "Bootstrap discovery could not be started.");

  try {
    const result = await runCompanyBootstrapDiscovery({
      organizationId: context.organizationId,
      userId: context.user.id,
      integrationId,
      runId: String(runId),
    });
    revalidatePath("/company/bootstrap");
    redirect(
      `/company/bootstrap?run=${encodeURIComponent(String(runId))}&message=${encodeURIComponent(
        `Read-only discovery completed through the execution gateway. Proposal ${result.proposalDigest.slice(0, 12)}… is ready for Human CEO review.`,
      )}`,
    );
  } catch (discoveryError) {
    revalidatePath("/company/bootstrap");
    fail(
      discoveryError instanceof Error
        ? discoveryError.message
        : "Governed bootstrap discovery failed.",
    );
  }
}

export async function confirmCompanyBootstrap(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const runId = text(formData.get("runId"));
  const proposalDigest = text(formData.get("proposalDigest"));
  const confirmation = text(formData.get("confirmation"));

  if (!runId || !proposalDigest)
    fail("Bootstrap run and proposal digest are required.");
  if (confirmation !== "CONFIRM BOOTSTRAP")
    fail("Type CONFIRM BOOTSTRAP to confirm the exact proposal.");

  const { data, error } = await context.supabase.rpc(
    "confirm_company_bootstrap_v1",
    {
      target_run_id: runId,
      target_proposal_digest: proposalDigest,
    },
  );
  if (error || !data)
    fail(error?.message ?? "Bootstrap proposal could not be confirmed.");

  revalidatePath("/company/bootstrap");
  redirect(
    `/company/bootstrap?run=${encodeURIComponent(runId)}&message=${encodeURIComponent(
      "Exact proposal confirmed. Company changes remain blocked until the governed apply execution is approved.",
    )}`,
  );
}
