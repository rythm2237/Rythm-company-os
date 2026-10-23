import assert from "node:assert/strict";
import {createServer} from "node:http";
import {readFileSync,mkdirSync} from "node:fs";
import {build} from "esbuild";
import {chromium} from "playwright";
const bundle=await build({entryPoints:["scripts/fixtures/crm-sales-browser.tsx"],bundle:true,write:false,format:"iife",jsx:"automatic",define:{"process.env.NODE_ENV":'"production"'},plugins:[{name:"fixture-links",setup(b){b.onResolve({filter:/^next\/link$/},()=>({path:"link",namespace:"fixture"}));b.onLoad({filter:/.*/,namespace:"fixture"},()=>({loader:"tsx",resolveDir:process.cwd(),contents:'import React from "react"; export default function Link({children,...props}){return <a {...props}>{children}</a>}'}));}}]});
const css=["app/globals.css","app/finance-center.css","app/crm-center.css"].map(p=>readFileSync(p,"utf8")).join("\n");
const transitions=[];
const server=createServer(async(req,res)=>{
 if(req.url==="/bundle.js"){res.setHeader("Content-Type","application/javascript");res.end(bundle.outputFiles[0].text);return;}
 if(req.url==="/transition"){let body="";for await(const chunk of req)body+=chunk;const input=JSON.parse(body);transitions.push(input);res.writeHead(input.stage==="won"?409:200,{"Content-Type":"application/json"});res.end("{}");return;}
 res.setHeader("Content-Type","text/html");res.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width,initial-scale=1"><title>CRM component QA</title><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});
await new Promise(r=>server.listen(0,"127.0.0.1",r));
const url=`http://127.0.0.1:${server.address().port}`;let browser;
try{
 browser=await chromium.launch({headless:true,channel:process.env.CRM_BROWSER_CHANNEL||undefined});const page=await browser.newPage();const errors=[];page.on("pageerror",e=>errors.push(e.message));
 mkdirSync("test-results/crm",{recursive:true});
 for(const [name,width,height] of [["desktop",1440,1000],["tablet",768,1024],["mobile",390,844]]){
  await page.setViewportSize({width,height});await page.goto(url);await page.getByRole("heading",{name:"Sales pipeline",exact:true}).waitFor();
  assert.equal(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),true,`${name}: no document horizontal overflow`);
  await page.getByLabel("Stage for Example delivery",{exact:true}).selectOption("proposal");await page.getByRole("button",{name:"Move",exact:true}).click();await page.getByRole("status").filter({hasText:"Stage saved"}).waitFor();
  await page.getByLabel("Stage for Example delivery",{exact:true}).selectOption("lost");await page.getByRole("button",{name:"Move",exact:true}).click();await page.getByRole("status").filter({hasText:"Add a loss reason"}).waitFor();
  await page.getByLabel("Loss reason for Example delivery",{exact:true}).fill("Budget postponed");await page.getByRole("button",{name:"Move",exact:true}).click();await page.getByRole("status").filter({hasText:"Stage saved"}).waitFor();
  await page.getByLabel("Stage for Example delivery",{exact:true}).selectOption("won");await page.getByRole("button",{name:"Move",exact:true}).click();await page.getByRole("status").filter({hasText:"Stage not saved"}).waitFor();
  await page.screenshot({path:`test-results/crm/${name}.png`,fullPage:true});
 }
 await page.setViewportSize({width:1440,height:1000});await page.goto(url);const start=transitions.length;
 await page.locator(".crm-sales-card").dragTo(page.getByRole("region",{name:"Proposal stage",exact:true}));await page.getByRole("status").filter({hasText:"Stage saved"}).waitFor();assert.equal(transitions.length,start+1);
 await page.goto(url+"/?readonly=1");assert.equal(await page.getByRole("button",{name:"Move",exact:true}).count(),0);
 assert.deepEqual(errors,[]);assert.ok(transitions.some(t=>t.stage==="lost"&&t.reason==="Budget postponed"));
 console.log("CRM browser component QA passed: desktop/tablet/mobile, no document overflow, stage selector, loss reason, rejected transition, drag/drop, read-only state and console errors. Screenshots: test-results/crm.");
}finally{if(browser)await browser.close();await new Promise(r=>server.close(r));}
