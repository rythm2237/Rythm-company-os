import assert from "node:assert/strict";
import React,{act} from "react";
import {JSDOM} from "jsdom";
import {compareProgramMeasurements,type ProgramMeasurement} from "../lib/projects/program-measurements";
import {ProjectWorkList} from "../components/projects/ProjectWorkList";

async function main(){
 const baseline:ProgramMeasurement={id:"b",metric_name:"organic_clicks",measurement_kind:"baseline",source:"authorized",value:100,unit:"clicks",measurement_start:"2026-01-01T00:00:00Z",measurement_end:"2026-01-31T00:00:00Z",segmentation:{page:"/"}};
 const outcome:ProgramMeasurement={...baseline,id:"o",measurement_kind:"outcome",value:80,measurement_start:"2026-02-01T00:00:00Z",measurement_end:"2026-03-03T00:00:00Z"};
 const compared=compareProgramMeasurements([baseline,outcome]);assert.equal(compared.comparisons[0].observedChangePercent,-20);assert.equal(compared.comparisons[0].causality,"not_established");
 assert.equal(compareProgramMeasurements([outcome]).sufficientForTrendProposal,false);
 assert.equal(compareProgramMeasurements([baseline,{...outcome,source:"estimated_ai_visibility"}]).sufficientForTrendProposal,false);
 assert.equal(compareProgramMeasurements([baseline,{...outcome,unit:"impressions"}]).sufficientForTrendProposal,false);
 assert.equal(compareProgramMeasurements([baseline,{...outcome,segmentation:{page:"/other"}}]).sufficientForTrendProposal,false);
 assert.equal(compareProgramMeasurements([baseline,{...outcome,measurement_end:"2026-03-02T00:00:00Z"}]).sufficientForTrendProposal,false);
 assert.equal(compareProgramMeasurements([{...baseline,value:0},outcome]).comparisons[0].observedChangePercent,null);
 const dom=new JSDOM('<!doctype html><html><body><main id="root"></main></body></html>',{url:"https://example.test/projects/operating?project=p&view=work&taskAgent=agent",pretendToBeVisual:true});
 Object.assign(globalThis,{React,window:dom.window,document:dom.window.document,location:dom.window.location,history:dom.window.history,Element:dom.window.Element,HTMLElement:dom.window.HTMLElement,IS_REACT_ACT_ENVIRONMENT:true});
 // jsdom does not implement native modal behavior. Browser focus/viewport QA is a separate release gate.
 dom.window.HTMLDialogElement.prototype.showModal=function(){this.setAttribute("open","");};
 dom.window.HTMLDialogElement.prototype.close=function(){this.removeAttribute("open");};
 const {createRoot}=await import("react-dom/client");const container=document.getElementById("root")!;const root=createRoot(container);
 const original=globalThis.fetch;let calls=0;let finish!:(r:Response)=>void;
 globalThis.fetch=(()=>{calls++;return new Promise<Response>(resolve=>{finish=resolve;});}) as typeof fetch;
 try{
  await act(async()=>root.render(<ProjectWorkList projectId="p" items={[{id:"t",title:"Technical SEO audit",status:"running",priority:1},{id:"c",title:"Closed item",status:"completed",priority:3}]}/>));
  assert.doesNotMatch(container.textContent!,/Closed item/);assert.equal(calls,0);
  await act(async()=>container.querySelector<HTMLButtonElement>(".project-work-row")!.click());
  assert.equal(calls,1);assert.equal(new URL(location.href).searchParams.get("item"),"t");assert.match(container.textContent!,/Loading details/);
  await act(async()=>finish(Response.json({item:{id:"t",status:"running",description:"Detailed instructions",safe_result:{evidence:"Recorded artifact"},dependencies:[]}})));
  assert.match(container.querySelector("dialog")!.textContent!,/Detailed instructions/);assert.equal(container.querySelector("dialog details")!.hasAttribute("open"),false);
  await act(async()=>container.querySelector<HTMLButtonElement>('button[aria-label="Close details"]')!.click());
  assert.equal(container.querySelector("dialog"),null);assert.equal(new URL(location.href).searchParams.get("item"),null);assert.equal(new URL(location.href).searchParams.get("taskAgent"),"agent");assert.equal(new URL(location.href).searchParams.get("view"),"work");
  await act(async()=>{const select=container.querySelector("select")!;select.value="completed";select.dispatchEvent(new dom.window.Event("change",{bubbles:true}));});
  assert.match(container.textContent!,/Closed item/);assert.doesNotMatch(container.textContent!,/Technical SEO audit/);
  console.log("Project experience behavior passed: comparable KPI evidence, attribution separation, lazy details, collapsed evidence, stable URL/filters and completed-work filtering.");
 }finally{await act(async()=>root.unmount());globalThis.fetch=original;dom.window.close();}
}
main().catch(error=>{console.error(error);process.exitCode=1;});
