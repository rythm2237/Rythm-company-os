import { NextResponse } from "next/server";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

export async function GET() {
  const config = getRuntimeConfig();

  return NextResponse.json({
    service: "RYTHM Company OS",
    status: "ok",
    timestamp: new Date().toISOString(),
    runtime: {
      environment: config.environment,
      supabase: config.supabaseConfigured ? "configured" : "pending",
      openai: config.openAIConfigured ? "configured" : "pending",
      agentExecution: config.agentExecutionEnabled ? "enabled" : "disabled",
      externalActions: config.externalActionsEnabled ? "enabled" : "disabled",
      monthlyAiBudgetUsd: config.monthlyAiBudgetUsd,
    },
  });
}
