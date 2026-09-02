"use client";

import { useActionState } from "react";
import { runAgentTask } from "./actions";
import { initialAgentTaskState } from "./state";

type AssignmentOption={id:string;title:string;approval_mode:string;risk_level:string};

export default function AgentTaskConsole({agentCode,agentName,assignments}:{agentCode:string;agentName:string;assignments:AssignmentOption[]}) {
  const [state, action, pending] = useActionState(runAgentTask, initialAgentTaskState);
  return <section className="panel" style={{marginTop:18}}>
    <div className="panel-heading"><div><p className="label">GIVE TASK</p><h2>Assign work to {agentName}</h2></div><span className="pill">Adaptive routing</span></div>
    <p style={{color:"#667085",lineHeight:1.7}}>Run one approved, governed assignment. RYTHM supplies professional, Company and Direct Agent Knowledge automatically. The result enters human review and does not count as experience until it is verified.</p>
    <form action={action} className="stacked-form" style={{marginTop:14}}>
      <input type="hidden" name="agentCode" value={agentCode}/>
      <label>Governed assignment<select name="assignmentId" required defaultValue=""><option value="" disabled>Select an assignment</option>{assignments.map(assignment=><option key={assignment.id} value={assignment.id}>{assignment.title} · {assignment.risk_level} · {assignment.approval_mode}</option>)}</select></label>
      <button className="primary-button" type="submit" disabled={pending||assignments.length===0}>{pending?"Working…":"Run governed assignment"}</button>
    </form>
    {state.status==="error"?<p className="form-error" style={{marginTop:16}}>{state.error}</p>:null}
    {state.status==="success"?<div style={{marginTop:18}}>
      <div className="panel" style={{background:"#f8fafc"}}><p className="label">AGENT RESPONSE</p><div style={{whiteSpace:"pre-wrap",lineHeight:1.75,color:"#263248"}}>{state.output}</div></div>
      <p className="security-note" style={{marginTop:10}}>Assignment: {state.assignmentId} · Knowledge sources considered: {state.knowledgeCount??0} · Route: {state.routing} · Correlation: {state.correlationId} · Awaiting human outcome review</p>
    </div>:null}
  </section>;
}
