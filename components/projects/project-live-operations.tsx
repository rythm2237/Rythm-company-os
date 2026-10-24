"use client";

import React, { useCallback, useEffect, useRef, useState } from "react";
import { ProjectHandoffMap } from "@/components/projects/project-handoff-map";
import { mergeProjectEvents, type ProjectLiveEvent } from "@/lib/projects/project-live-events";
import { ActionLock, ReadEpoch } from "@/lib/ui/interaction-state";
import { Button, ButtonGroup } from "@/components/ui/Button";
import { useProjectApprovalState } from "@/components/projects/ProjectApprovalState";
import { ApprovalDecisionDiscussion } from "@/components/projects/approval-decision-discussion";

type LiveTask={id:string;title:string;status:string;priority:number;assigned_agent_id:string|null;waiting_on_approval_id:string|null;started_at?:string|null;completed_at?:string|null;updated_at?:string|null;agents?:{agent_code?:string;display_name?:string;name?:string}|null};
type LiveApproval={id:string;subject_type:string;subject_id:string;title:string;summary:string;risk_level:string;status:string;created_at:string;expires_at:string|null;resolved_at?:string|null;response_note?:string|null;approver_user_id?:string|null;requested_by_agent_id?:string|null};
type LiveActivity=ProjectLiveEvent;
type LiveAgent={agent_id:string;status:string;assignment_role:string;agents?:{agent_code?:string;display_name?:string;name?:string;role_title?:string;department?:string}|null};
type ProgressSnapshot={progressPercent:number;completedTasks:number;totalTasks:number;runningTasks:number;queuedTasks:number;awaitingApproval:number;blockedTasks:number;failedTasks:number;lastActivityAt:string|null};
type LivePayload={ok:boolean;project:{id:string;name:string;project_code:string;status:string;stage:string;progress_percent:number|null;last_heartbeat_at:string|null};progressSnapshot:ProgressSnapshot;execution:{id:string;execution_no:number;status:string;started_at:string|null;last_heartbeat_at:string|null;updated_at:string|null}|null;counts:{running:number;queued:number;waitingApproval:number;waitingOther:number;completed:number;failed:number;total:number};tasks:LiveTask[];approvals:LiveApproval[];approvalHistory?:LiveApproval[];activity:LiveActivity[];events?:ProjectLiveEvent[];eventCursor?:string|null;hasMoreEvents?:boolean;agents:LiveAgent[];serverTime:string};
type Props={projectId:string;initialStatus:string;mode?:"full"|"approvals"};

const statusLabel=(value:string)=>value.replaceAll("_"," ");
const since=(value:string|null|undefined)=>{if(!value)return "—";const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));if(seconds<60)return `${seconds}s`;const minutes=Math.floor(seconds/60);if(minutes<60)return `${minutes}m`;return `${Math.floor(minutes/60)}h`;};

export function ProjectLiveOperations({projectId,initialStatus,mode="full"}:Props){
  const [data,setData]=useState<LivePayload|null>(null);
  const readEpoch=useRef(new ReadEpoch());
  const mutationLock=useRef(new ActionLock());
  const reading=useRef(false);
  const [error,setError]=useState("");
  const [notice,setNotice]=useState("");
  const [busyApproval,setBusyApproval]=useState<string|null>(null);
  const [busyResolution,setBusyResolution]=useState<"approved"|"rejected"|null>(null);
  const [notes,setNotes]=useState<Record<string,string>>({});
  const updateApprovalSummary=useProjectApprovalState()?.setApprovals;
  useEffect(()=>{if(data)updateApprovalSummary?.(data.approvals);},[data,updateApprovalSummary]);
  const eventCursor=useRef<string|null>(null);
  const initializedEvents=useRef(false);
  const seenEventIds=useRef(new Set<string>());
  const [events,setEvents]=useState<ProjectLiveEvent[]>([]);
  const [newEventIds,setNewEventIds]=useState<string[]>([]);

  const load=useCallback(async(force=false)=>{
    if(mutationLock.current.isActive()&&!force)return;
    if(reading.current&&!force)return;
    if(document.hidden&&!force)return;
    const epoch=readEpoch.current.begin();reading.current=true;
    try{
      const response=await fetch(`/api/projects/live?projectId=${encodeURIComponent(projectId)}${eventCursor.current?`&after=${encodeURIComponent(eventCursor.current)}`:""}`,{cache:"no-store",signal:AbortSignal.timeout(12000)});
      const payload=await response.json() as LivePayload&{error?:string};
      if(!response.ok||!payload.ok)throw new Error(payload.error||"Live project state is unavailable.");
      if(readEpoch.current.accepts(epoch)){
        const incoming=payload.events??[...payload.activity].reverse();
        setEvents(current=>mergeProjectEvents(current,incoming));
        setNewEventIds(initializedEvents.current?incoming.filter(event=>!seenEventIds.current.has(event.id)).map(event=>event.id):[]);
        for(const event of incoming)seenEventIds.current.add(event.id);
        if(seenEventIds.current.size>1000)seenEventIds.current=new Set([...seenEventIds.current].slice(-500));
        initializedEvents.current=true;eventCursor.current=payload.eventCursor??eventCursor.current;
        setData(payload);setError("");
      }

    }catch(e){if(readEpoch.current.accepts(epoch))setError(e instanceof Error?e.message:"Live project state is unavailable.");}
    finally{if(readEpoch.current.accepts(epoch))reading.current=false;}
  },[projectId]);

  useEffect(()=>{const reads=readEpoch.current;eventCursor.current=null;initializedEvents.current=false;seenEventIds.current.clear();setEvents([]);setNewEventIds([]);setData(null);void load(true);const refresh=(event:Event)=>{if((event as CustomEvent).detail?.source!=="approval")void load(true);};const timer=window.setInterval(()=>void load(),15000);const reconnect=()=>{if(!document.hidden)void load();};window.addEventListener("online",reconnect);document.addEventListener("visibilitychange",reconnect);window.addEventListener("rythm:project-updated",refresh);return()=>{reading.current=false;reads.invalidate();window.clearInterval(timer);window.removeEventListener("rythm:project-updated",refresh);window.removeEventListener("online",reconnect);document.removeEventListener("visibilitychange",reconnect);};},[load]);


  const resolve=async(approval:LiveApproval,resolution:"approved"|"rejected")=>{
    const typed=(notes[approval.id]??"").trim();
    if(resolution==="rejected"&&typed.length<3){setError("Add a short reason before rejecting this request.");return;}
    const responseNote=typed||(resolution==="approved"?"Approved by CEO from Project Operating System.":"");
    if(!mutationLock.current.acquire())return;
    readEpoch.current.invalidate();reading.current=false;
    setBusyApproval(approval.id);setBusyResolution(resolution);setError("");setNotice(resolution==="approved"?"Authorizing workstream…":"Rejecting workstream…");
    try{
      const response=await fetch("/api/projects/live",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,approvalId:approval.id,resolution,responseNote})});
      const result=await response.json() as {ok?:boolean;error?:string;taskStatus?:string};
      if(!response.ok||!result.ok)throw new Error(result.error||"Approval could not be resolved.");
      readEpoch.current.invalidate();reading.current=false;
      setData(current=>current?{...current,approvals:current.approvals.filter(item=>item.id!==approval.id)}:current);
      setNotes(current=>{const next={...current};delete next[approval.id];return next;});
      setNotice(resolution==="approved"?"Approved. The affected workstream is queued to continue.":"Rejected. The affected workstream is blocked; unrelated work continues.");
      await load(true);
      window.dispatchEvent(new CustomEvent("rythm:project-updated",{detail:{projectId,source:"approval"}}));

    }catch(e){setError(e instanceof Error?e.message:"Approval could not be resolved.");setNotice("");}
    finally{mutationLock.current.release();setBusyApproval(null);setBusyResolution(null);}
  };

  const status=(data?.execution?.status??initialStatus).toLowerCase();
  const isExecutionOpen=status==="running"||status==="queued";
  const counts=data?.counts??{running:0,queued:0,waitingApproval:0,waitingOther:0,completed:0,failed:0,total:0};
  const completion=data?.progressSnapshot?.progressPercent??(counts.total?Math.round((counts.completed/counts.total)*100):0);
  const hasLiveWork=counts.running>0;
  const visibleTasks=(data?.tasks??[]).filter(t=>["running","retrying","queued","waiting_for_approval"].includes(t.status)).slice(0,7);


  return <section className={`aiRuntime ${hasLiveWork?"isLive":"isIdle"}`} aria-live="polite">
    <style jsx>{`
      .aiRuntime{position:relative;margin-top:18px;border-radius:30px;overflow:hidden;color:#eaf9ff;background:#030711;border:1px solid rgba(96,236,255,.2);box-shadow:0 30px 90px rgba(3,7,17,.38),inset 0 0 80px rgba(24,67,123,.08);isolation:isolate}
      .top{display:grid;grid-template-columns:1fr auto;gap:20px;padding:26px 28px 10px;align-items:start}.kicker{display:flex;align-items:center;gap:10px;font:800 11px/1.2 ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.18em;color:#67e8ff}.hex{width:24px;height:24px;display:grid;place-items:center;clip-path:polygon(25% 6%,75% 6%,100% 50%,75% 94%,25% 94%,0 50%);background:linear-gradient(135deg,#2ce6ff,#725cff);color:#03111b;font-size:11px}.top h2{font-size:29px;margin:8px 0 7px;letter-spacing:-.025em}.sub{color:#91a9c3;max-width:790px;font-size:13px;line-height:1.55}.live{display:flex;align-items:center;gap:9px;padding:10px 13px;border:1px solid rgba(83,255,197,.28);background:rgba(21,91,76,.18);border-radius:999px;font:800 11px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.08em;color:#9effdb}.isIdle .live{color:#9aaabd;border-color:rgba(160,175,190,.16);background:rgba(90,100,115,.08)}
      .metricGrid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:10px}.metric{padding:12px;border-radius:12px;background:#102137}.metric span{color:#a5bfd6;font-size:12px}.metric strong{display:block;font-size:24px;margin-top:5px}
      .tasks{padding:0 28px 20px}.tasksHead,.approvalHead{display:flex;justify-content:space-between;gap:12px;align-items:center;margin-bottom:10px}.tasksHead h3,.approvalHead h3{margin:0;font-size:16px}.micro{font:700 9px ui-monospace,monospace;letter-spacing:.12em;color:#5b819d}.taskRail{display:grid;grid-template-columns:repeat(auto-fit,minmax(210px,1fr));gap:9px}.task{position:relative;padding:12px;border-radius:14px;background:rgba(5,16,31,.74);border:1px solid rgba(94,176,220,.11);overflow:hidden}.task:before{content:"";position:absolute;left:0;top:0;bottom:0;width:2px;background:#2c4056}.task.running:before{background:#4ff2c1;box-shadow:0 0 12px #4ff2c1}.task.retrying:before{background:#ffb14d}.task.waiting_for_approval:before{background:#d281ff}.task b{display:block;font-size:11px;color:#d8edf5;white-space:nowrap;overflow:hidden;text-overflow:ellipsis}.task span{display:block;margin-top:5px;font:700 9px ui-monospace,monospace;color:#69869e;text-transform:uppercase}
      .approvals{padding:0 28px 27px}.approvalGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(min(100%,295px),1fr));gap:10px}.approval{position:relative;padding:15px;border-radius:17px;background:linear-gradient(145deg,rgba(38,22,57,.64),rgba(7,17,32,.82));border:1px solid rgba(194,112,255,.2);box-shadow:inset 0 0 26px rgba(162,69,255,.035)}.approval.processing{opacity:.7}.approvalTop{display:flex;gap:10px;justify-content:space-between}.approvalTop b{font-size:12px;line-height:1.4;color:#f2e8ff}.risk{flex:none;font:800 9px ui-monospace,monospace;padding:5px 7px;border-radius:999px;color:#ffd292;background:rgba(255,168,54,.09);border:1px solid rgba(255,168,54,.15)}.approval p{font-size:11px;line-height:1.5;color:#8ea3ba}.note{box-sizing:border-box;width:100%;min-height:56px;padding:10px;border-radius:11px;background:rgba(1,8,18,.7);color:#e9faff;border:1px solid rgba(92,175,220,.12);resize:vertical;outline:none}.note:focus{border-color:rgba(70,221,255,.42);box-shadow:0 0 0 3px rgba(46,194,255,.06)}.buttons{display:flex;gap:8px;margin-top:9px}.buttons :global(button){position:relative;border:0;border-radius:10px;padding:9px 12px;font-weight:850;font-size:11px;cursor:pointer;transition:.16s ease}.approve{background:linear-gradient(135deg,#43e8c0,#60f0a5);color:#04221a}.reject{background:rgba(255,255,255,.055);color:#d8e7f4;border:1px solid rgba(255,255,255,.08)!important}.buttons :global(button):hover:not(:disabled){transform:translateY(-1px);filter:brightness(1.06)}.buttons :global(button):disabled{opacity:.48;cursor:progress}.approval.processing button:first-of-type:after{content:"";position:absolute;inset:0;border-radius:10px;background:linear-gradient(90deg,transparent,rgba(255,255,255,.35),transparent);animation:shimmer 1s infinite}@keyframes shimmer{from{transform:translateX(-100%)}to{transform:translateX(100%)}}
      .message{margin:0 28px 14px;padding:10px 12px;border-radius:11px;font-size:11px}.error{background:rgba(255,75,98,.08);border:1px solid rgba(255,75,98,.2);color:#ffc6cf}.notice{background:rgba(55,230,184,.08);border:1px solid rgba(55,230,184,.18);color:#a7ffe3}.empty{font:600 10px ui-monospace,monospace;color:#617e95;padding:8px 0}
      @media(max-width:950px){.top{grid-template-columns:1fr}.live{width:max-content;max-width:100%;box-sizing:border-box;overflow-wrap:anywhere}}@media(max-width:650px){.top,.tasks,.approvals{padding-left:16px;padding-right:16px}.taskRail{grid-template-columns:1fr}.kicker{letter-spacing:.06em;font-size:9px}.top h2{font-size:24px}}
      @media(prefers-reduced-motion:reduce){.approval.processing button:first-of-type:after{animation:none!important}}
    `}</style>
    {mode==="full"?<><div className="top"><div><div className="kicker"><span className="hex">AI</span> RYTHM AUTONOMOUS PROJECT INTELLIGENCE</div><h2>{hasLiveWork?"Specialists are working":isExecutionOpen?"Execution queued · awaiting active work":"Project operations"}</h2><div className="sub">Project execution, real work packets, recorded specialist handoffs and human governance decisions.</div></div><div className="live"><i/>{hasLiveWork?`EXECUTION ${data?.execution?.execution_no??""} · ACTIVE`:statusLabel(status).toUpperCase()}</div></div>
    </>:null}
    {!data&&!error?<div className="message" role="status">Loading project decisions…</div>:null}
    {error?<div role="alert" className="message error">{error}</div>:null}{notice?<div role="status" className="message notice">{notice}</div>:null}
    {mode==="full"?<><ProjectHandoffMap events={events} newEventIds={newEventIds} agents={data?.agents??[]} tasks={data?.tasks??[]} phase={data?.project.stage??initialStatus} pendingApprovals={data?.approvals.length??0}/><div className="tasks"><div className="metricGrid"><div className="metric"><span>Task work completed</span><strong>{completion}%</strong></div><div className="metric"><span>Runtime heartbeat</span><strong style={{fontSize:16}}>{since(data?.execution?.last_heartbeat_at??data?.project?.last_heartbeat_at)}</strong></div></div></div>
    <div className="tasks"><div className="tasksHead"><h3>Agent workstreams</h3><span className="micro">LIVE EXECUTION GRAPH</span></div><div className="taskRail">{visibleTasks.length?visibleTasks.map(task=><div className={`task ${task.status}`} key={task.id}><b>{task.title}</b><span>{statusLabel(task.status)} · {task.agents?.agent_code||data?.agents.find(agent=>agent.agent_id===task.assigned_agent_id)?.agents?.display_name||(task.assigned_agent_id?"Assigned specialist":"unassigned")}</span></div>):<div className="empty">No active or queued workstreams.</div>}</div></div>
    </>:null}
    {data?.approvalHistory?.length?<details className="approvals"><summary>Decision history ({data.approvalHistory.length} recent)</summary>{data.approvalHistory.map(item=><article key={item.id} style={{paddingBlock:12}}><strong>{item.title}</strong><p>{statusLabel(item.status)} · {item.resolved_at?new Date(item.resolved_at).toLocaleString():""}</p><p>{item.response_note}</p><small>Requested {new Date(item.created_at).toLocaleString()} · Requested by {item.requested_by_agent_id??"system"} · Manager {item.approver_user_id??"policy"}</small></article>)}</details>:null}
    <div className="approvals"><div className="approvalHead"><h3>Human authority gates</h3><span className="micro">{data?.approvals?.length??0} CEO DECISIONS PENDING</span></div>{data?.approvals?.length?<div className="approvalGrid">{data.approvals.map(approval=><div className={`approval ${busyApproval===approval.id?"processing":""}`} key={approval.id}><div className="approvalTop"><b>{approval.title}</b><span className="risk">{approval.risk_level}</span></div><p>{approval.summary}</p><ApprovalDecisionDiscussion projectId={projectId} approvalId={approval.id} disabled={busyApproval!==null}/><textarea aria-label={`Decision reason for ${approval.title}`} className="note" value={notes[approval.id]??""} onChange={e=>setNotes(current=>({...current,[approval.id]:e.target.value}))} placeholder="Optional approval note · rejection requires a reason" disabled={busyApproval===approval.id}/><ButtonGroup label="Decision actions" className="buttons"><Button loading={busyApproval===approval.id&&busyResolution==="approved"} loadingLabel="Approving…" className="approve" data-processing-label="Authorizing workstream" disabled={busyApproval!==null} onClick={()=>resolve(approval,"approved")}>Approve & continue</Button><Button variant="destructive" loading={busyApproval===approval.id&&busyResolution==="rejected"} loadingLabel="Rejecting…" className="reject" data-processing-label="Rejecting workstream" disabled={busyApproval!==null} onClick={()=>resolve(approval,"rejected")}>Reject</Button></ButtonGroup></div>)}</div>:<div className="empty">No human decision is blocking a workstream. Independent agents continue autonomously.</div>}</div>
  </section>;
}
