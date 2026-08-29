"use client";

import { useActionState } from "react";
import { runAgentTask } from "./actions";
import { initialAgentTaskState } from "./state";

export default function AgentTaskConsole({agentCode,agentName}:{agentCode:string;agentName:string}) {
  const [state, action, pending] = useActionState(runAgentTask, initialAgentTaskState);
  return <section className="panel" style={{marginTop:18}}>
    <div className="panel-heading"><div><p className="label">GIVE TASK</p><h2>Assign work to {agentName}</h2></div><span className="pill">Adaptive routing</span></div>
    <p style={{color:"#667085",lineHeight:1.7}}>Describe the outcome you need in normal language. RYTHM supplies the Agent&apos;s professional foundation, Company Knowledge and Direct Agent Knowledge automatically. This task surface cannot execute external actions.</p>
    <form action={action} className="stacked-form" style={{marginTop:14}}>
      <input type="hidden" name="agentCode" value={agentCode}/>
      <label>Task
        <textarea name="task" rows={7} required maxLength={12000} placeholder="e.g. Based on the available company knowledge, identify the target ICP and recommend the next GTM experiment." />
      </label>
      <button className="primary-button" type="submit" disabled={pending}>{pending?"Working…":"Run task"}</button>
    </form>
    {state.status==="error"?<p className="form-error" style={{marginTop:16}}>{state.error}</p>:null}
    {state.status==="success"?<div style={{marginTop:18}}>
      <div className="panel" style={{background:"#f8fafc"}}><p className="label">AGENT RESPONSE</p><div style={{whiteSpace:"pre-wrap",lineHeight:1.75,color:"#263248"}}>{state.output}</div></div>
      <p className="security-note" style={{marginTop:10}}>Knowledge sources considered: {state.knowledgeCount??0} · Route: {state.routing} · Correlation: {state.correlationId}</p>
    </div>:null}
  </section>;
}
