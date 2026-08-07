"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import styles from "./ProjectPulse.module.css";

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
  const foundPrev=ordered.findIndex(n=>n.stage_code===event?.previous_node);
  const foundNew=ordered.findIndex(n=>n.stage_code===event?.new_node);
  const prevIndex=Math.max(0,foundPrev);
  const newIndex=Math.max(prevIndex,foundNew<0?prevIndex:foundNew);

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
      setProgress(Math.round(event.previous_progress+(event.new_progress-event.previous_progress)*eased));
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
  const tokenStyle={"--pulse-position":`${tokenPosition}%`} as CSSProperties;

  const nodeState=(node:PulseNode)=>{
    const i=ordered.findIndex(n=>n.stage_code===node.stage_code);
    if(event.event_state==="blocked"&&i===newIndex)return "blocked";
    if(event.event_state==="waiting_approval"&&i===newIndex)return "waiting_approval";
    if(i<newIndex)return "completed";
    if(i===newIndex)return done?"current":"upcoming";
    return "upcoming";
  };

  const stateClass=(state:string)=>state==="completed"?styles.completed:state==="current"?styles.currentNode:state==="blocked"?styles.blocked:state==="waiting_approval"?styles.waiting:styles.upcoming;

  return <div className={styles.backdrop} role="presentation">
    <section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="pulse-title">
      <div className={styles.header}>
        <div><p className="eyebrow">RYTHM PROJECT PULSE</p><h2 id="pulse-title">{event.event_label}</h2><p>{project.project_code} · {project.name}</p></div>
        <button className={styles.close} onClick={close} aria-label="Close Project Pulse">×</button>
      </div>

      <div className={styles.summary}>
        <div><span>Previous</span><strong>{event.previous_progress}%</strong></div>
        <div className={styles.current}><span>Project progress</span><strong aria-live="polite">{progress}%</strong></div>
        <div><span>Destination</span><strong>{event.new_progress}%</strong></div>
      </div>

      <div className={styles.roadmapWrap} aria-label="Project roadmap">
        <div className={styles.track} aria-hidden="true"><span className={styles.token} style={tokenStyle} /></div>
        <ol className={styles.roadmap}>
          {ordered.map(node=>{const state=nodeState(node);return <li key={node.stage_code} className={`${styles.node} ${stateClass(state)}`}>
            <div className={styles.marker} aria-hidden="true">{iconFor(state)}</div>
            <div className={styles.copy}><strong>{node.label}</strong><span>{labelFor(state)}</span><small>{node.weight_percent}% weight</small></div>
          </li>;})}
        </ol>
      </div>

      <div className={styles.footer}>
        <div><span className={styles.kicker}>Transition</span><strong>{ordered[prevIndex]?.label??event.previous_node} → {ordered[newIndex]?.label??event.new_node}</strong></div>
        <div><span className={styles.kicker}>Next governed step</span><strong>{event.next_step??"Continue under project governance."}</strong></div>
        <button className={`primary-link ${styles.continue}`} onClick={close}>{done?"Continue":"View progress"}</button>
      </div>
    </section>
  </div>;
}
