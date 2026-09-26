"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin/authorization";
import { runSeoAiReasoning, runSeoIntelligenceAgent } from "@/lib/seo/intelligence-agent";
import { runSeoMonitoringEngine } from "@/lib/seo/monitoring-engine";
import { redactSecretText } from "@/lib/security/redaction";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const SEO_ADMIN_PATH = "/admin/seo";

export async function runSeoMonitoringFromAdmin() {
  const { user } = await requirePlatformAdmin();
  let destination: string;

  try {
    const snapshot = await runSeoMonitoringEngine();
    const intelligence = runSeoIntelligenceAgent(snapshot);
    const adminSupabase = createServerSupabaseClient();

    if (!adminSupabase) throw new Error("SEO run completed but audit persistence is unavailable because the server admin client is not configured.");

    let aiReasoning: Awaited<ReturnType<typeof runSeoAiReasoning>> | null = null;
    let aiReasoningError: string | null = null;

    const { data: rythmOrganization, error: organizationError } = await adminSupabase
      .from("organizations")
      .select("id")
      .eq("slug", "rythm")
      .maybeSingle();

    if (organizationError) {
      aiReasoningError = redactSecretText(`RYTHM organization lookup failed: ${organizationError.message}`);
    } else if (!rythmOrganization?.id) {
      aiReasoningError = "RYTHM organization context is unavailable; deterministic intelligence completed without AI enrichment.";
    } else {
      try {
        aiReasoning = await runSeoAiReasoning({
          organizationId: rythmOrganization.id,
          actorUserId: user.id,
          snapshot,
          deterministicReport: intelligence,
        });
      } catch (error) {
        aiReasoningError = redactSecretText(error instanceof Error ? error.message : "AI reasoning was unavailable.");
      }
    }

    const { error } = await adminSupabase.from("audit_events").insert({
      organization_id: rythmOrganization?.id ?? null,
      actor_type: "user",
      actor_user_id: user.id,
      event_type: "seo.monitoring_run",
      object_type: "seo_monitoring_snapshot",
      object_id: snapshot.site,
      risk_level: "low",
      payload: {
        engine_version: snapshot.version,
        agent_version: intelligence.version,
        knowledge_version: intelligence.knowledgeVersion,
        site: snapshot.site,
        checked_at: snapshot.checkedAt,
        duration_ms: snapshot.durationMs,
        score: snapshot.score,
        counts: snapshot.counts,
        checks: snapshot.checks,
        intelligence_summary: intelligence.summary,
        findings: intelligence.findings,
        guardrails: intelligence.guardrails,
        ai_reasoning: aiReasoning?.outputText ?? null,
        ai_correlation_id: aiReasoning?.correlationId ?? null,
        ai_routing_mode: aiReasoning?.routingMode ?? null,
        ai_model: aiReasoning?.model ?? null,
        ai_reasoning_error: aiReasoningError,
        source: "admin_seo_monitor",
      },
    });

    if (error) throw new Error(`SEO monitoring persistence failed: ${error.message}`);

    revalidatePath(SEO_ADMIN_PATH);
    const suffix = aiReasoning ? " AI reasoning completed." : " Deterministic intelligence completed; AI enrichment was unavailable.";
    destination = `${SEO_ADMIN_PATH}?message=${encodeURIComponent(`SEO monitoring completed with health score ${snapshot.score}/100.${suffix}`)}`;
  } catch (error) {
    const message = redactSecretText(error instanceof Error ? error.message : "SEO monitoring failed.");
    destination = `${SEO_ADMIN_PATH}?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
