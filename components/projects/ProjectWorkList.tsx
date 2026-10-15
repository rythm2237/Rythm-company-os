"use client";
import {useEffect,useState} from "react";
import {ContextPanel} from "./ContextPanel";

type WorkItem={id:string;title:string;status:string;priority:number;assigned_agent_id?:string|null;due_at?:string|null;agents?:unknown;action_item_id?:string|null;kind?:"task"|"action"};
const label=(s:string)=>s.replaceAll("_"," ");
export function ProjectWorkList({projectId,items}:{projectId:string;items:WorkItem[]}){
 const [filter,setFilter]=useState("active");const [selected,setSelected]=useState<string|null>(null);
 const [detail,setDetail]=useState<Record<string,unknown>|null>(null);const [error,setError]=useState("");
 useEffect(()=>{const sync=()=>setSelected(new URL(location.href).searchParams.get("item"));sync();window.addEventListener("popstate",sync);return()=>window.removeEventListener("popstate",sync);},[]);
 const choose=(id:string|null)=>{const url=new URL(location.href);if(id)url.searchParams.set("item",id);else url.searchParams.delete("item");history.replaceState(history.state,"",url);setSelected(id);};
 useEffect(()=>{if(!selected)return;const controller=new AbortController();setDetail(null);setError("");
  fetch(`/api/projects/work-item?projectId=${encodeURIComponent(projectId)}&itemId=${encodeURIComponent(selected)}`,{signal:controller.signal}).then(async response=>{const data=await response.json();if(!response.ok)throw new Error(data.error||"Unable to load details.");setDetail(data.item);}).catch(e=>{if(!controller.signal.aborted)setError(e.message);});return()=>controller.abort();
 },[projectId,selected]);
 const visible=items.filter(item=>filter==="all"?true:filter==="active"?!["completed","cancelled"].includes(item.status):filter==="approval"?item.status==="waiting_for_approval":filter==="failed"?["failed","retrying"].includes(item.status):filter==="blocked"?["blocked","waiting_for_connection","waiting_for_data"].includes(item.status):item.status===filter);
 const agentName=(item:WorkItem)=>{const a=(Array.isArray(item.agents)?item.agents[0]:item.agents) as {display_name?:string;name?:string}|undefined;return a?.display_name||a?.name||(item.assigned_agent_id?"Assigned agent":"Unassigned");};
 const selectedItem=items.find(item=>item.id===selected);
 return <section className="panel project-view-panel"><div className="panel-heading"><h2>Work</h2><span>{visible.length} of {items.length}</span></div>
 <label className="project-inline-filter">Show<select value={filter} onChange={e=>setFilter(e.target.value)}>{[["active","Active"],["approval","Needs my approval"],["blocked","Blocked"],["waiting_for_data","Waiting for data"],["failed","Failed / retrying"],["completed","Completed"],["all","All"]].map(([v,t])=><option key={v} value={v}>{t}</option>)}</select></label>
 <div className="data-list">{visible.map(item=><button className="project-work-row" key={item.id} onClick={()=>choose(item.id)}><span><strong>{item.title}</strong><small>{agentName(item)} · Priority {item.priority}{item.due_at?` · Due ${new Date(item.due_at).toLocaleDateString()}`:""}</small></span><span className="pill">{label(item.status)}</span></button>)}{!visible.length?<p className="empty-state">No work matches this filter.</p>:null}</div>
 {selected?<ContextPanel title={selectedItem?.title??"Work details"} onClose={()=>choose(null)}>{error?<p role="alert">{error}</p>:!detail?<p role="status">Loading details…</p>:<>
 <p><strong>Status:</strong> {label(String(detail.status))}</p><p><strong>Owner:</strong> {selectedItem?agentName(selectedItem):"See assignment"}</p>
 <h3>Context</h3><p className="project-full-text">{String(detail.description||(detail.input as Record<string,unknown>)?.description||"No additional instructions recorded.")}</p>
 {detail.error_message?<p role="alert">{String(detail.error_message)}</p>:null}
 <details><summary>Evidence and results</summary><pre>{JSON.stringify(detail.safe_result??detail.evidence_required??{},null,2)}</pre></details>
 <details><summary>Dependencies and execution history</summary><pre>{JSON.stringify({dependencies:detail.dependencies,started_at:detail.started_at,completed_at:detail.completed_at,attempt:detail.attempt_count},null,2)}</pre></details>
 <h3>Available actions</h3>{detail.waiting_on_approval_id?<a href={`/projects/operating?project=${projectId}&view=decisions`}>Review required decision</a>:selectedItem?.kind==="action"?<a href={`/actions?project=${projectId}&action=${selected}`}>Manage action</a>:<p>Execution follows the project’s governance and dependencies.</p>}
 </>}</ContextPanel>:null}</section>;
}
