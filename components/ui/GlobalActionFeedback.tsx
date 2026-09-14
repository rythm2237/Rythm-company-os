"use client";

import { useEffect, useRef, useState } from "react";

const MIN_VISIBLE_MS=320;
const ACTION_WINDOW_MS=1800;

function findActionElement(target:EventTarget|null){
  if(!(target instanceof Element))return null;
  return target.closest("button, input[type='submit'], input[type='button'], [role='button'], a.button, a.primary-button, a.secondary-button") as HTMLElement|null;
}

export default function GlobalActionFeedback(){
  const [pending,setPending]=useState(0);
  const [label,setLabel]=useState("Working");
  const clickedRef=useRef<HTMLElement|null>(null);
  const startedRef=useRef(0);

  useEffect(()=>{
    const originalFetch=window.fetch.bind(window);
    let actionFetches=0;

    const clearElement=(element:HTMLElement|null)=>{
      if(!element)return;
      element.removeAttribute("data-rythm-processing");
      element.removeAttribute("aria-busy");
    };

    const onClick=(event:MouseEvent)=>{
      const element=findActionElement(event.target);
      if(!element)return;
      const disabled=(element as HTMLButtonElement).disabled||element.getAttribute("aria-disabled")==="true";
      if(disabled)return;
      if(element.dataset.rythmProcessing==="true"){
        event.preventDefault();event.stopPropagation();
        return;
      }
      clickedRef.current=element;
      element.dataset.rythmProcessing="true";
      element.setAttribute("aria-busy","true");
      startedRef.current=Date.now();
      const text=(element.getAttribute("data-processing-label")||element.textContent||"Working").trim().replace(/\s+/g," ").slice(0,42);
      setLabel(text||"Working");
      setPending(1);
      window.setTimeout(()=>{
        if(actionFetches===0&&clickedRef.current===element){clearElement(element);clickedRef.current=null;setPending(0);}
      },1400);
    };

    window.fetch=async(...args)=>{
      const actionElement=clickedRef.current;
      const actionLinked=Boolean(actionElement&&Date.now()-startedRef.current<=ACTION_WINDOW_MS);
      if(actionLinked){
        actionFetches+=1;
        actionElement!.dataset.rythmProcessing="true";
        actionElement!.setAttribute("aria-busy","true");
        setPending(actionFetches);
      }
      try{return await originalFetch(...args);}
      finally{
        if(actionLinked){
          actionFetches=Math.max(0,actionFetches-1);
          const elapsed=Date.now()-startedRef.current;
          const finish=()=>{
            if(actionFetches===0){clearElement(actionElement);if(clickedRef.current===actionElement)clickedRef.current=null;setPending(0);}else setPending(actionFetches);
          };
          if(elapsed<MIN_VISIBLE_MS)window.setTimeout(finish,MIN_VISIBLE_MS-elapsed);else finish();
        }
      }
    };

    document.addEventListener("click",onClick,true);
    return()=>{document.removeEventListener("click",onClick,true);window.fetch=originalFetch;};
  },[]);

  return <>
    <style jsx global>{`
      [data-rythm-processing="true"]{position:relative!important;pointer-events:none!important;cursor:progress!important;opacity:.82!important;transform:translateY(0)!important;box-shadow:none!important}
      [data-rythm-processing="true"]:before{content:"";display:inline-block;width:13px;height:13px;margin-right:8px;vertical-align:-2px;border:2px solid currentColor;border-right-color:transparent;border-radius:50%;animation:rythmSpin .7s linear infinite}
      @keyframes rythmSpin{to{transform:rotate(360deg)}}
      .rythm-global-action{position:fixed;top:0;left:0;right:0;z-index:2147483000;pointer-events:none;height:3px;background:transparent;overflow:hidden}
      .rythm-global-action>i{display:block;height:100%;width:42%;background:linear-gradient(90deg,#5b5cff,#00d4ff,#79ffbf);box-shadow:0 0 18px rgba(0,212,255,.85);animation:rythmActionSweep 1.05s cubic-bezier(.2,.7,.2,1) infinite}
      .rythm-action-toast{position:fixed;right:22px;bottom:22px;z-index:2147483000;display:flex;align-items:center;gap:10px;padding:11px 15px;border-radius:14px;background:rgba(7,15,34,.94);color:#eef5ff;border:1px solid rgba(102,190,255,.22);box-shadow:0 14px 40px rgba(0,0,0,.24);font-size:12px;font-weight:750;pointer-events:none;backdrop-filter:blur(14px)}
      .rythm-action-toast b{width:9px;height:9px;border-radius:50%;background:#64e8c2;box-shadow:0 0 0 0 rgba(100,232,194,.55);animation:rythmPulse 1.2s infinite}
      @keyframes rythmActionSweep{from{transform:translateX(-120%)}to{transform:translateX(340%)}}
      @keyframes rythmPulse{70%{box-shadow:0 0 0 9px rgba(100,232,194,0)}}
      @media(prefers-reduced-motion:reduce){[data-rythm-processing="true"]:before,.rythm-global-action>i,.rythm-action-toast b{animation:none!important}}
    `}</style>
    {pending>0?<><div className="rythm-global-action" aria-hidden="true"><i/></div><div className="rythm-action-toast" role="status" aria-live="polite"><b/><span>{label} · processing</span></div></>:null}
  </>;
}
