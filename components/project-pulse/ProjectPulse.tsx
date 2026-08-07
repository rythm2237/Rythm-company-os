"use client";

import { useEffect, useMemo, useState } from "react";

type PulseEvent = {
  id:string;
  event_type:string;
  event_label:string;
  previous_progress:number;
  new_progress:number;
  previous_node:string|null;
  new_node:string|null;
  event_state:"completed"|"current"|"upcoming"|"blocked"|"waiting_approval";
  next_step:string|null;
};

type PulseNode = {
  stage_code:string;
  label:string;
  sequence_no:number;
  weight_percent:number;
  node_type:string;
};

type ProjectInfo = { project_code:string; name:string };

type Props = { event:PulseEvent|null; nodes:PulseNode[]; project:ProjectInfo|null };

const iconFor=(state:string)=>state==="completed"?"✓":state==="current"?"●":state==="blocked"?"!":state==="waiting_approval"?"⏳":"○";
const labelFor=(state:string)=>state==="completed"?"Completed":state==="current"?"Current":state==="blocked"?"Blocked":state==="waiting_approval"?"Waiting for approval":"Upcoming";

export default function ProjectPulse({event,nodes,project}:Props){
  const [open,setOpen]=useState(false);
  const [progress,setProgress]=useState(event?.previous_progress??0);
  const [tokenProgress,setTokenProgress]=useState(0);
  const [done,setDone]=useState(false);

  const ordered=useMemo(()=>[...nodes].sort((a,b)=>a.sequence_no-b.sequence_no),[nodes]);
  const prevIndex=Math.max(0,ordered.findIndex(n=>n.stage_code===event?.previous_node));
  const newIndex=Math.max(prevIndex,ordered.findIndex(n=>n.stage_code===event?.new_node));

  useEffect(()=>{
    if(!event||!project||!ordered.length)return;
    const key=`rythm-project-pulse:${event.id}`;
    if(window.localStorage.getItem(key)==="seen")return;
    setOpen(true);

    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduced){setProgress(event.new_progress);setTokenProgress(1);setDone(true);return;}

    const delta=Math.abs(event.new_progress-event.previous_progress);
    const distance=Math.max(1,newIndex-prevIndex);
    const duration=Math.min(3000,Math.max(1500,1500+distance*220+delta*24));
    const started=performance.now();
    let frame=0;
    const tick=(now:number)=>{
      const t=Math.min(1,(now-started)/duration);
      const eased=1-Math.pow(1-t,3);
      setTokenProgress(eased);
      const next=Math.round(event.previous_progress+(event.new_progress-event.previous_progress)*eased);
      setProgress(next);
      if(t<1) frame=requestAnimationFrame(tick);
      else {setProgress(event.new_progress);setTokenProgress(1);setDone(true);}
    };
    frame=requestAnimationFrame(tick);
    return()=>cancelAnimationFrame(frame);
  },[event,project,ordered.length,prevIndex,newIndex]);

  if(!open||!event||!project||!ordered.length)return null;

  const close=()=>{
    window.localStorage.setItem(`rythm-project-pulse:${event.id}`,"seen");
    setOpen(false);
  };

  const segmentCount=Math.max(1,ordered.length-1);
  const tokenStart=(prevIndex/segmentCount)*100;
  const tokenEnd=(newIndex/segmentCount)*100;
  const tokenPosition=tokenStart+(tokenEnd-tokenStart)*tokenProgress;

  const nodeState=(node:PulseNode)=>{
    const i=ordered.findIndex(n=>n.stage_code===node.stage_code);
    if(event.event_state==="blocked"&&i===newIndex)return "blocked";
    if(event.event_state==="waiting_approval"&&i===newIndex)return "waiting_approval";
    if(i<newIndex)return "completed";
    if(i===newIndex)return done?"current":"upcoming";
    return "upcoming";
  };

  return <div className="pulse-backdrop" role="presentation">
    <section className="pulse-modal" role="dialog" aria-modal="true" aria-labelledby="pulse-title">
      <div className="pulse-header">
        <div><p className="eyebrow">RYTHM PROJECT PULSE</p><h2 id="pulse-title">{event.event_label}</h2><p>{project.project_code} · {project.name}</p></div>
        <button className="pulse-close" onClick={close} aria-label="Close Project Pulse">×</button>
      </div>

      <div className="pulse-progress-summary">
        <div><span>Previous</span><strong>{event.previous_progress}%</strong></div>
        <div className="pulse-current"><span>Project progress</span><strong>{progress}%</strong></div>
        <div><span>Destination</span><strong>{event.new_progress}%</strong></div>
      </div>

      <div className="pulse-roadmap-wrap" aria-label="Project roadmap">
        <div className="pulse-track" aria-hidden="true"><span className="pulse-token" style={{left:`${tokenPosition}%`}} /></div>
        <ol className="pulse-roadmap">
          {ordered.map(node=>{const state=nodeState(node);return <li key={node.stage_code} className={`pulse-node pulse-node-${state}`}>
            <div className="pulse-node-marker" aria-hidden="true">{iconFor(state)}</div>
            <div className="pulse-node-copy"><strong>{node.label}</strong><span>{labelFor(state)}</span><small>{node.weight_percent}% weight</small></div>
          </li>;})}
        </ol>
      </div>

      <div className="pulse-footer">
        <div><span className="pulse-kicker">Transition</span><strong>{ordered[prevIndex]?.label??event.previous_node} → {ordered[newIndex]?.label??event.new_node}</strong></div>
        <div><span className="pulse-kicker">Next governed step</span><strong>{event.next_step??"Continue under project governance."}</strong></div>
        <button className="primary-link pulse-continue" onClick={close}>{done?"Continue":"View progress"}</button>
      </div>
    </section>
  </div>;
}
