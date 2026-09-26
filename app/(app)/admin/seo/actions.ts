"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requirePlatformAdmin } from "@/lib/admin/authorization";
import { runSeoIntelligenceAgent } from "@/lib/seo/intelligence-agent";
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

    const { error } = await adminSupabase.from("audit_events").insert({
      organization_id: null,
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
        source: "admin_seo_monitor",
      },
    });

    if (error) throw new Error(`SEO monitoring persistence failed: ${error.message}`);

    revalidatePath(SEO_ADMIN_PATH);
    destination = `${SEO_ADMIN_PATH}?message=${encodeURIComponent(`SEO monitoring completed with health score ${snapshot.score}/100.`)}`;
  } catch (error) {
    const message = redactSecretText(error instanceof Error ? error.message : "SEO monitoring failed.");
    destination = `${SEO_ADMIN_PATH}?error=${encodeURIComponent(message)}`;
  }

  redirect(destination);
}
