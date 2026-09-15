"use client";

import { useEffect, useMemo, useState } from "react";
import { getIntegrationGuideDefinition } from "./integration-guide-data";

type GuideEventDetail={providerKey?:string;open?:boolean;step?:number};
const STORAGE_KEY="rythm.integrationGuide.v3";

function readStored(){if(typeof window==="undefined")return null;try{return JSON.parse(window.sessionStorage.getItem(STORAGE_KEY)||"null") as {providerKey?:string;open?:boolean;step?:number}|null;}catch{return null;}}

export function IntegrationSetupGuide(){
  const [providerKey,setProviderKey]=useState("");const [open,setOpen]=useState(false);const [step,setStep]=useState(0);
  useEffect(()=>{
    const stored=readStored();if(stored){setProviderKey(stored.providerKey||"");setOpen(Boolean(stored.open));setStep(Number.isFinite(stored.step)?Number(stored.step):0);}
    const marker=document.querySelector<HTMLElement>("[data-integration-guide-provider]");if(marker?.dataset.integrationGuideProvider)setProviderKey(marker.dataset.integrationGuideProvider);
    const select=document.querySelector<HTMLSelectElement>('select[name="providerKey"]');const update=()=>{if(select?.value){setProviderKey(select.value);setStep(0);}};update();select?.addEventListener("change",update);
    const onOpen=(event:Event)=>{const detail=(event as CustomEvent<GuideEventDetail>).detail||{};if(detail.providerKey)setProviderKey(detail.providerKey);if(Number.isFinite(detail.step))setStep(Number(detail.step));setOpen(detail.open!==false);};
    window.addEventListener("rythm:integration-guide",onOpen as EventListener);return()=>{select?.removeEventListener("change",update);window.removeEventListener("rythm:integration-guide",onOpen as EventListener);};
  },[]);
  useEffect(()=>{try{window.sessionStorage.setItem(STORAGE_KEY,JSON.stringify({providerKey,open,step}));}catch{/* optional */}},[providerKey,open,step]);
  const guide=useMemo(()=>getIntegrationGuideDefinition(providerKey),[providerKey]);const safeStep=Math.min(Math.max(step,0),guide.steps.length-1);
  function showTarget(){const selector=guide.targets[Math.min(safeStep,guide.targets.length-1)];if(!selector)return;const element=document.querySelector<HTMLElement>(selector);if(!element)return;element.scrollIntoView({behavior:"smooth",block:"center"});element.focus?.({preventScroll:true});element.dataset.guideHighlighted="true";window.setTimeout(()=>delete element.dataset.guideHighlighted,2200);}
  if(!open)return <aside className="integration-guide" aria-label="Integration connection guide"><button type="button" onClick={()=>setOpen(true)} className="integration-guide-launch">Guide this connection</button></aside>;
  return <aside className="integration-guide is-open" aria-label="Integration connection guide" aria-live="polite">
    <div className="integration-guide-head"><div><p>GUIDED CONNECTION · {safeStep+1}/{guide.steps.length}</p><h3>{guide.title}</h3></div><button type="button" aria-label="Close connection guide" onClick={()=>setOpen(false)}>Close</button></div>
    <p className="integration-guide-intro">{guide.intro}</p><div className="integration-guide-progress" role="progressbar" aria-valuemin={1} aria-valuemax={guide.steps.length} aria-valuenow={safeStep+1}><span style={{width:`${((safeStep+1)/guide.steps.length)*100}%`}}/></div>
    <div className="integration-guide-step"><strong>Step {safeStep+1}</strong><span>{guide.steps[safeStep]}</span></div>
    <div className="integration-guide-actions"><button type="button" onClick={showTarget} className="integration-guide-primary">Show me where</button>{safeStep>0?<button type="button" onClick={()=>setStep(value=>Math.max(0,value-1))}>Back</button>:null}<button type="button" onClick={()=>setStep(value=>Math.min(guide.steps.length-1,value+1))} disabled={safeStep===guide.steps.length-1}>Next</button></div>
    <div className="integration-guide-note"><strong>Security checkpoint</strong><span>{guide.note}</span></div><p className="integration-guide-persistence">Guide me and Do it with AI use the same canonical provider setup plan for supported AI providers.</p>
  </aside>;
}
