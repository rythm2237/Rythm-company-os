"use client";

import { Button } from "@/components/ui/Button";

import Link from "next/link";
import { useCallback, useEffect, useState } from "react";
import { useRouter } from "next/navigation";

type Explanation={
  eligibleForCompletion:boolean;currentLifecycleState:string;workProgress:number;deliverableProgress:number;implementationProgress:number;
  verificationProgress:number;outcomeProgress:number;acceptanceProgress:number;closeoutProgress:number;overallProjectProgress:number;
  blockingReasons:Array<{dimension?:string;reason?:string;state?:string;criterionKey?:string}>;nextRequiredAction:string|null;evaluatorVersion:string|null;
};
type CompletionPayload={
  ok:boolean;error?:string;explanation:Explanation|null;
  observations:Array<{id:string;status:string;observation_start:string|null;observation_end:string|null;required_duration_days:number;sufficient_data:boolean}>;
  report:{id:string;status:string;generated_at:string}|null;
  criteria:Array<{id:string;dimension:string;description:string;state:string;acceptance_disposition?:string|null;acceptance_conditions?:unknown[]}>;
  policy:{code:string;name:string;acceptance_authority:string|null;customer_signoff_required:boolean;acceptance_waiver_allowed:boolean}|null;
};

const label=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,c=>c.toUpperCase());
const formatDate=(value:string|null)=>value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium"}).format(new Date(value)):"Not started";

function lifecycleMessage(explanation:Explanation){
  if(explanation.eligibleForCompletion)return "All required lifecycle gates are satisfied and the project is formally closed.";
  if(explanation.currentLifecycleState==="OBSERVATION")return "Implementation and verification are complete. The project is waiting for the required observation period and sufficient outcome data.";
  if(explanation.currentLifecycleState==="ACCEPTANCE_PENDING")return "The project result is ready for the authorized stakeholder's final acceptance.";
  if(explanation.currentLifecycleState==="CLOSEOUT")return "Outcome and acceptance gates are satisfied. Final closeout documentation is now required.";
  if(["BLOCKED","ON_HOLD"].includes(explanation.currentLifecycleState))return `The project is not finished. ${explanation.blockingReasons.length} completion condition${explanation.blockingReasons.length===1?" is":"s are"} blocking closure.`;
  if(explanation.workProgress===100)return "All currently assigned agent work is complete, but the real-world project outcome is not yet complete.";
  return "RYTHM is continuing the project through the remaining lifecycle gates.";
}

async function request(url:string,init?:RequestInit){
  const response=await fetch(url,{cache:"no-store",...init});
  const data=await response.json();
  if(!response.ok||!data.ok)throw new Error(data.error||"Project completion request failed.");
  return data;
}

export function ProjectCompletionPanel({projectId}:{projectId:string}){
  const router=useRouter();
  const [data,setData]=useState<CompletionPayload|null>(null);
  const [error,setError]=useState("");
  const [busy,setBusy]=useState<string|null>(null);
  const [acceptanceConditions,setAcceptanceConditions]=useState("");
  const [acceptanceNote,setAcceptanceNote]=useState("");
  const [residualRisk,setResidualRisk]=useState("");
  const load=useCallback(async()=>{try{setError("");setData(await request(`/api/projects/completion?projectId=${encodeURIComponent(projectId)}`));}catch(e){setError(e instanceof Error?e.message:"Unable to load project completion state.");}},[projectId]);
  useEffect(()=>{void load();},[load]);
  const act=async(action:string,extra:Record<string,unknown>={})=>{setBusy(action);setError("");try{await request("/api/projects/completion",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,action,...extra})});await load();router.refresh();}catch(e){setError(e instanceof Error?e.message:"Request failed.");}finally{setBusy(null);}};
  const acceptance=(disposition:"accepted"|"accepted_with_conditions"|"rejected"|"waived")=>act("record_acceptance",{
    acceptanceDisposition:disposition,
    acceptanceConditions:acceptanceConditions.split(/\r?\n/).map(value=>value.trim()).filter(Boolean),
    acceptanceResidualRisk:residualRisk,
    acceptanceNote,
  });
  if(error&&!data)return <section className="panel" style={{marginTop:18}}><p className="form-error">{error}</p></section>;
  if(!data?.explanation)return <section className="panel" style={{marginTop:18}}><p className="subtitle">Loading project completion state…</p></section>;
  const e=data.explanation;
  const dimensions=[
    ["Work",e.workProgress],["Deliverables",e.deliverableProgress],["Implementation",e.implementationProgress],["Verification",e.verificationProgress],
    ["Outcomes",e.outcomeProgress],["Acceptance",e.acceptanceProgress],["Closeout",e.closeoutProgress],
  ] as Array<[string,number]>;
  const observation=data.observations[0];
  return <section className="panel" style={{marginTop:18}} aria-labelledby="completion-summary-heading">
    <div className="panel-heading"><div><p className="label">Project Completion</p><h2 id="completion-summary-heading">{label(e.currentLifecycleState)}</h2><p className="subtitle">{lifecycleMessage(e)}</p></div><div style={{textAlign:"right"}}><span className="pill">Overall {e.overallProjectProgress}%</span><div style={{fontSize:12,marginTop:6}}>Work {e.workProgress}%</div></div></div>
    <div className="project-progress-track" aria-label={`Overall project progress ${e.overallProjectProgress}%`}><span style={{width:`${e.overallProjectProgress}%`}}/></div>
    <div className="project-card-metrics" style={{marginTop:14}}>{dimensions.map(([name,value])=><div key={name}><span>{name}</span><strong>{value}%</strong></div>)}</div>
    <div style={{marginTop:14,padding:"12px 14px",border:"1px solid var(--border, #d9d9d9)",borderRadius:12}}><span className="label">Next required action</span><strong style={{display:"block",marginTop:4}}>{e.nextRequiredAction||"RYTHM will determine the next governed action."}</strong></div>
    {observation?<div style={{marginTop:12}}><strong>Observation window</strong><p className="subtitle" style={{marginTop:4}}>{label(observation.status)} · {observation.required_duration_days} days · {formatDate(observation.observation_start)} → {formatDate(observation.observation_end)} · {observation.sufficient_data?"Sufficient data recorded":"Sufficient data not yet confirmed"}</p></div>:null}
    {e.blockingReasons.length?<details style={{marginTop:14}}><summary style={{cursor:"pointer",fontWeight:800}}>Completion details · {e.blockingReasons.length} open condition{e.blockingReasons.length===1?"":"s"}</summary><div className="data-list" style={{marginTop:10}}>{e.blockingReasons.slice(0,20).map((reason,index)=><div className="data-row" key={`${reason.criterionKey??reason.dimension??"reason"}-${index}`}><div><strong>{label(reason.dimension||"Project")}</strong><span>{reason.reason||"Required completion condition is still open."}</span></div><span className="pill">{label(reason.state||"pending")}</span></div>)}</div></details>:null}

    {e.currentLifecycleState==="ACCEPTANCE_PENDING"?<div style={{marginTop:16,padding:"14px",border:"1px solid var(--border, #d9d9d9)",borderRadius:12}}><div className="panel-heading"><div><p className="label">Final Acceptance</p><h3>{data.policy?.acceptance_authority?label(data.policy.acceptance_authority):"Authorized stakeholder"}</h3></div><span className="pill">Decision required</span></div><p className="subtitle">Accept the verified result, accept it with explicit conditions, or reject it. Waiver is available only when the completion policy explicitly permits it.</p><label style={{display:"block",marginTop:10}}>Conditions · one per line<textarea rows={3} value={acceptanceConditions} onChange={event=>setAcceptanceConditions(event.target.value)} placeholder="Required follow-up, limitation, handover condition…"/></label><label style={{display:"block",marginTop:10}}>Residual risk / note<textarea rows={2} value={residualRisk} onChange={event=>setResidualRisk(event.target.value)} placeholder="Residual risk accepted with the result, if applicable"/></label><label style={{display:"block",marginTop:10}}>Decision note<textarea rows={2} value={acceptanceNote} onChange={event=>setAcceptanceNote(event.target.value)} placeholder="Acceptance rationale or rejection reason"/></label><div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}><Button type="button" disabled={busy!==null} onClick={()=>acceptance("accepted")}>Accept</Button><Button type="button" disabled={busy!==null||!acceptanceConditions.trim()} onClick={()=>acceptance("accepted_with_conditions")}>Accept with conditions</Button><Button type="button" disabled={busy!==null} onClick={()=>{if(confirm("Reject the final project result? The project will remain open for remediation."))void acceptance("rejected");}}>Reject</Button>{data.policy?.acceptance_waiver_allowed?<Button type="button" disabled={busy!==null} onClick={()=>{if(confirm("Waive final acceptance under the configured project policy?"))void acceptance("waived");}}>Waive acceptance</Button>:null}</div></div>:null}

    <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:16}}>
      <Button type="button" disabled={busy!==null} onClick={()=>act("evaluate")}>{busy==="evaluate"?"Checking…":"Recheck completion"}</Button>
      {e.currentLifecycleState==="CLOSEOUT"&&!data.report?<Button type="button" disabled={busy!==null} onClick={()=>act("generate_closeout")}>{busy==="generate_closeout"?"Generating…":"Generate Final Report"}</Button>:null}
      {data.report?<Link className="secondary-button" href={`/projects/report?project=${encodeURIComponent(projectId)}`}>Review Final Report</Link>:null}
      {e.currentLifecycleState==="CLOSEOUT"&&data.report&&!["final","accepted"].includes(data.report.status)?<Button type="button" disabled={busy!==null} onClick={()=>{if(confirm("Finalize this reviewed closeout report? This may make the project eligible for formal completion."))void act("finalize_closeout",{reportId:data.report?.id});}}>{busy==="finalize_closeout"?"Finalizing…":"Finalize Closeout"}</Button>:null}
    </div>
    {error?<p className="form-error" role="alert" style={{marginTop:12}}>{error}</p>:null}
    <p className="security-note">A finished task means the assigned work was completed. Project closure is evaluated separately from implementation, verification, measured outcomes, acceptance and closeout evidence.</p>
  </section>;
}
