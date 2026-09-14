"use client";

import { useEffect } from "react";

const groupFor=(text:string)=>{
  const value=text.toLowerCase();
  if(/access|connect|permission|credential|repository|cms|search console|analytics|property/.test(value))return "access_connections";
  if(/budget|spend|paid|campaign|ads|media|subscription|purchase/.test(value))return "budget_commercial";
  if(/legal|contract|compliance|privacy|liability|intellectual property/.test(value))return "legal_risk";
  if(/production|deploy|publish|delete|destructive|release/.test(value))return "production_change";
  if(/scope|objective|milestone|strategy|positioning|audience|kpi/.test(value))return "strategy_scope";
  if(/client|email|message|communication|send/.test(value))return "client_communication";
  return "other";
};
const groupLabel:Record<string,string>={access_connections:"Access & connections",budget_commercial:"Budget & commercial",legal_risk:"Legal & compliance",production_change:"Production changes",strategy_scope:"Strategy & scope",client_communication:"Client communication",other:"Other decisions"};
const riskWeight=(risk:string)=>risk==="critical"?4:risk==="high"?3:risk==="medium"?2:1;

export default function ProjectExecutiveSignalEnhancer(){
  useEffect(()=>{
    if(!window.location.pathname.includes("/projects/operating"))return;
    let disposed=false;

    const toast=(message:string,kind:"ok"|"error"="ok")=>{
      document.querySelector(".rythm-exec-toast")?.remove();
      const node=document.createElement("div");node.className=`rythm-exec-toast ${kind}`;node.textContent=message;document.body.appendChild(node);window.setTimeout(()=>node.remove(),4500);
    };

    const makeCollapsible=(panel:HTMLElement,defaultClosed:boolean)=>{
      if(panel.dataset.rythmCollapsible==="1")return;
      const heading=panel.querySelector(":scope > .panel-heading") as HTMLElement|null;if(!heading)return;
      const title=(heading.textContent??"").trim();
      if(/roadmap|executive inbox|your attention/i.test(title))return;
      panel.dataset.rythmCollapsible="1";
      const button=document.createElement("button");button.type="button";button.className="rythm-collapse-button";
      const set=(closed:boolean)=>{panel.classList.toggle("rythm-panel-collapsed",closed);button.textContent=closed?"Expand":"Collapse";button.setAttribute("aria-expanded",String(!closed));};
      button.addEventListener("click",()=>set(!panel.classList.contains("rythm-panel-collapsed")));
      heading.appendChild(button);set(defaultClosed);
    };

    const makeRuntimeCompact=()=>{
      const runtime=document.querySelector(".aiRuntime") as HTMLElement|null;if(!runtime||runtime.dataset.rythmCompact==="1")return;
      runtime.dataset.rythmCompact="1";
      const top=runtime.querySelector(".top") as HTMLElement|null;
      const consoleEl=runtime.querySelector(".console") as HTMLElement|null;
      const tasks=runtime.querySelector(".tasks") as HTMLElement|null;
      if(consoleEl){consoleEl.classList.add("rythm-runtime-hidden");const b=document.createElement("button");b.className="rythm-runtime-toggle";b.textContent="Show live AI map";b.onclick=()=>{const hidden=consoleEl.classList.toggle("rythm-runtime-hidden");b.textContent=hidden?"Show live AI map":"Hide live AI map";};top?.appendChild(b);}
      if(tasks){tasks.classList.add("rythm-runtime-hidden");const b=document.createElement("button");b.className="rythm-runtime-toggle";b.textContent="Show workstreams";b.onclick=()=>{const hidden=tasks.classList.toggle("rythm-runtime-hidden");b.textContent=hidden?"Show workstreams":"Hide workstreams";};top?.appendChild(b);}
    };

    const enhanceApprovals=()=>{
      const approvals=document.querySelector(".aiRuntime .approvals") as HTMLElement|null;if(!approvals)return;
      const grid=approvals.querySelector(".approvalGrid") as HTMLElement|null;if(!grid)return;
      const cards=Array.from(grid.querySelectorAll(":scope > .approval")) as HTMLElement[];if(!cards.length)return;
      const expanded=approvals.dataset.rythmExpanded==="1";
      const signature=cards.map(card=>`${card.querySelector("[data-approval-id]")?.getAttribute("data-approval-id")??"?"}:${(card.querySelector(".risk")?.textContent??"").trim().toLowerCase()}`).join("|")+`:${expanded}`;
      if(approvals.dataset.rythmSignature===signature)return;
      approvals.dataset.rythmSignature=signature;

      cards.forEach(card=>{const risk=(card.querySelector(".risk")?.textContent??"").trim().toLowerCase();card.style.order=String(10-riskWeight(risk));});
      const sorted=[...cards].sort((a,b)=>riskWeight((b.querySelector(".risk")?.textContent??"").trim().toLowerCase())-riskWeight((a.querySelector(".risk")?.textContent??"").trim().toLowerCase()));
      sorted.forEach((card,index)=>card.classList.toggle("rythm-approval-hidden",!expanded&&index>=4));

      let toolbar=approvals.querySelector(".rythm-attention-toolbar") as HTMLElement|null;
      if(!toolbar){toolbar=document.createElement("div");toolbar.className="rythm-attention-toolbar";const head=approvals.querySelector(".approvalHead");head?.insertAdjacentElement("afterend",toolbar);}
      const risks=cards.reduce((acc,card)=>{const r=(card.querySelector(".risk")?.textContent??"other").trim().toLowerCase();acc[r]=(acc[r]??0)+1;return acc;},{} as Record<string,number>);
      toolbar.innerHTML=`<div class="rythm-attention-summary"><strong>${cards.length} executive decision${cards.length===1?"":"s"}</strong><span>${risks.critical??0} critical · ${risks.high??0} high · ${risks.medium??0} medium</span></div>`;
      if(cards.length>4){const toggle=document.createElement("button");toggle.type="button";toggle.className="rythm-package-button secondary";toggle.textContent=expanded?"Show priority only":`Show all ${cards.length}`;toggle.onclick=()=>{approvals.dataset.rythmExpanded=expanded?"0":"1";approvals.dataset.rythmSignature="";enhanceApprovals();};toolbar.appendChild(toggle);}

      const groups=new Map<string,HTMLElement[]>();cards.forEach(card=>{const key=groupFor(card.textContent??"");const list=groups.get(key)??[];list.push(card);groups.set(key,list);});
      groups.forEach((items,key)=>{
        if(items.length<2)return;
        const ids=items.map(card=>card.querySelector("[data-approval-id]")?.getAttribute("data-approval-id")).filter((id):id is string=>Boolean(id));
        const hasCritical=items.some(card=>(card.querySelector(".risk")?.textContent??"").trim().toLowerCase()==="critical");
        if(ids.length<2||hasCritical)return;
        const button=document.createElement("button");button.type="button";button.className="rythm-package-button";button.textContent=`Approve ${groupLabel[key]} package (${ids.length})`;
        button.onclick=async()=>{
          if(button.dataset.busy==="1")return;button.dataset.busy="1";button.textContent="Approving package…";
          const projectId=new URLSearchParams(window.location.search).get("project")??"";let approved=0;
          for(const approvalId of ids){try{const response=await fetch("/api/projects/live",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,approvalId,resolution:"approved",responseNote:`Approved by Human CEO as part of the ${groupLabel[key]} decision package.`})});const payload=await response.json();if(response.ok&&payload?.ok)approved++;}catch{}}
          if(approved===ids.length){toast(`${approved} ${groupLabel[key]} decisions approved. Related workstreams can continue.`);window.setTimeout(()=>window.location.reload(),700);}else{toast(`${approved}/${ids.length} decisions were approved. Review the remaining items individually.`,"error");button.dataset.busy="0";button.textContent=`Approve ${groupLabel[key]} package (${ids.length})`;}
        };
        toolbar?.appendChild(button);
      });
    };

    const apply=()=>{
      if(disposed)return;makeRuntimeCompact();enhanceApprovals();
      document.querySelectorAll(".project-view-panel.panel,.project-view-panel > .panel").forEach((node,index)=>makeCollapsible(node as HTMLElement,index>0));
    };
    apply();const observer=new MutationObserver(()=>window.requestAnimationFrame(apply));observer.observe(document.body,{childList:true,subtree:true});
    return()=>{disposed=true;observer.disconnect();};
  },[]);

  return <style jsx global>{`
    .rythm-panel-collapsed>:not(.panel-heading){display:none!important}.rythm-collapse-button,.rythm-runtime-toggle,.rythm-package-button{border:1px solid #d7dfeb;background:#fff;color:#172033;border-radius:10px;padding:7px 10px;font-weight:800;font-size:11px;cursor:pointer}.rythm-collapse-button{margin-left:auto}.rythm-runtime-toggle{margin-left:8px;background:rgba(9,26,48,.7);border-color:rgba(102,202,255,.2);color:#9edfff}.rythm-runtime-hidden{display:none!important}.rythm-attention-toolbar{display:flex;flex-wrap:wrap;align-items:center;gap:8px;margin:0 0 12px;padding:10px 11px;border-radius:13px;border:1px solid rgba(125,122,255,.18);background:rgba(22,17,48,.45)}.rythm-attention-summary{display:flex;flex-direction:column;gap:2px;margin-right:auto}.rythm-attention-summary strong{font-size:11px;color:#e9e7ff}.rythm-attention-summary span{font:700 9px ui-monospace,monospace;color:#908da9}.rythm-package-button{background:linear-gradient(135deg,#655bf1,#4e8df7);border:0;color:#fff}.rythm-package-button.secondary{background:rgba(255,255,255,.07);border:1px solid rgba(255,255,255,.1);color:#c7d2df}.rythm-approval-hidden{display:none!important}.rythm-exec-toast{position:fixed;right:22px;bottom:22px;z-index:9999;max-width:420px;padding:12px 14px;border-radius:12px;background:#102a23;color:#caffed;border:1px solid #2d6b5a;box-shadow:0 18px 50px rgba(0,0,0,.25);font-weight:750;font-size:12px}.rythm-exec-toast.error{background:#38151b;color:#ffd5dc;border-color:#7a2b3a}@media(max-width:700px){.rythm-attention-toolbar{align-items:stretch}.rythm-package-button{width:100%}}
  `}</style>;
}
