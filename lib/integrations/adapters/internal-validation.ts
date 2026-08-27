import { createClient } from "@supabase/supabase-js";
import type { IntegrationAdapter } from "@/lib/integrations/adapters/types";
import { normalizeExecutionError } from "@/lib/integrations/error-normalization";

function client() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key)
    throw new Error("Internal validation adapter is not configured.");
  return createClient(url, key, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export const internalValidationAdapter: IntegrationAdapter = {
  integrationId: "internal",
  version: "internal-validation-v2",
  supportedTools: ["internal.validation"],
  validate(context) {
    if (context.request.operation !== "validation.record.create")
      throw new Error("Unsupported internal validation operation.");
  },
  prepare() {
    return { url: new URL("https://internal.invalid/validation"), init: {} };
  },
  async execute(context) {
    const supabase = client();
    const { data, error } = await supabase
      .from("execution_validation_records")
      .upsert(
        {
          organization_id: context.request.organizationId,
          execution_request_id: context.request.executionId,
          marker: String(
            context.request.input.marker ?? "phase2-production-validation",
          ).slice(0, 120),
          created_by_user_id: context.request.userId,
        },
        { onConflict: "execution_request_id" },
      )
      .select("id")
      .single();
    if (error || !data)
      throw new Error(
        error?.message ?? "Validation record could not be created.",
      );
    return {
      rawResult: { id: data.id, created: true },
      externalReferenceId: data.id,
      rollbackReference: { type: "internal_validation_record", id: data.id },
    };
  },
  async verify(context, outcome) {
    const { data } = await client()
      .from("execution_validation_records")
      .select("id")
      .eq("id", outcome.externalReferenceId)
      .eq("organization_id", context.request.organizationId)
      .maybeSingle();
    return data
      ? { status: "verified", detail: { recordPresent: true } }
      : { status: "failed", detail: { recordPresent: false } };
  },
  normalizeError(error) {
    return normalizeExecutionError(error);
  },
  async rollback(context, reference) {
    const { error } = await client()
      .from("execution_validation_records")
      .delete()
      .eq("id", String(reference.id ?? ""))
      .eq("organization_id", context.request.organizationId);
    if (error) throw error;
    return {
      rawResult: { id: reference.id, deleted: true },
      externalReferenceId: String(reference.id ?? ""),
      rollbackReference: null,
    };
  },
  async verifyRollback(context, reference) {
    const { data, error } = await client()
      .from("execution_validation_records")
      .select("id")
      .eq("id", String(reference.id ?? ""))
      .eq("organization_id", context.request.organizationId)
      .maybeSingle();
    if (error) throw error;
    return data
      ? { status: "failed", detail: { recordPresent: true } }
      : { status: "verified", detail: { recordPresent: false } };
  },
  async healthCheck() {
    return {
      healthy: Boolean(
        process.env.NEXT_PUBLIC_SUPABASE_URL &&
          process.env.SUPABASE_SERVICE_ROLE_KEY,
      ),
      detail: "service_configuration_checked",
    };
  },
};
