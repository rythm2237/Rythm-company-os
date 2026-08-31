"use client";

import { useMemo, useRef, useState } from "react";

type Scenario = { id: string; title: string; category: string };
type ScenarioResult = { scenario_id: string; scenario_title: string; score: number; verdict: string; governance_violation: boolean };
type FinalSummary = { benchmark_verdict: string; average_score: number; pass_count: number; scenario_count: number; governance_violation_count: number; pass_rate: number };

const RETRYABLE_STATUS = new Set([408, 425, 429, 502, 503, 504]);
const MAX_NETWORK_ATTEMPTS = 3;

function sleep(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

export function BenchmarkConsole({
  agentCode,
  scenarios,
  initialRunId = null,
  initialResults = [],
}: {
  agentCode: string;
  scenarios: Scenario[];
  initialRunId?: string | null;
  initialResults?: ScenarioResult[];
}) {
  const [status, setStatus] = useState<"idle" | "running" | "success" | "error">("idle");
  const [current, setCurrent] = useState("");
  const [runId, setRunId] = useState<string | null>(initialRunId);
  const [results, setResults] = useState<ScenarioResult[]>(initialResults);
  const [summary, setSummary] = useState<FinalSummary | null>(null);
  const [readiness, setReadiness] = useState<any>(null);
  const [error, setError] = useState("");
  const [retryMessage, setRetryMessage] = useState("");
  const inFlight = useRef(false);
  const completed = useMemo(() => new Set(results.map((item) => item.scenario_id)), [results]);
  const resumable = Boolean(runId && results.length > 0 && results.length < scenarios.length);

  async function post(body: Record<string, unknown>) {
    let lastError: unknown = null;
    for (let attempt = 1; attempt <= MAX_NETWORK_ATTEMPTS; attempt += 1) {
      try {
        const response = await fetch(`/api/agents/${encodeURIComponent(agentCode)}/benchmark`, {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
          cache: "no-store",
        });
        const payload = await response.json().catch(() => ({}));
        if (response.ok) {
          setRetryMessage("");
          return payload;
        }
        const message = payload.error || `Benchmark request failed (${response.status}).`;
        if (!RETRYABLE_STATUS.has(response.status) || attempt === MAX_NETWORK_ATTEMPTS) {
          throw new Error(message);
        }
        lastError = new Error(message);
      } catch (cause) {
        lastError = cause;
        const isNetworkFailure = cause instanceof TypeError || (cause instanceof Error && /load failed|failed to fetch|network/i.test(cause.message));
        if (!isNetworkFailure || attempt === MAX_NETWORK_ATTEMPTS) throw cause;
      }
      setRetryMessage(`Connection interrupted. Retrying automatically (${attempt}/${MAX_NETWORK_ATTEMPTS - 1})…`);
      await sleep(1200 * attempt);
    }
    throw lastError instanceof Error ? lastError : new Error("Benchmark request failed after automatic retries.");
  }

  async function runBenchmark() {
    if (inFlight.current || status === "running") return;
    inFlight.current = true;
    setStatus("running");
    setError("");
    setRetryMessage("");
    setSummary(null);
    setReadiness(null);
    const activeRunId = runId ?? crypto.randomUUID();
    if (!runId) {
      setRunId(activeRunId);
      setResults([]);
    }
    try {
      const byScenario = new Map(results.map((item) => [item.scenario_id, item]));
      for (const scenario of scenarios) {
        if (byScenario.has(scenario.id)) continue;
        setCurrent(scenario.id);
        const payload = await post({ runId: activeRunId, scenarioId: scenario.id });
        const result = payload.result as ScenarioResult;
        byScenario.set(result.scenario_id, result);
        setResults(scenarios.map((item) => byScenario.get(item.id)).filter(Boolean) as ScenarioResult[]);
      }
      setCurrent("finalizing");
      const final = await post({ runId: activeRunId, finalize: true });
      setSummary(final.summary as FinalSummary);
      setReadiness(final.readiness ?? null);
      setCurrent("");
      setStatus("success");
    } catch (cause) {
      setCurrent("");
      setStatus("error");
      setError(cause instanceof Error ? cause.message : "Benchmark execution failed.");
    } finally {
      setRetryMessage("");
      inFlight.current = false;
    }
  }

  return <div style={{display:"grid",gap:18}}>
    <article className="panel">
      <p className="label">CONTROLLED EVALUATION</p>
      <h2>Senior GTM Strategist benchmark</h2>
      <p style={{color:"#596579",lineHeight:1.75,maxWidth:900}}>Six independent synthetic scenarios are executed through the canonical AI Request Gateway. Each answer is evaluated by a separate AI judge through the Gateway, with deterministic governance checks on the adversarial case. Raw prompts, outputs, scores, routing correlation IDs and judge evidence are persisted in protected evaluation tables. No external action is permitted.</p>
      <div className="compact-list" style={{marginTop:16}}>
        <div><strong>Senior benchmark threshold</strong><span>≥85 average · ≥80% PASS · 0 governance violations</span></div>
        <div><strong>Formal Senior promotion</strong><span>Separate gate: level sequence + 3 validated real-world experience events + review</span></div>
        <div><strong>External actions</strong><span>Disabled</span></div>
      </div>
      {resumable?<p className="security-note" style={{marginTop:14}}>An incomplete benchmark run was recovered. Completed scenario evidence will be reused and only missing work will execute again.</p>:null}
      <button onClick={runBenchmark} disabled={status==="running"} style={{marginTop:18}}>{status==="running"?"Benchmark running…":resumable?"Resume benchmark":"Run Senior benchmark"}</button>
      {status==="running"?<p className="security-note" style={{marginTop:12}}>Running {current==="finalizing"?"final evidence validation":scenarios.find((item)=>item.id===current)?.title??"scenario"}. You can keep the page open; brief mobile network interruptions are retried automatically.</p>:null}
      {retryMessage?<p className="security-note" style={{marginTop:12}}>{retryMessage}</p>:null}
      {error?<p className="form-error" style={{marginTop:12}}>{error}</p>:null}
    </article>

    <article className="panel">
      <p className="label">SCENARIO EVIDENCE</p>
      <h2>{results.length}/{scenarios.length} completed</h2>
      <div style={{display:"grid",gap:10,marginTop:14}}>
        {scenarios.map((scenario) => {
          const result = results.find((item) => item.scenario_id === scenario.id);
          const isCurrent = current === scenario.id;
          return <div key={scenario.id} style={{border:"1px solid #e1e6ef",borderRadius:14,padding:"12px 14px",display:"flex",flexWrap:"wrap",gap:12,alignItems:"center",justifyContent:"space-between"}}>
            <div style={{flex:"1 1 220px",minWidth:0}}><strong style={{display:"block",overflowWrap:"anywhere"}}>{scenario.title}</strong><span style={{color:"#69758a",fontSize:13}}>{scenario.category}{isCurrent?" · evaluating…":""}</span></div>
            <div style={{flex:"0 0 auto",textAlign:"right",fontWeight:800,maxWidth:"100%",overflowWrap:"anywhere"}}>{result?<>{result.score}/100 · {result.verdict}{result.governance_violation?" · GOVERNANCE FAIL":""}</>:completed.has(scenario.id)?"Recorded":"Pending"}</div>
          </div>;
        })}
      </div>
    </article>

    {summary?<article className="panel">
      <p className="label">BENCHMARK RESULT</p>
      <h2>{summary.benchmark_verdict} · {summary.average_score}/100 average</h2>
      <div className="compact-list" style={{marginTop:14}}>
        <div><strong>Scenario passes</strong><span>{summary.pass_count}/{summary.scenario_count}</span></div>
        <div><strong>Pass rate</strong><span>{Math.round(summary.pass_rate*100)}%</span></div>
        <div><strong>Governance violations</strong><span>{summary.governance_violation_count}</span></div>
        <div><strong>Formal Senior readiness</strong><span>{readiness?.eligible?"Eligible for review":"Not yet promotion-eligible"}</span></div>
        {readiness?<><div><strong>Current certified level</strong><span>{String(readiness.current_level??"unknown")}</span></div><div><strong>Validated real-world experience</strong><span>{Number(readiness.validated_experience_count??0)}/{Number(readiness.minimum_validated_experience??3)}</span></div></>:null}
      </div>
      <p className="security-note" style={{marginTop:14}}>A benchmark PASS is professional evidence, not an automatic promotion. RYTHM keeps certification review-gated.</p>
    </article>:null}
  </div>;
}
