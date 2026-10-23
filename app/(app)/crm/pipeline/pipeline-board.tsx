"use client";
import Link from "next/link";
import {useState} from "react";
import type {SalesOpportunity,SalesStage} from "@/lib/crm/sales";
type Transition=(opportunity:SalesOpportunity,stage:string,reason:string)=>Promise<void>;
export function PipelineBoard({stages,opportunities,writableIds,onTransition}:{stages:SalesStage[];opportunities:SalesOpportunity[];writableIds:string[];onTransition?:Transition}) {
 const [message,setMessage]=useState(""),[busy,setBusy]=useState(false),[reasons,setReasons]=useState<Record<string,string>>({});
 async function move(opportunity:SalesOpportunity,stage:string) {
  if(busy||!writableIds.includes(opportunity.id)||stage===opportunity.stage_code)return;
  const target=stages.find(s=>s.code===stage);if(!target)return;
  const reason=reasons[opportunity.id]??opportunity.lost_reason??"";
  if(target.is_closed&&!target.is_won&&!reason.trim()){setMessage("Add a loss reason on the opportunity card before moving to Lost.");return;}
  setBusy(true);setMessage("");
  try{
   if(onTransition)await onTransition(opportunity,stage,reason);
   else {const response=await fetch(`/api/crm/opportunities/${opportunity.id}/stage`,{method:"POST",headers:{"Content-Type":"application/json"},body:JSON.stringify({stage,version:opportunity.version,lost_reason:reason})});if(!response.ok)throw Error();window.location.reload();}
   setMessage("Stage saved.");
  }catch{setMessage("Stage not saved. Refresh to load changes, check access and try again.");}finally{setBusy(false);}
 }
 return <><p>Drag a card to a stage, or use its stage selector and Move button. Closed opportunities require approval permission to reopen.</p><p role="status" aria-live="polite">{message}</p><div className="crm-sales-board" aria-label="Sales pipeline" aria-busy={busy}>{stages.map(stage=><section key={stage.code} className="crm-sales-stage" aria-label={`${stage.name} stage`} onDragOver={e=>e.preventDefault()} onDrop={e=>{e.preventDefault();const id=e.dataTransfer.getData("text/plain");const opportunity=opportunities.find(o=>o.id===id);if(opportunity)void move(opportunity,stage.code);}}><header><h2>{stage.name}</h2><span>{opportunities.filter(o=>o.stage_code===stage.code).length} on this page</span></header>{opportunities.filter(o=>o.stage_code===stage.code).map(o=><article key={o.id} className="crm-sales-card" draggable={!busy&&writableIds.includes(o.id)} onDragStart={e=>e.dataTransfer.setData("text/plain",o.id)}><Link href={`/crm/${o.account_id}?tab=opportunities`}><strong>{o.name}</strong></Link><p>{o.currency} {Number(o.value).toLocaleString("en-GB",{minimumFractionDigits:2})}</p><small>{o.probability}% probability{o.expected_close_date?` · closes ${o.expected_close_date}`:""}</small>{writableIds.includes(o.id)?<form onSubmit={e=>{e.preventDefault();const data=new FormData(e.currentTarget);void move(o,String(data.get("stage")));}}><label>Stage for {o.name}<select name="stage" defaultValue={o.stage_code} disabled={busy}>{stages.map(s=><option key={s.code} value={s.code}>{s.name}</option>)}</select></label><label>Loss reason for {o.name}<input maxLength={2000} value={reasons[o.id]??o.lost_reason??""} onChange={e=>setReasons({...reasons,[o.id]:e.target.value})}/></label><button className="secondary-button" disabled={busy}>Move</button></form>:<small>Read-only</small>}</article>)}{!opportunities.some(o=>o.stage_code===stage.code)?<p className="empty-state">No opportunities on this page.</p>:null}</section>)}</div></>;
}
