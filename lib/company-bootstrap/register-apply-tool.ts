import { createClient } from "@supabase/supabase-js";
import { internalValidationAdapter } from "@/lib/integrations/adapters/internal-validation";
import type { AdapterContext } from "@/lib/integrations/adapters/types";
import { normalizeExecutionError } from "@/lib/integrations/error-normalization";
import { TOOL_REGISTRY, type ToolMetadata } from "@/lib/integrations/registry";

const TOOL_ID = "internal.company_bootstrap";
let registered = false;

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Company bootstrap adapter is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export function registerPhase3BootstrapApplyTool() {
  if (registered) return;

  const tool: ToolMetadata = {
    toolId: TOOL_ID,
    integrationId: "internal",
    name: "RYTHM Company Bootstrap Apply",
    version: "3.0.0-pilot",
    category: "internal_control",
    adapterVersion: "internal-company-bootstrap-v1",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "company_bootstrap.apply": {
        operation: "company_bootstrap.apply",
        readWrite: "write",
        external: false,
        riskLevel: "high",
        riskCeiling: "high",
        approvalPolicy: "human_ceo_required",
        reversibility: "reversible",
        dataSensitivity: "confidential",
        externalSideEffect: false,
        financialImpact: false,
        requiredAgentPermissions: ["apply_company_bootstrap"],
        requiredUserPermissions: ["privileged"],
        requiredScopes: [],
        idempotencySupported: true,
        timeoutMs: 30_000,
        retryPolicy: { maxAttempts: 1, baseDelayMs: 250, maxDelayMs: 250 },
        rateLimit: {
          userPerHour: 5,
          organizationPerHour: 10,
          agentPerHour: 5,
          integrationPerHour: 10,
          operationPerHour: 10,
        },
        allowedEnvironments: ["development", "preview", "production"],
        rollbackSupported: true,
      },
    },
  };
  TOOL_REGISTRY[TOOL_ID] = tool;

  const originalValidate = internalValidationAdapter.validate.bind(internalValidationAdapter);
  const originalExecute = internalValidationAdapter.execute.bind(internalValidationAdapter);
  const originalVerify = internalValidationAdapter.verify.bind(internalValidationAdapter);
  const originalRollback = internalValidationAdapter.rollback?.bind(internalValidationAdapter);
  const originalVerifyRollback = internalValidationAdapter.verifyRollback?.bind(internalValidationAdapter);

  Object.assign(internalValidationAdapter, {
    version: "internal-validation-v2+company-bootstrap-v1",
    supportedTools: [...new Set([...internalValidationAdapter.supportedTools, TOOL_ID])],
    validate(context: AdapterContext) {
      if (context.request.tool === TOOL_ID) {
        if (context.request.operation !== "company_bootstrap.apply")
          throw new Error("Unsupported Company Bootstrap operation.");
        const runId = String(context.request.input.runId ?? "");
        const proposalDigest = String(context.request.input.proposalDigest ?? "");
        if (!runId || !proposalDigest)
          throw new Error("Bootstrap run and exact proposal digest are required.");
        return;
      }
      return originalValidate(context);
    },
    async execute(context: AdapterContext) {
      if (context.request.tool !== TOOL_ID)
        return originalExecute(context, { url: new URL("https://internal.invalid/delegated"), init: {} });

      const runId = String(context.request.input.runId);
      const proposalDigest = String(context.request.input.proposalDigest);
      const supabase = client();
      const { data: run, error: runError } = await supabase
        .from("company_bootstrap_runs")
        .select("id,organization_id,status,proposal_digest,confirmed_by_user_id,confirmed_at")
        .eq("id", runId)
        .eq("organization_id", context.request.organizationId)
        .maybeSingle();
      if (
        runError ||
        !run ||
        run.status !== "confirmed" ||
        !run.confirmed_by_user_id ||
        !run.confirmed_at ||
        run.proposal_digest !== proposalDigest
      ) {
        throw new Error("The confirmed bootstrap proposal is no longer eligible for apply.");
      }

      const { data, error } = await supabase.rpc("apply_company_bootstrap_service_v1", {
        target_run_id: runId,
        target_execution_id: context.request.executionId,
      });
      if (error || !data)
        throw new Error(error?.message ?? "Confirmed bootstrap proposal could not be applied.");

      return {
        rawResult: data,
        externalReferenceId: runId,
        rollbackReference: {
          type: "company_bootstrap_apply",
          runId,
          applyExecutionId: context.request.executionId,
          proposalDigest,
        },
      };
    },
    async verify(context: AdapterContext, outcome: any) {
      if (context.request.tool !== TOOL_ID) return originalVerify(context, outcome);
      const { data, error } = await client()
        .from("company_bootstrap_runs")
        .select("status,proposal_digest,apply_execution_id,applied_resources")
        .eq("id", String(context.request.input.runId ?? ""))
        .eq("organization_id", context.request.organizationId)
        .maybeSingle();
      if (
        error ||
        !data ||
        data.status !== "applied" ||
        data.proposal_digest !== String(context.request.input.proposalDigest ?? "") ||
        data.apply_execution_id !== context.request.executionId
      ) {
        return { status: "failed" as const, detail: { appliedStateVerified: false } };
      }
      return {
        status: "verified" as const,
        detail: {
          appliedStateVerified: true,
          resourcesRecorded: Boolean(data.applied_resources),
        },
      };
    },
    normalizeError(error: unknown) {
      return normalizeExecutionError(error);
    },
    async rollback(context: AdapterContext, reference: Record<string, unknown>) {
      if (context.request.tool !== TOOL_ID) {
        if (!originalRollback) throw new Error("Rollback is unavailable.");
        return originalRollback(context, reference);
      }
      if (reference.type !== "company_bootstrap_apply")
        throw new Error("Invalid Company Bootstrap rollback reference.");
      const runId = String(reference.runId ?? "");
      const applyExecutionId = String(reference.applyExecutionId ?? "");
      const { data, error } = await client().rpc("rollback_company_bootstrap_service_v1", {
        target_run_id: runId,
        target_apply_execution_id: applyExecutionId,
      });
      if (error || !data)
        throw new Error(error?.message ?? "Company Bootstrap rollback failed.");
      return {
        rawResult: data,
        externalReferenceId: runId,
        rollbackReference: null,
      };
    },
    async verifyRollback(context: AdapterContext, reference: Record<string, unknown>, outcome: any) {
      if (context.request.tool !== TOOL_ID) {
        if (!originalVerifyRollback)
          return { status: "not_verified" as const, detail: { reason: "rollback_verifier_unavailable" } };
        return originalVerifyRollback(context, reference, outcome);
      }
      const { data, error } = await client()
        .from("company_bootstrap_runs")
        .select("status,rolled_back_at,applied_resources")
        .eq("id", String(reference.runId ?? ""))
        .eq("organization_id", context.request.organizationId)
        .maybeSingle();
      const resources = data?.applied_resources as Record<string, unknown> | null;
      const agentIds = Array.isArray(resources?.agent_ids) ? resources?.agent_ids : [];
      const departmentIds = Array.isArray(resources?.department_ids) ? resources?.department_ids : [];
      return !error && data?.status === "confirmed" && Boolean(data.rolled_back_at) && !agentIds.length && !departmentIds.length
        ? { status: "verified" as const, detail: { restoredToConfirmed: true } }
        : { status: "failed" as const, detail: { restoredToConfirmed: false } };
    },
  });

  registered = true;
}

export const PHASE3_BOOTSTRAP_APPLY_TOOL_ID = TOOL_ID;
