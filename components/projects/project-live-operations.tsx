"use client";

import { useCallback, useEffect, useMemo, useState } from "react";

type LiveTask={id:string;title:string;status:string;priority:number;assigned_agent_id:string|null;waiting_on_approval_id:string|null;agents?:{agent_code?:string;display_name?:string;name?:string}|null};
type LiveApproval={id:string;subject_type:string;subject_id:string;title:string;summary:string;risk_level:string;status:string;created_at:string;expires_at:string|null};
type LiveActivity={id:string;event_type:string;headline:string;detail:string|null;importance:string;created_at:string};
type LiveAgent={agent_id:string;status:string;assignment_role:string;agents?:{agent_code?:string;display_name?:string;name?:string;role_title?:string}|null};
type LivePayload={
  ok:boolean;
  project:{id:string;name:string;project_code:string;status:string;stage:string;progress_percent:number|null;last_heartbeat_at:string|null};
  execution:{id:string;execution_no:number;status:string;started_at:string|null;last_heartbeat_at:string|null;updated_at:string|null}|null;
  counts:{running:number;queued:number;waitingApproval:number;waitingOther:number;completed:number;failed:number;total:number};
  tasks:LiveTask[];
  approvals:LiveApproval[];
  activity:LiveActivity[];
  agents:LiveAgent[];
  serverTime:string;
};

type Props={projectId:string;initialStatus:string};

const statusLabel=(value:string)=>value.replaceAll("_"," ");
const since=(value:string|null)=>{
  if(!value)return "—";
  const seconds=Math.max(0,Math.floor((Date.now()-new Date(value).getTime())/1000));
  if(seconds<60)return `${seconds}s ago`;
  const minutes=Math.floor(seconds/60);if(minutes<60)return `${minutes}m ago`;
  const hours=Math.floor(minutes/60);return `${hours}h ago`;
};

export function ProjectLiveOperations({projectId,initialStatus}:Props){
  const [data,setData]=useState<LivePayload|null>(null);
  const [error,setError]=useState("");
  const [busyApproval,setBusyApproval]=useState<string|null>(null);
  const [notes,setNotes]=useState<Record<string,string>>({});
  const [tick,setTick]=useState(0);

  const load=useCallback(async()=>{
    try{
      const response=await fetch(`/api/projects/live?projectId=${encodeURIComponent(projectId)}`,{cache:"no-store"});
      const payload=await response.json() as LivePayload&{error?:string};
      if(!response.ok||!payload.ok)throw new Error(payload.error||"Live project state is unavailable.");
      setData(payload);setError("");
    }catch(e){setError(e instanceof Error?e.message:"Live project state is unavailable.");}
  },[projectId]);

  useEffect(()=>{void load();const timer=window.setInterval(()=>void load(),5000);return()=>window.clearInterval(timer);},[load]);
  useEffect(()=>{const timer=window.setInterval(()=>setTick(v=>v+1),1000);return()=>window.clearInterval(timer);},[]);

  const resolve=async(approval:LiveApproval,resolution:"approved"|"rejected")=>{
    const note=(notes[approval.id]??"").trim();
    if(note.length<3){setError("Add a short CEO note before approving or rejecting.");return;}
    setBusyApproval(approval.id);setError("");
    try{
      const response=await fetch("/api/projects/live",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,approvalId:approval.id,resolution,responseNote:note})});
      const result=await response.json() as {ok?:boolean;error?:string};
      if(!response.ok||!result.ok)throw new Error(result.error||"Approval could not be resolved.");
      setNotes(current=>{const next={...current};delete next[approval.id];return next;});
      await load();
    }catch(e){setError(e instanceof Error?e.message:"Approval could not be resolved.");}
    finally{setBusyApproval(null);}
  };

  const status=(data?.execution?.status??initialStatus).toLowerCase();
  const isRunning=status==="running"||status==="queued";
  const counts=data?.counts??{running:0,queued:0,waitingApproval:0,waitingOther:0,completed:0,failed:0,total:0};
  const activeAgents=(data?.agents??[]).filter(agent=>agent.status==="active");
  const completion=counts.total?Math.round((counts.completed/counts.total)*100):0;
  const latestActivity=data?.activity?.[0];
  const nodes=useMemo(()=>[
    {key:"plan",label:"Plan",sub:`${counts.total} tasks`,active:isRunning},
    {key:"agents",label:"Agents",sub:`${activeAgents.length} active`,active:isRunning&&activeAgents.length>0},
    {key:"work",label:"Execution",sub:`${counts.running} running`,active:isRunning&&counts.running>0},
    {key:"queue",label:"Queue",sub:`${counts.queued} queued`,active:isRunning&&counts.queued>0},
    {key:"approval",label:"Approvals",sub:`${counts.waitingApproval} waiting`,active:counts.waitingApproval>0},
    {key:"output",label:"Outputs",sub:`${counts.completed} completed`,active:counts.completed>0},
  ],[counts,activeAgents.length,isRunning]);

  void tick;
  return <section className="liveOps" aria-live="polite">
    <style jsx>{`
      .liveOps{margin-top:18px;border-radius:28px;overflow:hidden;background:linear-gradient(145deg,#07152d 0%,#0d2148 55%,#102a5b 100%);color:#f7f9ff;box-shadow:0 22px 55px rgba(7,21,45,.22);border:1px solid rgba(255,255,255,.08)}
      .head{display:flex;justify-content:space-between;gap:18px;align-items:flex-start;padding:24px 26px 8px}.eyebrow{font-size:12px;letter-spacing:.16em;font-weight:800;color:#8fa8ff;text-transform:uppercase}.head h2{font-size:26px;margin:5px 0 6px}.muted{color:#aebddd;font-size:14px;line-height:1.5}.liveBadge{display:inline-flex;align-items:center;gap:8px;border:1px solid rgba(130,255,190,.25);background:rgba(53,185,120,.12);border-radius:999px;padding:8px 12px;font-size:12px;font-weight:800;white-space:nowrap}.dot{width:9px;height:9px;border-radius:50%;background:#55e7a0;box-shadow:0 0 0 0 rgba(85,231,160,.5);animation:pulse 1.6s infinite}.dot.off{background:#8391ad;animation:none;box-shadow:none}@keyframes pulse{0%{box-shadow:0 0 0 0 rgba(85,231,160,.45)}70%{box-shadow:0 0 0 11px rgba(85,231,160,0)}100%{box-shadow:0 0 0 0 rgba(85,231,160,0)}}
      .grid{display:grid;grid-template-columns:minmax(0,1.45fr) minmax(290px,.75fr);gap:18px;padding:18px 26px 26px}.canvas{position:relative;min-height:390px;border-radius:22px;border:1px solid rgba(255,255,255,.1);background:radial-gradient(circle at 50% 45%,rgba(89,119,255,.16),transparent 34%),rgba(255,255,255,.035);overflow:hidden}.canvas:before{content:"";position:absolute;inset:0;background-image:linear-gradient(rgba(255,255,255,.035) 1px,transparent 1px),linear-gradient(90deg,rgba(255,255,255,.035) 1px,transparent 1px);background-size:32px 32px;mask-image:linear-gradient(to bottom,rgba(0,0,0,.8),transparent)}
      .core{position:absolute;left:50%;top:50%;transform:translate(-50%,-50%);width:150px;height:150px;border-radius:50%;display:grid;place-items:center;text-align:center;background:radial-gradient(circle at 35% 30%,#3158c9,#183a82 60%,#0b2555);border:1px solid rgba(168,190,255,.35);box-shadow:0 0 0 14px rgba(80,113,226,.07),0 0 40px rgba(70,105,255,.3);z-index:3}.core.running{animation:coreBreath 2.4s ease-in-out infinite}@keyframes coreBreath{50%{box-shadow:0 0 0 22px rgba(80,113,226,.03),0 0 56px rgba(70,105,255,.42)}}.core strong{display:block;font-size:18px}.core span{display:block;color:#b8c7e8;font-size:12px;margin-top:4px}
      .node{position:absolute;width:132px;padding:12px;border-radius:16px;background:rgba(8,24,55,.84);border:1px solid rgba(255,255,255,.1);backdrop-filter:blur(10px);z-index:4}.node.active{border-color:rgba(111,161,255,.52);box-shadow:0 9px 25px rgba(0,0,0,.18)}.node strong{font-size:13px}.node span{display:block;color:#9fb0d2;font-size:11px;margin-top:4px}.node i{position:absolute;right:10px;top:10px;width:7px;height:7px;border-radius:50%;background:#63708b}.node.active i{background:#61dba0;animation:blink 1.4s infinite}@keyframes blink{50%{opacity:.35}}.n0{left:7%;top:10%}.n1{right:7%;top:10%}.n2{left:4%;top:42%}.n3{right:4%;top:42%}.n4{left:10%;bottom:9%}.n5{right:10%;bottom:9%}
      .flowLine{position:absolute;height:2px;background:linear-gradient(90deg,transparent,rgba(110,148,255,.5),transparent);transform-origin:left center;z-index:1;overflow:hidden}.flowLine:after{content:"";position:absolute;width:36px;height:100%;background:linear-gradient(90deg,transparent,#7fd1ff,transparent);animation:travel 2.1s linear infinite}.f1{left:24%;top:27%;width:27%;transform:rotate(23deg)}.f2{left:51%;top:27%;width:25%;transform:rotate(-23deg)}.f3{left:20%;top:52%;width:31%}.f4{left:51%;top:52%;width:31%}.f5{left:24%;top:73%;width:28%;transform:rotate(-21deg)}.f6{left:51%;top:73%;width:28%;transform:rotate(21deg)}@keyframes travel{from{left:-38px}to{left:100%}}.paused .flowLine:after{animation-play-state:paused;opacity:.25}
      .side{display:flex;flex-direction:column;gap:12px}.metrics{display:grid;grid-template-columns:repeat(2,1fr);gap:10px}.metric{padding:14px;border-radius:16px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08)}.metric span{font-size:11px;color:#9caed1}.metric strong{display:block;font-size:24px;margin-top:3px}.progress{padding:14px;border-radius:16px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08)}.bar{height:7px;background:rgba(255,255,255,.09);border-radius:999px;overflow:hidden;margin-top:10px}.fill{height:100%;background:linear-gradient(90deg,#5d88ff,#60ddae);border-radius:999px;transition:width .5s ease}.ticker{padding:14px;border-radius:16px;background:rgba(255,255,255,.055);border:1px solid rgba(255,255,255,.08)}.ticker strong{font-size:13px}.ticker p{margin:6px 0 0;color:#aebddd;font-size:12px;line-height:1.45}.miniAgent{display:flex;align-items:center;gap:8px;margin-top:8px}.avatar{width:28px;height:28px;border-radius:9px;display:grid;place-items:center;background:#24498f;font-size:10px;font-weight:900}.agentText{font-size:11px;color:#aebddd}
      .approvals{padding:0 26px 26px}.approvalHead{display:flex;justify-content:space-between;align-items:center;margin-bottom:10px}.approvalHead h3{margin:0;font-size:18px}.approvalGrid{display:grid;grid-template-columns:repeat(auto-fit,minmax(280px,1fr));gap:12px}.approval{padding:15px;border-radius:18px;background:rgba(255,255,255,.06);border:1px solid rgba(255,190,93,.2)}.approvalTop{display:flex;justify-content:space-between;gap:10px}.risk{font-size:10px;text-transform:uppercase;letter-spacing:.08em;padding:5px 8px;border-radius:999px;background:rgba(255,177,81,.12);color:#ffd19a;height:max-content}.approval p{color:#b5c4e1;font-size:12px;line-height:1.45}.note{width:100%;box-sizing:border-box;margin-top:8px;min-height:64px;border-radius:12px;border:1px solid rgba(255,255,255,.12);background:rgba(4,14,35,.55);color:white;padding:10px;resize:vertical}.buttons{display:flex;gap:8px;margin-top:9px}.buttons button{border:0;border-radius:11px;padding:9px 12px;font-weight:800;cursor:pointer}.approve{background:#66d9a4;color:#08271b}.reject{background:rgba(255,255,255,.1);color:#fff;border:1px solid rgba(255,255,255,.1)!important}.buttons button:disabled{opacity:.45;cursor:not-allowed}.error{margin:0 26px 18px;padding:10px 12px;border-radius:12px;background:rgba(255,99,99,.12);border:1px solid rgba(255,99,99,.2);color:#ffd3d3;font-size:12px}.emptyApproval{padding:12px 0 0;color:#91a3c6;font-size:12px}
      @media(max-width:920px){.grid{grid-template-columns:1fr}.canvas{min-height:420px}.head{flex-direction:column}.n0{left:4%}.n1{right:4%}.n4{left:5%}.n5{right:5%}}@media(max-width:620px){.grid,.head,.approvals{padding-left:16px;padding-right:16px}.canvas{min-height:500px}.node{width:112px}.n0{left:4%;top:7%}.n1{right:4%;top:7%}.n2{left:3%;top:34%}.n3{right:3%;top:34%}.n4{left:4%;bottom:8%}.n5{right:4%;bottom:8%}.core{width:126px;height:126px}.flowLine{opacity:.45}}
      @media(prefers-reduced-motion:reduce){.dot,.core.running,.node.active i,.flowLine:after{animation:none!important}}
    `}</style>

    <div className="head">
      <div><div className="eyebrow">Live company operations</div><h2>{isRunning?"Your AI team is working":"Project runtime"}</h2><div className="muted">A live operational view of agents, task flow, queues, approvals and completed work. The animation is symbolic; counts and statuses are real.</div></div>
      <div className="liveBadge"><span className={`dot ${isRunning?"":"off"}`}/>{isRunning?"LIVE · server-side":"NOT RUNNING"}</div>
    </div>

    {error?<div className="error">{error}</div>:null}

    <div className="grid">
      <div className={`canvas ${isRunning?"":"paused"}`}>
        <div className="flowLine f1"/><div className="flowLine f2"/><div className="flowLine f3"/><div className="flowLine f4"/><div className="flowLine f5"/><div className="flowLine f6"/>
        <div className={`core ${isRunning?"running":""}`}><div><strong>Project Runtime</strong><span>{data?.execution?`Execution #${data.execution.execution_no}`:"Awaiting run"}</span><span>{statusLabel(status)}</span></div></div>
        {nodes.map((node,index)=><div className={`node n${index} ${node.active?"active":""}`} key={node.key}><i/><strong>{node.label}</strong><span>{node.sub}</span></div>)}
      </div>

      <aside className="side">
        <div className="metrics">
          <div className="metric"><span>Running now</span><strong>{counts.running}</strong></div>
          <div className="metric"><span>Queued next</span><strong>{counts.queued}</strong></div>
          <div className="metric"><span>Awaiting CEO</span><strong>{counts.waitingApproval}</strong></div>
          <div className="metric"><span>Completed</span><strong>{counts.completed}</strong></div>
        </div>
        <div className="progress"><span className="muted">Task completion</span><strong style={{float:"right"}}>{completion}%</strong><div className="bar"><div className="fill" style={{width:`${completion}%`}}/></div></div>
        <div className="ticker"><strong>Latest activity</strong><p>{latestActivity?latestActivity.headline:"No runtime activity yet."}</p>{latestActivity?<p>{latestActivity.detail||statusLabel(latestActivity.event_type)} · {since(latestActivity.created_at)}</p>:null}</div>
        <div className="ticker"><strong>Active specialists</strong>{activeAgents.slice(0,4).map(row=>{const a=row.agents;const name=a?.display_name||a?.name||a?.agent_code||"Agent";return <div className="miniAgent" key={row.agent_id}><div className="avatar">{name.slice(0,2).toUpperCase()}</div><div className="agentText"><b style={{color:"#eef3ff"}}>{name}</b><br/>{a?.role_title||row.assignment_role}</div></div>})}{!activeAgents.length?<p>No agent currently marked active.</p>:null}</div>
        <div className="ticker"><strong>Heartbeat</strong><p>{data?.execution?.last_heartbeat_at?`${since(data.execution.last_heartbeat_at)} · ${new Date(data.execution.last_heartbeat_at).toLocaleTimeString()}`:"No execution heartbeat yet."}</p></div>
      </aside>
    </div>

    <div className="approvals">
      <div className="approvalHead"><h3>CEO decision queue</h3><span className="liveBadge"><span className={`dot ${data?.approvals?.length?"":"off"}`}/>{data?.approvals?.length??0} pending</span></div>
      {data?.approvals?.length?<div className="approvalGrid">{data.approvals.map(approval=><article className="approval" key={approval.id}>
        <div className="approvalTop"><div><strong>{approval.title}</strong><p>{approval.summary}</p></div><span className="risk">{approval.risk_level} risk</span></div>
        <textarea className="note" value={notes[approval.id]??""} onChange={event=>setNotes(current=>({...current,[approval.id]:event.target.value}))} placeholder="CEO note / reason (required)"/>
        <div className="buttons"><button className="approve" disabled={busyApproval===approval.id} onClick={()=>void resolve(approval,"approved")}>{busyApproval===approval.id?"Saving…":"Approve & continue"}</button><button className="reject" disabled={busyApproval===approval.id} onClick={()=>void resolve(approval,"rejected")}>Reject</button></div>
      </article>)}</div>:<div className="emptyApproval">No project approval is waiting for you. Independent work continues automatically.</div>}
    </div>
  </section>;
}
