"use client";

import { useEffect, useMemo, useState, type CSSProperties } from "react";
import { useSearchParams } from "next/navigation";
import styles from "./ProjectPulse.module.css";

type PulseEvent = { id:string; project_id:string; event_type:string; event_label:string; previous_progress:number; new_progress:number; previous_node:string|null; new_node:string|null; event_state:"completed"|"current"|"upcoming"|"blocked"|"waiting_approval"; next_step:string|null; };
type PulseNode = { stage_code:string; label:string; sequence_no:number; weight_percent:number; node_type:string; };
type ProjectInfo = { project_code:string; name:string };
type Props = { event:PulseEvent|null; nodes:PulseNode[]; project:ProjectInfo|null };

const EMPTY_PULSE: Props = { event:null, nodes:[], project:null };
const iconFor=(state:string)=>state==="completed"?"✓":state==="current"?"●":state==="blocked"?"!":state==="waiting_approval"?"⏳":"○";
const labelFor=(state:string)=>state==="completed"?"Completed":state==="current"?"Current":state==="blocked"?"Blocked":state==="waiting_approval"?"Waiting for approval":"Upcoming";

export default function ProjectPulse({event,nodes,project}:Props){
  const searchParams=useSearchParams();
  const projectParam=searchParams.get("project");
  const [scoped,setScoped]=useState<Props|null>(null);
  const requiresScopedFetch=Boolean(projectParam&&event?.project_id!==projectParam);
  const active=requiresScopedFetch?(scoped??EMPTY_PULSE):{event,nodes,project};
  const activeEvent=active.event;
  const activeNodes=active.nodes;
  const activeProject=active.project;

  const [open,setOpen]=useState(false);
  const [progress,setProgress]=useState(activeEvent?.previous_progress??0);
  const [tokenProgress,setTokenProgress]=useState(0);
  const [done,setDone]=useState(false);
  const ordered=useMemo(()=>[...activeNodes].sort((a,b)=>a.sequence_no-b.sequence_no),[activeNodes]);
  const foundPrev=ordered.findIndex(n=>n.stage_code===activeEvent?.previous_node);
  const foundNew=ordered.findIndex(n=>n.stage_code===activeEvent?.new_node);
  const prevIndex=Math.max(0,foundPrev);
  const newIndex=Math.max(prevIndex,foundNew<0?prevIndex:foundNew);

  useEffect(()=>{
    if(!projectParam||event?.project_id===projectParam){setScoped(null);return;}
    const controller=new AbortController();
    setScoped(EMPTY_PULSE);
    fetch(`/api/project-pulse?project=${encodeURIComponent(projectParam)}`,{cache:"no-store",signal:controller.signal})
      .then(async response=>{
        if(!response.ok)throw new Error("Project Pulse context unavailable");
        return await response.json() as Props;
      })
      .then(payload=>setScoped({event:payload.event??null,nodes:Array.isArray(payload.nodes)?payload.nodes:[],project:payload.project??null}))
      .catch(error=>{if((error as Error).name!=="AbortError")setScoped(EMPTY_PULSE);});
    return()=>controller.abort();
  },[projectParam,event?.project_id]);

  const animate=()=>{
    if(!activeEvent)return;
    setProgress(activeEvent.previous_progress); setTokenProgress(0); setDone(false); setOpen(true);
    const reduced=window.matchMedia("(prefers-reduced-motion: reduce)").matches;
    if(reduced){setProgress(activeEvent.new_progress);setTokenProgress(1);setDone(true);return;}
    const delta=Math.abs(activeEvent.new_progress-activeEvent.previous_progress); const distance=Math.max(1,newIndex-prevIndex);
    const duration=Math.min(3000,Math.max(1500,1500+distance*220+delta*24)); const started=performance.now();
    const tick=(now:number)=>{const t=Math.min(1,(now-started)/duration); const eased=1-Math.pow(1-t,3); setTokenProgress(eased); setProgress(Math.round(activeEvent.previous_progress+(activeEvent.new_progress-activeEvent.previous_progress)*eased)); if(t<1) requestAnimationFrame(tick); else {setProgress(activeEvent.new_progress);setTokenProgress(1);setDone(true);}};
    requestAnimationFrame(tick);
  };

  useEffect(()=>{
    setOpen(false);
    if(!activeEvent||!activeProject||!ordered.length)return;
    const key=`rythm-project-pulse:${activeEvent.id}`;
    if(window.localStorage.getItem(key)==="seen")return;
    animate();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  },[activeEvent?.id,activeProject?.project_code,ordered.length]);

  if(!activeEvent||!activeProject||!ordered.length)return null;
  const close=()=>{window.localStorage.setItem(`rythm-project-pulse:${activeEvent.id}`,"seen");setOpen(false);};
  if(!open) return <button className={styles.launcher} onClick={animate} aria-label={`Open Project Pulse for ${activeProject.name}`}><span>Project Pulse</span><strong>{activeEvent.new_progress}%</strong></button>;

  const segmentCount=Math.max(1,ordered.length-1); const tokenStart=(prevIndex/segmentCount)*100; const tokenEnd=(newIndex/segmentCount)*100;
  const tokenPosition=tokenStart+(tokenEnd-tokenStart)*tokenProgress; const tokenStyle={"--pulse-position":`${tokenPosition}%`} as CSSProperties;
  const nodeState=(node:PulseNode)=>{const i=ordered.findIndex(n=>n.stage_code===node.stage_code); if(activeEvent.event_state==="blocked"&&i===newIndex)return "blocked"; if(activeEvent.event_state==="waiting_approval"&&i===newIndex)return "waiting_approval"; if(i<newIndex)return "completed"; if(i===newIndex)return done?"current":"upcoming"; return "upcoming";};
  const stateClass=(state:string)=>state==="completed"?styles.completed:state==="current"?styles.currentNode:state==="blocked"?styles.blocked:state==="waiting_approval"?styles.waiting:styles.upcoming;

  return <div className={styles.backdrop} role="presentation"><section className={styles.modal} role="dialog" aria-modal="true" aria-labelledby="pulse-title">
    <div className={styles.header}><div><p className="eyebrow">RYTHM PROJECT PULSE</p><h2 id="pulse-title">{activeEvent.event_label}</h2><p>{activeProject.project_code} · {activeProject.name}</p></div><button className={styles.close} onClick={close} aria-label="Close Project Pulse">×</button></div>
    <div className={styles.summary}><div><span>Previous</span><strong>{activeEvent.previous_progress}%</strong></div><div className={styles.current}><span>Project progress</span><strong aria-live="polite">{progress}%</strong></div><div><span>Destination</span><strong>{activeEvent.new_progress}%</strong></div></div>
    <div className={styles.roadmapWrap} aria-label="Project roadmap"><div className={styles.track} aria-hidden="true"><span className={styles.token} style={tokenStyle} /></div><ol className={styles.roadmap}>{ordered.map(node=>{const state=nodeState(node);return <li key={node.stage_code} className={`${styles.node} ${stateClass(state)}`}><div className={styles.marker} aria-hidden="true">{iconFor(state)}</div><div className={styles.copy}><strong>{node.label}</strong><span>{labelFor(state)}</span><small>{node.weight_percent}% weight</small></div></li>;})}</ol></div>
    <div className={styles.footer}><div><span className={styles.kicker}>Transition</span><strong>{ordered[prevIndex]?.label??activeEvent.previous_node} → {ordered[newIndex]?.label??activeEvent.new_node}</strong></div><div><span className={styles.kicker}>Next governed step</span><strong>{activeEvent.next_step??"Continue under project governance."}</strong></div><button className={`primary-link ${styles.continue}`} onClick={close}>{done?"Continue":"View progress"}</button></div>
  </section></div>;
}
