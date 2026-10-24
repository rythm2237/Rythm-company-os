import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync,mkdirSync} from "node:fs";
import {build} from "esbuild";
import {chromium} from "playwright";

const bundle=await build({stdin:{contents:'import React from "react";import {createRoot} from "react-dom/client";import {ProjectLiveOperations} from "./components/projects/project-live-operations";createRoot(document.getElementById("root")).render(<ProjectLiveOperations projectId="project" initialStatus="running"/>);',resolveDir:process.cwd(),loader:"tsx"},bundle:true,write:false,jsx:"automatic",format:"iife",define:{"process.env.NODE_ENV":'"production"'}});
const css=readFileSync("app/globals.css","utf8");
const event={id:"00000000-0000-0000-0000-000000000001",created_at:"2026-10-24T12:00:00Z",event_type:"task.handoff",headline:"Research complete → Design started",detail:"Completed research released the design work packet.",importance:"normal",metadata:{source_agent_id:"strategy",target_agent_id:"design"}};
const agents=[{agent_id:"strategy",status:"active",assignment_role:"Discovery lead",agents:{name:"Strategy specialist",role_title:"Strategy Director",department:"Strategy"}},{agent_id:"design",status:"active",assignment_role:"Design lead",agents:{name:"Design specialist",role_title:"UX Designer",department:"Creative"}}];
let recorded=false,failure=false;const requests=[];
const server=createServer((req,res)=>{
 if(req.url==="/bundle.js"){res.setHeader("Content-Type","application/javascript");res.end(bundle.outputFiles[0].text);return;}
 if(req.url?.startsWith("/api/projects/live")){
  requests.push(req.url);res.setHeader("Content-Type","application/json");if(failure){res.writeHead(503);res.end(JSON.stringify({ok:false,error:"Temporary operational outage"}));return;}
  res.end(JSON.stringify({ok:true,project:{id:"project",name:"Improve customer acquisition",project_code:"P-1",status:"active",stage:"delivery"},execution:{id:"execution",execution_no:1,status:"running",last_heartbeat_at:"2026-10-24T12:00:00Z"},counts:{running:1,queued:0,waitingApproval:0,waitingOther:0,completed:1,failed:0,total:2},progressSnapshot:{progressPercent:50},tasks:[{id:"task",title:"Evidence-informed design",status:"running",assigned_agent_id:"design",priority:1}],activity:recorded?[event]:[],events:recorded?[event]:[],eventCursor:recorded?`${event.created_at}|${event.id}`:null,agents,approvals:[]}));return;
 }
 res.setHeader("Content-Type","text/html");res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>Project live operations component QA</title><style>${css}body{margin:0;background:#091221}main{max-width:1200px;padding:16px;margin:auto}</style></head><body><main><div id="root"></div></main><script src="/bundle.js"></script></body></html>`);
});
await new Promise(resolve=>server.listen(0,"127.0.0.1",resolve));let browser;let page;const errors=[];
try{
 browser=await chromium.launch({headless:true,executablePath:process.env.RYTHM_BROWSER_EXECUTABLE||undefined,channel:process.env.CRM_BROWSER_CHANNEL||undefined,args:["--no-sandbox","--disable-dev-shm-usage","--disable-gpu"]});page=await browser.newPage();page.on("pageerror",error=>errors.push(error.message));
 const url=`http://127.0.0.1:${server.address().port}`;mkdirSync("test-results/project-intelligence",{recursive:true});
 for(const [name,width,height] of [["desktop",1440,1000],["tablet",768,1024],["mobile",390,844],["narrow",320,740]]){
  recorded=false;await page.setViewportSize({width,height});await page.goto(url);await page.getByText("No handoffs have been recorded.",{exact:false}).waitFor();
  assert.equal(await page.locator(".project-handoff-packet").count(),0,"No artificial motion without a persisted event");
  recorded=true;await page.evaluate(()=>window.dispatchEvent(new CustomEvent("rythm:project-updated")));
  await page.locator("[data-event-id]").waitFor();assert.equal(await page.locator("[data-event-id]").count(),1);
  assert.equal(await page.locator(".project-handoff-packet").count(),1,"A newly recorded backend handoff animates");
  await page.screenshot({path:`test-results/project-intelligence/live-${name}-departments.png`,fullPage:true});
  await page.getByRole("button",{name:"Pause animations",exact:true}).click();assert.equal(await page.getByRole("button",{name:"Replay recorded handoff:",exact:false}).isDisabled(),true);
  await page.getByRole("button",{name:"Simple view",exact:true}).click();assert.equal(await page.locator(".project-departments").count(),0);assert.equal(await page.getByText("Persisted activity (1 recent events)").count(),1);
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${name}: no horizontal document overflow`);
  await page.screenshot({path:`test-results/project-intelligence/live-${name}.png`,fullPage:true});
  await page.reload();await page.locator("[data-event-id]").waitFor();assert.equal(await page.locator(".project-handoff-packet").count(),0,"Refresh restores persisted state without replaying work");
  await Promise.all([page.waitForResponse(response=>response.url().includes("/api/projects/live")),page.evaluate(()=>window.dispatchEvent(new CustomEvent("rythm:project-updated")))]);
  assert.equal(await page.locator("[data-event-id]").count(),1,"Repeated event IDs cannot duplicate work");
 }
 failure=true;await page.evaluate(()=>window.dispatchEvent(new CustomEvent("rythm:project-updated")));await page.getByRole("alert").filter({hasText:"Temporary operational outage"}).waitFor();failure=false;await page.evaluate(()=>window.dispatchEvent(new Event("online")));await page.getByRole("alert").waitFor({state:"detached"});
 await page.emulateMedia({reducedMotion:"reduce"});await page.getByRole("button",{name:"Replay recorded handoff:",exact:false}).click();assert.equal(await page.locator(".project-handoff-packet").evaluate(element=>getComputedStyle(element).display),"none");
 assert.ok(requests.some(url=>url.includes("after=")),"Reconnect requests carry a validated replay cursor");assert.deepEqual(errors,[]);
 console.log("Project live browser passed: actual component, persisted-event fixture, desktop/tablet/mobile/narrow, one-shot motion, replay dedupe, reload, reconnect, pause/simple/reduced-motion, no overflow or page errors. Isolated test API; no production execution claimed.");
}finally{if(browser)await browser.close();await new Promise(resolve=>server.close(resolve));}
