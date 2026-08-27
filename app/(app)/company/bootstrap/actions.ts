"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { runCompanyBootstrapDiscovery } from "@/lib/company-bootstrap/discovery";
import {
  executeCompanyBootstrapApply,
  requestCompanyBootstrapApply,
  rollbackCompanyBootstrapApply,
} from "@/lib/company-bootstrap/apply";

function text(value: FormDataEntryValue | null) {
  return String(value ?? "").trim();
}

function fail(message: string): never {
  redirect(`/company/bootstrap?error=${encodeURIComponent(message)}`);
}

function runRedirect(runId: string, message: string): never {
  redirect(
    `/company/bootstrap?run=${encodeURIComponent(runId)}&message=${encodeURIComponent(message)}`,
  );
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

  let result: Awaited<ReturnType<typeof runCompanyBootstrapDiscovery>>;
  try {
    result = await runCompanyBootstrapDiscovery({
      organizationId: context.organizationId,
      userId: context.user.id,
      integrationId,
      runId: String(runId),
    });
  } catch (discoveryError) {
    revalidatePath("/company/bootstrap");
    fail(
      discoveryError instanceof Error
        ? discoveryError.message
        : "Governed bootstrap discovery failed.",
    );
  }

  revalidatePath("/company/bootstrap");
  runRedirect(
    String(runId),
    `Read-only discovery completed through the execution gateway. Proposal ${result.proposalDigest.slice(0, 12)}… is ready for Human CEO review.`,
  );
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
  runRedirect(
    runId,
    "Exact proposal confirmed. Request the separate governed apply action when you are ready to create the company structure.",
  );
}

export async function requestBootstrapApply(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const runId = text(formData.get("runId"));
  const proposalDigest = text(formData.get("proposalDigest"));
  if (!runId || !proposalDigest)
    fail("Bootstrap run and exact proposal digest are required.");

  let request: Awaited<ReturnType<typeof requestCompanyBootstrapApply>>;
  try {
    request = await requestCompanyBootstrapApply({
      organizationId: context.organizationId,
      userId: context.user.id,
      runId,
      proposalDigest,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Bootstrap apply request failed.");
  }

  revalidatePath("/company/bootstrap");
  redirect(
    `/approvals?approval=${encodeURIComponent(request.approvalId)}&message=${encodeURIComponent(
      "Review the exact Phase 3 Company Bootstrap apply request. No changes occur until you approve it and then explicitly execute it.",
    )}`,
  );
}

export async function executeBootstrapApply(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const runId = text(formData.get("runId"));
  const executionId = text(formData.get("executionId"));
  if (!runId || !executionId) fail("Bootstrap run and approved execution are required.");

  try {
    await executeCompanyBootstrapApply({
      organizationId: context.organizationId,
      executionId,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Bootstrap apply execution failed.");
  }

  revalidatePath("/company/bootstrap");
  revalidatePath("/company");
  revalidatePath("/agents");
  runRedirect(
    runId,
    "Approved Company Bootstrap applied and verified. All created Agents remain paused and external actions remain disabled.",
  );
}

export async function rollbackBootstrapApply(formData: FormData) {
  const context = await requireOwnerOrganizationContext();
  const runId = text(formData.get("runId"));
  const executionId = text(formData.get("executionId"));
  const confirmation = text(formData.get("confirmation"));
  if (!runId || !executionId) fail("Bootstrap run and execution are required.");
  if (confirmation !== "ROLLBACK BOOTSTRAP")
    fail("Type ROLLBACK BOOTSTRAP to perform the compensating action.");

  try {
    await rollbackCompanyBootstrapApply({
      organizationId: context.organizationId,
      executionId,
      runId,
    });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Bootstrap rollback failed.");
  }

  revalidatePath("/company/bootstrap");
  revalidatePath("/company");
  revalidatePath("/agents");
  runRedirect(
    runId,
    "Bootstrap rollback completed and verified. The run returned to confirmed state and can be reviewed again.",
  );
}
