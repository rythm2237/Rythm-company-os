import Link from "next/link";
import { redirect } from "next/navigation";
import { requireOrganizationContext } from "@/lib/auth/organization-context";
import { loadRoutingRollout } from "@/lib/ai/routing-rollout-store";
import { getRuntimeConfig } from "@/lib/runtime-config";

export const dynamic = "force-dynamic";

type RoutingRow = {
  id: string;
  request_id: string;
  agent_id: string | null;
  task_type: string | null;
  operation_type: string | null;
  detected_language: string | null;
  response_language: string | null;
  complexity: string | null;
  risk_level: string | null;
  selected_model_tier: string | null;
  provider: string | null;
  provider_model: string | null;
  reasoning_level: string | null;
  routing_confidence: number | null;
  routing_source: string | null;
  escalation_index: number;
  latency_ms: number | null;
  estimated_cost_usd: number | null;
  actual_cost_usd: number | null;
  routing_mode: "off" | "shadow" | "enforced";
  proposed_model_tier: string | null;
  proposed_provider: string | null;
  proposed_model: string | null;
  actual_model_tier: string | null;
  actual_provider: string | null;
  actual_model: string | null;
  reason_codes: string[];
  provider_latency_ms: number | null;
  gateway_latency_ms: number | null;
  router_version: string | null;
  policy_version: string | null;
  execution_status: string;
  validation_result: string | null;
  created_at: string;
};

type AgentRow = { id: string; name: string; role_title: string };

const fmt = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const money = (value: number) => `$${value.toFixed(value < 0.01 ? 5 : 3)}`;

export default async function RoutingObservabilityPage() {
  const context = await requireOrganizationContext();
  if (context.role !== "owner" && context.role !== "admin") redirect("/command-center?error=Owner%20or%20admin%20authorization%20required.");
  const { supabase, organizationId } = context;
  const runtime = getRuntimeConfig();

  const [routingResult, agentsResult, rollout] = await Promise.all([
    supabase.from("ai_routing_decisions")
      .select("id,request_id,agent_id,task_type,operation_type,detected_language,response_language,complexity,risk_level,selected_model_tier,provider,provider_model,reasoning_level,routing_confidence,routing_source,escalation_index,latency_ms,estimated_cost_usd,actual_cost_usd,routing_mode,proposed_model_tier,proposed_provider,proposed_model,actual_model_tier,actual_provider,actual_model,reason_codes,provider_latency_ms,gateway_latency_ms,router_version,policy_version,execution_status,validation_result,created_at")
      .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
    supabase.from("agents").select("id,name,role_title").eq("organization_id", organizationId),
    loadRoutingRollout({ organizationId, environment: runtime.environment, environmentKillSwitch: process.env.RYTHM_AI_ROUTING_KILL_SWITCH }),
  ]);

  const rows = (routingResult.data ?? []) as RoutingRow[];
  const agents = (agentsResult.data ?? []) as AgentRow[];
  const agentMap = new Map(agents.map((agent) => [agent.id, agent]));
  const uniqueRequests = new Set(rows.map((row) => row.request_id)).size;
  const escalations = rows.filter((row) => row.escalation_index > 0).length;
  const failures = rows.filter((row) => /fail|error|blocked/i.test(row.execution_status)).length;
  const latencyValues = rows.map((row) => row.latency_ms).filter((value): value is number => typeof value === "number");
  const avgLatency = latencyValues.length ? Math.round(latencyValues.reduce((a, b) => a + b, 0) / latencyValues.length) : null;
  const totalEstimatedCost = rows.reduce((sum, row) => sum + Number(row.estimated_cost_usd ?? 0), 0);
  const actualCostRows = rows.filter((row) => row.actual_cost_usd != null);
  const totalActualCost = actualCostRows.reduce((sum, row) => sum + Number(row.actual_cost_usd), 0);
  const tierCounts = { luna: 0, terra: 0, sol: 0 };
  for (const row of rows) if (row.selected_model_tier && row.selected_model_tier in tierCounts) tierCounts[row.selected_model_tier as keyof typeof tierCounts] += 1;

  return <main className="command-shell">
    <header className="command-header">
      <div>
        <p className="eyebrow">RYTHM REQUEST INTELLIGENCE</p>
        <h1>Adaptive routing observability.</h1>
        <p className="subtitle">Read-only tenant diagnostics for rollout mode, proposed versus actual execution, routing reasons, latency and AI cost.</p>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <Link className="secondary-button" href="/operations/health">Operations Health</Link>
        <Link className="secondary-button" href="/studio/agents">Agent Studio</Link>
      </div>
    </header>

    <section className="organization-banner">
      <div><span>Routing mode</span><strong>{rollout.mode.toUpperCase()}</strong></div>
      <div><span>Requests observed</span><strong>{uniqueRequests}</strong></div>
      <div><span>Luna / Terra / Sol</span><strong>{tierCounts.luna} / {tierCounts.terra} / {tierCounts.sol}</strong></div>
      <div><span>Escalations</span><strong>{escalations}</strong></div>
      <div><span>Failures</span><strong>{failures}</strong></div>
      <div><span>Average latency</span><strong>{avgLatency == null ? "—" : `${avgLatency} ms`}</strong></div>
      <div><span>Estimated / actual cost</span><strong>{money(totalEstimatedCost)} / {actualCostRows.length ? money(totalActualCost) : "—"}</strong></div>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}>
      <div className="panel-heading"><div><p className="label">Rollout control</p><h2>{rollout.source} policy · {rollout.policyVersion}</h2></div><span className={rollout.killSwitchActive ? "state-paused" : "pill"}>{rollout.killSwitchActive ? "kill switch active" : "server controlled"}</span></div>
      <p className="subtitle">Configuration precedence is organization → environment → global. Invalid or missing configuration resolves safely to OFF.</p>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}>
      <div className="panel-heading"><div><p className="label">Routing telemetry</p><h2>Latest 100 decisions</h2></div><span className="pill">tenant scoped</span></div>
      {routingResult.error ? <p className="form-error">Routing telemetry unavailable: {routingResult.error.message}</p> : null}
      <div className="data-list">
        {rows.length ? rows.map((row) => {
          const agent = row.agent_id ? agentMap.get(row.agent_id) : null;
          return <div className="data-row" key={row.id}>
            <div>
              <strong>{row.routing_mode.toUpperCase()} · proposed {row.proposed_model_tier?.toUpperCase() ?? "—"} / actual {row.actual_model_tier?.toUpperCase() ?? row.selected_model_tier?.toUpperCase() ?? "—"}</strong>
              <span>{agent ? `${agent.name} · ${agent.role_title}` : "Unassigned Agent"} · {row.operation_type ?? "unclassified"} · {row.complexity ?? "unknown"} complexity · {row.risk_level ?? "unknown"} risk</span>
              <span>proposed {row.proposed_provider ?? "—"}/{row.proposed_model ?? "—"} · actual {row.actual_provider ?? row.provider ?? "—"}/{row.actual_model ?? row.provider_model ?? "—"}</span>
              <span>{row.detected_language ?? "unknown"} → {row.response_language ?? "unknown"} · reasoning {row.reasoning_level ?? "unknown"} · {row.reason_codes?.join(", ") || row.routing_source || "no reason code"}</span>
              <span>{fmt(row.created_at)} · correlation {row.request_id.slice(0, 8)} · router {row.router_version ?? "legacy"} · policy {row.policy_version ?? "legacy"}</span>
            </div>
            <div className="row-meta">
              <span>provider {row.provider_latency_ms == null ? "—" : `${row.provider_latency_ms} ms`} · gateway {row.gateway_latency_ms == null ? "—" : `${row.gateway_latency_ms} ms`}</span>
              <span>est. {money(Number(row.estimated_cost_usd ?? 0))} · actual {row.actual_cost_usd == null ? "—" : money(Number(row.actual_cost_usd))}</span>
              <b className={/fail|error|blocked/i.test(row.execution_status) ? "state-paused" : "state-active"}>{row.execution_status}</b>
            </div>
          </div>;
        }) : !routingResult.error ? <p className="empty-state">No Agent request has been routed for this organization since telemetry was enabled.</p> : null}
      </div>
    </section>
  </main>;
}
