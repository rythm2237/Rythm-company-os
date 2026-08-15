"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import styles from "./boardroom.module.css";

type AgentOption={
  id:string;
  agent_code:string;
  display_name:string|null;
  name:string;
  role_title:string;
  enabled:boolean;
};

type Draft={
  decisionQuestion:string;
  agentIds:string[];
  language:string;
  rounds:string;
  budgetCapUsd:string;
};

type Props={
  meetingId:string;
  agents:AgentOption[];
  action:(formData:FormData)=>void|Promise<void>;
};

const DEFAULT_QUESTION="What decision should this meeting resolve, which options should be compared, and what governance conditions should apply?";
const preferredCodes=new Set(["B-001","A-101","A-102","A-104","A-105"]);

function storageKey(meetingId:string){return `rythm:boardroom:draft:${meetingId}`;}

export function clearMeetingDraft(meetingId:string){
  try{window.localStorage.removeItem(storageKey(meetingId));}catch{}
}

export default function SessionPreparationForm({meetingId,agents,action}:Props){
  const initialSelected=useMemo(()=>agents.filter(a=>a.enabled&&preferredCodes.has(a.agent_code)).map(a=>a.id),[agents]);
  const [draft,setDraft]=useState<Draft>({decisionQuestion:DEFAULT_QUESTION,agentIds:initialSelected,language:"English",rounds:"2",budgetCapUsd:"1.5"});
  const [hydrated,setHydrated]=useState(false);
  const [validation,setValidation]=useState("");

  useEffect(()=>{
    try{
      const raw=window.localStorage.getItem(storageKey(meetingId));
      if(raw){
        const saved=JSON.parse(raw) as Partial<Draft>;
        setDraft({
          decisionQuestion:String(saved.decisionQuestion??DEFAULT_QUESTION),
          agentIds:Array.isArray(saved.agentIds)?saved.agentIds.map(String):initialSelected,
          language:String(saved.language??"English"),
          rounds:String(saved.rounds??"2"),
          budgetCapUsd:String(saved.budgetCapUsd??"1.5"),
        });
      }
    }catch{}
    setHydrated(true);
  },[meetingId,initialSelected]);

  useEffect(()=>{
    if(!hydrated)return;
    try{window.localStorage.setItem(storageKey(meetingId),JSON.stringify(draft));}catch{}
  },[draft,hydrated,meetingId]);

  const enabledAgents=agents.filter(a=>a.enabled);
  const b001=enabledAgents.find(a=>a.agent_code==="B-001");
  const selectedEnabled=draft.agentIds.filter(id=>enabledAgents.some(a=>a.id===id));
  const toggleAgent=(id:string)=>setDraft(d=>({...d,agentIds:d.agentIds.includes(id)?d.agentIds.filter(x=>x!==id):[...d.agentIds,id]}));

  const validate=()=>{
    if(draft.decisionQuestion.trim().length<10)return "Enter a decision question of at least 10 characters.";
    if(selectedEnabled.length<2)return "Select at least two enabled Agents for the meeting.";
    if(!b001||!draft.agentIds.includes(b001.id))return "B-001 Executive Orchestrator is required for governed synthesis.";
    return "";
  };

  return <form action={action} className="auth-form" onSubmit={event=>{const message=validate();if(message){event.preventDefault();setValidation(message);}else setValidation("");}}>
    <input type="hidden" name="meetingId" value={meetingId}/>
    <label>Decision question
      <textarea name="decisionQuestion" required minLength={10} rows={5} value={draft.decisionQuestion} onChange={e=>setDraft(d=>({...d,decisionQuestion:e.target.value}))} className={styles.prepTextarea}/>
      <small className={styles.fieldHint}>Saved automatically on this device until the session is prepared successfully.</small>
    </label>

    <section className={styles.participantPicker} aria-labelledby="meeting-participants-title">
      <div className={styles.participantHeading}>
        <div><p className="label">Meeting participants</p><h3 id="meeting-participants-title">Choose the Agents in the room</h3></div>
        <span className={styles.selectionCount}>{selectedEnabled.length} selected</span>
      </div>
      {agents.length===0?<div className={styles.agentEmptyState}>
        <div><strong>No Agents are available in this company yet.</strong><p>A real governed meeting needs at least two enabled Agents, including B-001 Executive Orchestrator. Nothing is hidden here: this organization currently has no Agent records.</p></div>
        <Link href="/agents" className="secondary-button">Open Agent organization</Link>
      </div>:<div className={styles.agentPickerGrid}>
        {agents.map(agent=>{
          const checked=draft.agentIds.includes(agent.id);
          const required=agent.agent_code==="B-001";
          return <label key={agent.id} className={`${styles.agentPickCard} ${checked?styles.agentPickSelected:""} ${!agent.enabled?styles.agentPickDisabled:""}`}>
            <input type="checkbox" name="agentIds" value={agent.id} disabled={!agent.enabled} checked={checked} onChange={()=>toggleAgent(agent.id)}/>
            <span className={styles.agentPickText}><strong>{agent.agent_code} · {agent.display_name??agent.name}</strong><small>{agent.role_title} · {agent.enabled?"Enabled":"Paused"}</small></span>
            {required?<b className={styles.requiredBadge}>Required</b>:null}
          </label>;
        })}
      </div>}
      {agents.length>0&&!b001?<p className={styles.inlineWarning}>B-001 is not available or enabled in this organization. A governed session cannot be prepared until it is provisioned.</p>:null}
    </section>

    <div className={styles.prepSettingsGrid}>
      <label>Language<input name="language" value={draft.language} onChange={e=>setDraft(d=>({...d,language:e.target.value}))}/></label>
      <label>Challenge rounds<select name="rounds" value={draft.rounds} onChange={e=>setDraft(d=>({...d,rounds:e.target.value}))}><option value="1">1 — positions only</option><option value="2">2 — positions + challenge</option><option value="3">3 — extended deliberation</option></select></label>
      <label>AI budget cap (USD)<input name="budgetCapUsd" type="number" min="0" max="10" step="0.1" value={draft.budgetCapUsd} onChange={e=>setDraft(d=>({...d,budgetCapUsd:e.target.value}))}/></label>
    </div>
    {validation?<p className={styles.inlineError} role="alert">{validation}</p>:null}
    <button disabled={agents.length===0}>Prepare governed Agent session</button>
    <p className="security-note">Only enabled Agents may be selected. B-001 is required for synthesis. Preparing a session authorizes internal model analysis only; it does not authorize browsing, external actions, deployment, messaging, or transactions.</p>
  </form>;
}

export function MeetingDraftCleanup({meetingId}:{meetingId:string}){
  useEffect(()=>{clearMeetingDraft(meetingId);},[meetingId]);
  return null;
}
