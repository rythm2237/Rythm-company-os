import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type RoutingRow = {
  id: string;
  request_id: string;
  agent_id: string | null;
  task_type: string;
  operation_type: string;
  detected_language: string;
  response_language: string;
  complexity: string;
  risk_level: string;
  selected_model_tier: string;
  provider: string;
  provider_model: string;
  reasoning_level: string;
  routing_confidence: number | null;
  routing_source: string;
  escalation_index: number;
  latency_ms: number | null;
  estimated_cost_usd: number | null;
  execution_status: string;
  validation_result: string | null;
  created_at: string;
};

type AgentRow = { id: string; name: string; role_title: string };

const fmt = (value: string) => new Intl.DateTimeFormat("en-GB", { dateStyle: "medium", timeStyle: "short" }).format(new Date(value));
const money = (value: number) => `$${value.toFixed(value < 0.01 ? 5 : 3)}`;

export default async function RoutingObservabilityPage() {
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();
  if (!user) redirect("/login");

  const { data: membership } = await supabase.from("organization_members")
    .select("organization_id,role").eq("user_id", user.id).in("role", ["owner", "admin"]).limit(1).maybeSingle();
  if (!membership) redirect("/command-center?error=Owner%20or%20admin%20authorization%20required.");
  const organizationId = String(membership.organization_id);

  const [routingResult, agentsResult] = await Promise.all([
    supabase.from("ai_routing_decisions")
      .select("id,request_id,agent_id,task_type,operation_type,detected_language,response_language,complexity,risk_level,selected_model_tier,provider,provider_model,reasoning_level,routing_confidence,routing_source,escalation_index,latency_ms,estimated_cost_usd,execution_status,validation_result,created_at")
      .eq("organization_id", organizationId).order("created_at", { ascending: false }).limit(100),
    supabase.from("agents").select("id,name,role_title").eq("organization_id", organizationId),
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
  const tierCounts = { luna: 0, terra: 0, sol: 0 };
  for (const row of rows) if (row.selected_model_tier in tierCounts) tierCounts[row.selected_model_tier as keyof typeof tierCounts] += 1;

  return <main className="command-shell">
    <header className="command-header">
      <div>
        <p className="eyebrow">RYTHM REQUEST INTELLIGENCE</p>
        <h1>Adaptive routing observability.</h1>
        <p className="subtitle">Read-only tenant diagnostics for model selection, language, complexity, risk, escalation, latency and estimated AI cost.</p>
      </div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}>
        <Link className="secondary-button" href="/operations/health">Operations Health</Link>
        <Link className="secondary-button" href="/studio/agents">Agent Studio</Link>
      </div>
    </header>

    <section className="organization-banner">
      <div><span>Requests observed</span><strong>{uniqueRequests}</strong></div>
      <div><span>Luna / Terra / Sol</span><strong>{tierCounts.luna} / {tierCounts.terra} / {tierCounts.sol}</strong></div>
      <div><span>Escalations</span><strong>{escalations}</strong></div>
      <div><span>Failures</span><strong>{failures}</strong></div>
      <div><span>Average latency</span><strong>{avgLatency == null ? "—" : `${avgLatency} ms`}</strong></div>
      <div><span>Estimated model cost</span><strong>{money(totalEstimatedCost)}</strong></div>
    </section>

    <section className="panel panel-wide" style={{marginTop:18}}>
      <div className="panel-heading"><div><p className="label">Routing telemetry</p><h2>Latest 100 decisions</h2></div><span className="pill">tenant scoped</span></div>
      {routingResult.error ? <p className="form-error">Routing telemetry unavailable: {routingResult.error.message}</p> : null}
      <div className="data-list">
        {rows.length ? rows.map((row) => {
          const agent = row.agent_id ? agentMap.get(row.agent_id) : null;
          return <div className="data-row" key={row.id}>
            <div>
              <strong>{row.selected_model_tier.toUpperCase()} · {row.provider_model}</strong>
              <span>{agent ? `${agent.name} · ${agent.role_title}` : "Unassigned Agent"} · {row.operation_type} · {row.complexity} complexity · {row.risk_level} risk</span>
              <span>{row.detected_language} → {row.response_language} · reasoning {row.reasoning_level} · source {row.routing_source} · escalation {row.escalation_index}</span>
              <span>{fmt(row.created_at)} · request {row.request_id.slice(0, 8)} · {row.validation_result ?? "adaptive"}</span>
            </div>
            <div className="row-meta">
              <span>{row.latency_ms == null ? "latency —" : `${row.latency_ms} ms`}</span>
              <span>{money(Number(row.estimated_cost_usd ?? 0))}</span>
              <b className={/fail|error|blocked/i.test(row.execution_status) ? "state-paused" : "state-active"}>{row.execution_status}</b>
            </div>
          </div>;
        }) : !routingResult.error ? <p className="empty-state">No Agent request has been routed for this organization since telemetry was enabled.</p> : null}
      </div>
    </section>
  </main>;
}
