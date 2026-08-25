"use client";

import {useMemo,useState} from "react";

type AgentOption={id:string;agent_code:string;display_name:string|null;name:string;role_title:string;enabled:boolean};
type Props={agents:AgentOption[];action:(formData:FormData)=>void|Promise<void>};

const preferredCodes=new Set(["B-001","A-101","A-102","A-104","A-105"]);
const baseAgenda=[
  "Clarify the decision, success criteria, and constraints",
  "Review relevant operating context and assumptions",
  "Compare options, risks, dependencies, and trade-offs",
  "Challenge the leading recommendation and identify failure modes",
  "Prepare a governed recommendation for Human CEO review",
];

export default function MeetingCreateWizard({agents,action}:Props){
  const enabled=agents.filter(a=>a.enabled);
  const initialSelected=useMemo(()=>enabled.filter(a=>preferredCodes.has(a.agent_code)).map(a=>a.id),[agents]);
  const [title,setTitle]=useState("");
  const [purpose,setPurpose]=useState("");
  const [decisionQuestion,setDecisionQuestion]=useState("");
  const [agentIds,setAgentIds]=useState(initialSelected);
  const [agenda,setAgenda]=useState(baseAgenda.join("\n"));
  const [language,setLanguage]=useState("English");
  const [rounds,setRounds]=useState("2");
  const [budget,setBudget]=useState("1.5");
  const [chairMode,setChairMode]=useState("live");
  const [launchMode,setLaunchMode]=useState("now");
  const [scheduledFor,setScheduledFor]=useState("");
  const [error,setError]=useState("");
  const b001=enabled.find(a=>a.agent_code==="B-001");

  const toggle=(id:string)=>setAgentIds(current=>current.includes(id)?current.filter(x=>x!==id):[...current,id]);
  const suggestAgenda=()=>{
    const subject=(title||"the decision").trim();
    const objective=(purpose||decisionQuestion||"the intended outcome").trim();
    setAgenda([
      `Frame ${subject}: decision, scope, and success criteria`,
      `Review context and evidence relevant to: ${objective}`,
      "Compare viable options, dependencies, cost, and operational impact",
      "Challenge assumptions; identify legal, security, customer, and execution risks",
      "Define conditions, owners, and evidence required before implementation",
      "Prepare a recommendation and decision package for the Human CEO",
    ].join("\n"));
  };
  const validate=()=>{
    if(title.trim().length<3)return "Enter a meeting title.";
    if(purpose.trim().length<10)return "Describe the meeting objective in at least 10 characters.";
    if(decisionQuestion.trim().length<10)return "Enter the decision question the meeting must resolve.";
    if(agentIds.filter(id=>enabled.some(a=>a.id===id)).length<2)return "Select at least two enabled Agents.";
    if(!b001||!agentIds.includes(b001.id))return "B-001 Executive Orchestrator is required for governed synthesis.";
    if(!agenda.trim())return "Agenda cannot be empty.";
    if(launchMode==="schedule"&&!scheduledFor)return "Choose a scheduled date and time.";
    return "";
  };

  return <form action={action} className="meeting-wizard" onSubmit={event=>{const message=validate();if(message){event.preventDefault();setError(message);}else setError("");}}>
    <input type="hidden" name="chairMode" value={chairMode}/>
    <input type="hidden" name="launchMode" value={launchMode}/>

    <div className="wizard-heading"><div><p className="label">New governed boardroom</p><h2>Create a decision meeting</h2><p>Define the decision once. RYTHM prepares the room, participants, agenda, governance and budget before anything runs.</p></div><span className="pill">5 steps</span></div>

    <section className="wizard-step"><div className="wizard-step-index">1</div><div className="wizard-step-body"><h3>Topic and objective</h3><p className="wizard-help">Keep the title short; use the objective and decision question to make the expected outcome explicit.</p><label>Meeting title<input name="title" value={title} onChange={e=>setTitle(e.target.value)} minLength={3} required placeholder="e.g. Customer-support triage pilot"/></label><label>Objective<textarea name="purpose" value={purpose} onChange={e=>setPurpose(e.target.value)} rows={4} required placeholder="What should this meeting accomplish?"/></label><label>Decision question<textarea name="decisionQuestion" value={decisionQuestion} onChange={e=>setDecisionQuestion(e.target.value)} rows={3} required placeholder="What exact decision should the room resolve?"/></label></div></section>

    <section className="wizard-step"><div className="wizard-step-index">2</div><div className="wizard-step-body"><div className="wizard-inline-heading"><div><h3>Who should be in the room?</h3><p className="wizard-help">Select only the roles that materially improve the decision. B-001 remains required for governed synthesis.</p></div><span className="pill">{agentIds.length} selected</span></div><div className="wizard-agent-grid">{enabled.map(agent=>{const selected=agentIds.includes(agent.id);const required=agent.agent_code==="B-001";return <label key={agent.id} className={`wizard-agent ${selected?"wizard-agent-selected":""}`}><input type="checkbox" name="agentIds" value={agent.id} checked={selected} onChange={()=>toggle(agent.id)} disabled={required}/><span><strong>{agent.agent_code} · {agent.display_name??agent.name}</strong><small>{agent.role_title}</small></span>{required?<b>Required</b>:null}</label>;})}</div>{!b001?<p className="form-error">B-001 is not enabled for this organization. Governed Boardroom sessions cannot start.</p>:null}</div></section>

    <section className="wizard-step"><div className="wizard-step-index">3</div><div className="wizard-step-body"><div className="wizard-inline-heading"><div><h3>Agenda</h3><p className="wizard-help">RYTHM proposes a decision-focused structure. Edit it freely before the session is created.</p></div><button type="button" className="secondary-button" onClick={suggestAgenda}>Refresh suggestion</button></div><textarea name="agenda" value={agenda} onChange={e=>setAgenda(e.target.value)} rows={8} required/><small className="wizard-help">One agenda item per line.</small></div></section>

    <section className="wizard-step"><div className="wizard-step-index">4</div><div className="wizard-step-body"><h3>Governance and cost</h3><div className="wizard-settings-grid"><label>Meeting language<input name="language" value={language} onChange={e=>setLanguage(e.target.value)}/></label><label>Challenge depth<select name="rounds" value={rounds} onChange={e=>setRounds(e.target.value)}><option value="1">1 round — positions only</option><option value="2">2 rounds — positions + challenge</option><option value="3">3 rounds — extended deliberation</option></select></label><label>AI budget cap (USD)<input name="budgetCapUsd" type="number" min="0.1" max="10" step="0.1" value={budget} onChange={e=>setBudget(e.target.value)}/></label></div><fieldset className="wizard-choice-group"><legend>Human CEO participation</legend><label className={chairMode==="live"?"wizard-choice-selected":""}><input type="radio" checked={chairMode==="live"} onChange={()=>setChairMode("live")}/><span><strong>Live chair</strong><small>CEO can pause, redirect, contribute and close the meeting.</small></span></label><label className={chairMode==="review"?"wizard-choice-selected":""}><input type="radio" checked={chairMode==="review"} onChange={()=>setChairMode("review")}/><span><strong>Review after deliberation</strong><small>Agents may deliberate, but no consequential decision becomes final without Human CEO review.</small></span></label></fieldset><div className="wizard-guardrail"><strong>Always enforced</strong><span>No external actions or browsing are authorized by creating this meeting. Routing or a stronger model never constitutes approval.</span></div></div></section>

    <section className="wizard-step"><div className="wizard-step-index">5</div><div className="wizard-step-body"><h3>When should it run?</h3><fieldset className="wizard-choice-group"><legend>Launch mode</legend><label className={launchMode==="now"?"wizard-choice-selected":""}><input type="radio" checked={launchMode==="now"} onChange={()=>setLaunchMode("now")}/><span><strong>Start now</strong><small>Create the governed session and open the Boardroom immediately.</small></span></label><label className={launchMode==="schedule"?"wizard-choice-selected":""}><input type="radio" checked={launchMode==="schedule"} onChange={()=>setLaunchMode("schedule")}/><span><strong>Schedule</strong><small>Prepare the governed session now and start it at the selected time.</small></span></label></fieldset>{launchMode==="schedule"?<label>Scheduled time<input name="scheduledFor" type="datetime-local" value={scheduledFor} onChange={e=>setScheduledFor(e.target.value)} required/></label>:<input type="hidden" name="scheduledFor" value=""/>}</div></section>

    {error?<p className="form-error" role="alert">{error}</p>:null}
    <button className="wizard-submit" disabled={!b001}>{launchMode==="now"?"Create & open Boardroom":"Schedule governed meeting"}</button>
  </form>;
}
