/** Isolated visual QA of the production component. No fixture route enters the app. */
import { build } from 'esbuild';
import { mkdir, writeFile, readFile } from 'node:fs/promises';
import { createServer } from 'node:http';
import { resolve, join } from 'node:path';
const root = process.cwd();
const output = '/tmp/rythm-boardroom-qa';
await mkdir(output, { recursive: true });
const entry = `import React from 'react';
import {createRoot} from 'react-dom/client';
import Console from ${JSON.stringify(join(root, 'app/(app)/meetings/room/DeliberationConsole.tsx'))};
import Bridge from ${JSON.stringify(join(root, 'components/app-shell/BoardroomFocusBridge.tsx'))};
import ${JSON.stringify(join(root, 'app/interactions.css'))};
const query = new URLSearchParams(location.search);
const count = Number(query.get('agents') || 4);
const long = query.has('long');
const names = ['Executive Orchestrator', 'Strategy Director', 'Operations Director', 'Financial Advisor', 'Legal Counsel', 'Delivery Manager', 'Research Analyst', 'Product Lead'];
const agents = Array.from({length:count}, (_,i)=>({id:'agent-'+i,agentCode:i===0?'B-001':'A-10'+i,name:names[i%names.length],roleTitle:['Meeting synthesis','Business strategy','Company operations','Financial planning'][i%4],avatarUrl:null,enabled:true}));
const base = {sessionId:'qa-only',meetingStatus:'running',initialStatus:query.has('completed')?'completed':'ready',initialMessages:[],meetingTitle:'Executive strategy review',decisionQuestion:long ? 'Review strategic direction and operational constraints. '.repeat(12) : 'What should we prioritize next?',maxRounds:2,budgetCapUsd:1.5,participants:agents,meetingAgenda:long?['Evidence and assumptions: '+ 'Evaluate opportunities with clear ownership and measurable outcomes. '.repeat(15), 'Risks, dependencies and financial impact','Implementation plan']:['Strategic priorities','Risks and dependencies','Action plan and ownership'],humanName:'Human CEO'};
window.renderMeeting=(patch={})=>{Object.assign(base,patch); root.render(<><Bridge/><Console {...base}/></>)};
const root=createRoot(document.getElementById('root')); window.renderMeeting();`;
await build({stdin:{contents:entry,resolveDir:root,loader:'tsx'},bundle:true,external:['/boardroom/*'],jsx:'automatic',outfile:join(output,'bundle.js'),loader:{'.css':'local-css'},plugins:[{name:'next-stubs',setup(b){
 b.onResolve({filter:/^next\/(image|navigation)$/},a=>({path:a.path,namespace:'qa'}));
 b.onLoad({filter:/.*/,namespace:'qa'},a=>({loader:'jsx',resolveDir:root,contents:a.path==='next/navigation'?`export const useRouter=()=>({refresh(){},push(url){window.lastNavigation=url}});export const usePathname=()=>"/meetings/room";export const useSearchParams=()=>new URLSearchParams("meeting=qa-only");`:`import React from 'react';export default function Image({fill,priority,unoptimized,...p}) { return <img {...p} style={fill?{position:'absolute',inset:0,width:'100%',height:'100%',...p.style}:p.style}/> }`}));
 b.onLoad({filter:/BoardroomFocusBridge\.tsx$/},async a=>({contents:(await readFile(a.path,'utf8')).replace('<style jsx global>','<style>'),loader:'tsx'}));
 b.onLoad({filter:/interactions\.css$/},async a=>({contents:await readFile(a.path,'utf8'),loader:'css'}));
}}]});
await writeFile(join(output,'index.html'),`<!doctype html><meta name="viewport" content="width=device-width,initial-scale=1"><link rel="stylesheet" href="/bundle.css"><style>body{margin:0}button,input,select{font-family:inherit}</style><div id="root"></div><script src="/bundle.js"></script>`);
const server=createServer(async(req,res)=>{
 try {
 const pathname = new URL(req.url,'http://localhost').pathname;
 if(pathname==='/favicon.ico'){res.statusCode=204;res.end();return;}
 const file=pathname==='/'?'index.html':pathname.slice(1);
 const path=resolve(pathname.startsWith('/boardroom/')||pathname.startsWith('/brand/')?join(root,'public'):output,file);
 const data=await readFile(path);
 res.setHeader('Content-Type',file.endsWith('.js')?'text/javascript':file.endsWith('.css')?'text/css':file.endsWith('.png')?'image/png':file.endsWith('.svg')?'image/svg+xml':'text/html');res.end(data);
 } catch {res.statusCode=404;res.end('Not found')}
});
server.listen(4178,'0.0.0.0',()=>console.log('Boardroom component QA: http://localhost:4178'));
