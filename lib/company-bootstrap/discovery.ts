import "server-only";

import { requestToolExecution } from "@/lib/integrations/execution-gateway";
import {
  createExecutionServiceClient,
  executeApprovedToolRequest,
} from "@/lib/integrations/service-runner";
import {
  PHASE3_BOOTSTRAP_TOOL_ID,
  registerPhase3BootstrapTools,
} from "@/lib/company-bootstrap/register-tools";
import { synthesizeCompanyBootstrapProposal } from "@/lib/company-bootstrap/proposal";

function environment(): "development" | "preview" | "production" {
  if (process.env.VERCEL_ENV === "production") return "production";
  if (process.env.VERCEL_ENV === "preview") return "preview";
  return "development";
}

function safeError(error: unknown) {
  const raw = error instanceof Error ? error.message : "Bootstrap discovery failed.";
  return raw
    .replace(/Bearer\s+[A-Za-z0-9._~+/=-]+/gi, "Bearer [REDACTED]")
    .replace(/[A-Za-z0-9_-]{24,}/g, "[REDACTED]")
    .slice(0, 500);
}

function asRecord(value: unknown): Record<string, any> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, any>)
    : {};
}

async function ensurePilotRollout(
  service: ReturnType<typeof createExecutionServiceClient>,
  input: { organizationId: string; userId: string },
) {
  const env = environment();
  const { data: existing, error: readError } = await service
    .from("execution_rollout_config")
    .select("id,execution_mode,kill_switch")
    .eq("organization_id", input.organizationId)
    .eq("tool_id", PHASE3_BOOTSTRAP_TOOL_ID)
    .eq("integration_key", "")
    .eq("environment", env)
    .maybeSingle();

  if (readError) throw new Error("Bootstrap rollout policy could not be read.");
  if (existing) {
    if (existing.kill_switch)
      throw new Error("Phase 3 bootstrap discovery is disabled by the company kill switch.");
    if (!["limited_enforced", "enforced"].includes(existing.execution_mode))
      throw new Error(
        `Phase 3 bootstrap discovery is currently ${existing.execution_mode}. Enable the dedicated read-only rollout before discovery.`,
      );
    return existing;
  }

  // Clicking "Start governed discovery" is the Human CEO's explicit opt-in for this
  // dedicated read-only pilot tool. Do not change any broader Google Workspace rollout.
  const { data: created, error } = await service
    .from("execution_rollout_config")
    .insert({
      organization_id: input.organizationId,
      tool_id: PHASE3_BOOTSTRAP_TOOL_ID,
      integration_key: "",
      environment: env,
      execution_mode: "limited_enforced",
      kill_switch: false,
      policy_version: "execution-policy-v2.0.0",
      reason: "Phase 3 Gmail + Google Calendar read-only bootstrap pilot",
      updated_by_user_id: input.userId,
      updated_at: new Date().toISOString(),
    })
    .select("id,execution_mode,kill_switch")
    .single();

  if (error || !created)
    throw new Error("Dedicated Phase 3 read-only rollout could not be enabled.");

  const { error: auditError } = await service.from("audit_events").insert({
    organization_id: input.organizationId,
    actor_type: "user",
    actor_user_id: input.userId,
    event_type: "company_bootstrap.discovery_rollout_enabled",
    object_type: "execution_rollout_config",
    object_id: created.id,
    risk_level: "low",
    payload: {
      tool_id: PHASE3_BOOTSTRAP_TOOL_ID,
      execution_mode: "limited_enforced",
      read_only: true,
      pilot: "gmail_google_calendar",
    },
  });
  if (auditError)
    throw new Error("Bootstrap rollout was enabled but its audit event could not be recorded.");

  return created;
}

async function executeRead(
  service: ReturnType<typeof createExecutionServiceClient>,
  input: {
    organizationId: string;
    userId: string;
    integrationId: string;
    runId: string;
    capabilityKey: "gmail.bootstrap.read" | "calendar.bootstrap.read";
    payload: Record<string, unknown>;
  },
) {
  const request = await requestToolExecution(service, {
    organizationId: input.organizationId,
    userId: input.userId,
    integrationId: input.integrationId,
    toolId: PHASE3_BOOTSTRAP_TOOL_ID,
    capabilityKey: input.capabilityKey,
    targetRef: input.runId,
    input: input.payload,
    persistedInput: input.payload,
    payloadSummary: {
      purpose: "company_auto_bootstrap",
      source:
        input.capabilityKey === "gmail.bootstrap.read"
          ? "gmail_metadata"
          : "google_calendar_metadata",
      read_only: true,
      bounded: true,
    },
    originatingRequestId: `company-bootstrap:${input.runId}:${input.capabilityKey}`,
    requestedBy: "user",
    authoritySource: "human",
    intent: "company_bootstrap_discovery",
  });

  if (!request?.id) throw new Error("Governed bootstrap read request was not recorded.");
  if (request.status === "simulated")
    throw new Error("Bootstrap discovery is still in simulation mode.");
  if (request.status === "denied")
    throw new Error(
      `Bootstrap discovery was denied by policy${request.policy_reason_code ? `: ${request.policy_reason_code}` : "."}`,
    );
  if (request.status === "waiting_approval")
    throw new Error("Unexpected approval was requested for a read-only bootstrap operation.");
  if (request.status !== "authorized" && request.status !== "approved")
    throw new Error(`Bootstrap discovery is not executable from status ${request.status}.`);

  await executeApprovedToolRequest(request.id);

  const { data: completed, error } = await service
    .from("tool_execution_requests")
    .select("id,status,safe_result,result_metadata,verification_result,sanitized_error")
    .eq("id", request.id)
    .eq("organization_id", input.organizationId)
    .maybeSingle();

  if (error || !completed || completed.status !== "succeeded")
    throw new Error(completed?.sanitized_error || "Governed bootstrap read did not complete successfully.");

  return {
    executionId: completed.id,
    result: asRecord(completed.safe_result ?? completed.result_metadata),
    verification: completed.verification_result,
  };
}

export async function runCompanyBootstrapDiscovery(input: {
  organizationId: string;
  userId: string;
  integrationId: string;
  runId: string;
}) {
  registerPhase3BootstrapTools();
  const service = createExecutionServiceClient();

  try {
    await ensurePilotRollout(service, input);

    const [gmail, calendar] = await Promise.all([
      executeRead(service, {
        ...input,
        capabilityKey: "gmail.bootstrap.read",
        payload: { maxResults: 50, days: 90 },
      }),
      executeRead(service, {
        ...input,
        capabilityKey: "calendar.bootstrap.read",
        payload: {
          calendarId: "primary",
          maxResults: 100,
          lookbackDays: 180,
          lookaheadDays: 90,
        },
      }),
    ]);

    const gmailResult = gmail.result;
    const calendarResult = calendar.result;
    const messages = Array.isArray(gmailResult.messages) ? gmailResult.messages : [];
    const events = Array.isArray(calendarResult.events) ? calendarResult.events : [];
    const proposal = synthesizeCompanyBootstrapProposal({
      accountEmail:
        typeof gmailResult.accountEmail === "string"
          ? gmailResult.accountEmail
          : null,
      emails: messages.slice(0, 50),
      calendarEvents: events.slice(0, 100),
    });

    // Persist only compact source provenance and the proposal's bounded evidence summary.
    // The provider metadata itself remains governed execution telemetry, not a bootstrap source dump.
    const sourceSnapshot = {
      gmail_execution_id: gmail.executionId,
      calendar_execution_id: calendar.executionId,
      gmail_metadata_count: messages.length,
      calendar_event_count: events.length,
      raw_email_bodies_persisted: false,
      attachments_persisted: false,
      calendar_descriptions_persisted: false,
      calendar_locations_persisted: false,
    };
    const sourceEvidence = {
      confidence: proposal.confidence,
      evidence_summary: proposal.evidence_summary,
      company_hints: proposal.company_hints,
    };

    const { data: digest, error: recordError } = await service.rpc(
      "record_company_bootstrap_discovery_service_v1",
      {
        target_run_id: input.runId,
        target_source_snapshot: sourceSnapshot,
        target_source_evidence: sourceEvidence,
        target_proposal: proposal,
      },
    );
    if (recordError || !digest)
      throw new Error("Bootstrap proposal could not be committed after governed discovery.");

    return {
      runId: input.runId,
      status: "proposed" as const,
      proposalDigest: String(digest),
      gmailExecutionId: gmail.executionId,
      calendarExecutionId: calendar.executionId,
      proposal,
    };
  } catch (error) {
    const detail = safeError(error);
    await service
      .from("company_bootstrap_runs")
      .update({
        status: "failed",
        failure_code: "DISCOVERY_FAILED",
        safe_failure_detail: detail,
        updated_at: new Date().toISOString(),
      })
      .eq("id", input.runId)
      .eq("organization_id", input.organizationId)
      .eq("status", "collecting");

    await service.from("audit_events").insert({
      organization_id: input.organizationId,
      actor_type: "system",
      event_type: "company_bootstrap.discovery_failed",
      object_type: "company_bootstrap_run",
      object_id: input.runId,
      risk_level: "medium",
      payload: { failure_code: "DISCOVERY_FAILED", safe_detail: detail },
    });
    throw new Error(detail);
  }
}
