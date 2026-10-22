/** Run with Playwright installed: node scripts/qa/boardroom-visual.cjs */
const assert = require('node:assert/strict');
const { chromium } = require('playwright');
const fs = require('node:fs');
(async () => {
 await import(process.cwd()+'/scripts/qa/boardroom-preview.mjs');
 const browser = await chromium.launch({headless:true,...(process.env.BOARDROOM_CHROMIUM ? {executablePath:process.env.BOARDROOM_CHROMIUM} : {}),args:['--no-sandbox']});
 const page=await browser.newPage(); const errors=[]; page.on('pageerror',e=>errors.push(e.message));
 const output=process.env.BOARDROOM_QA_OUTPUT || '/tmp/rythm-boardroom-qa/screenshots';fs.mkdirSync(output,{recursive:true});
 const results=[];
 async function geometry() {
  return page.evaluate(()=>{
   const screen=[...document.querySelectorAll('[data-presentation-screen]')].find(e=>e.clientWidth>0);
   const article=screen.querySelector('article'); const list=article.querySelector('ul');
   const rect=screen.getBoundingClientRect();
   const collisions=[...document.querySelectorAll('[data-seat-id]')].filter(e=>{const r=e.getBoundingClientRect();return r.width&&r.left<rect.right&&r.right>rect.left&&r.top<rect.bottom&&r.bottom>rect.top}).length;
   return {screenFits:article.scrollHeight<=article.clientHeight+1&&list.scrollHeight<=list.clientHeight+1,collisions,overflow:document.documentElement.scrollWidth>innerWidth,
   page:article.querySelector('div').innerText, seats:[...document.querySelectorAll('[data-seat-id]')].map(e=>e.dataset.seatId)};
  });
 }
 for(const [width,height] of [[1920,1080],[1440,900],[1366,768],[1024,768],[768,1024],[390,844]]){
  await page.setViewportSize({width,height});await page.goto('http://localhost:4178/');await page.waitForTimeout(150);
  let g=await geometry();assert(g.screenFits,`short slide fits ${width}`);assert.equal(g.collisions,0);assert(!g.overflow);
  await page.screenshot({path:`${output}/${width}x${height}.png`});
  await page.goto('http://localhost:4178/?long');await page.waitForTimeout(150);
  const initial=await geometry();const total=Number(initial.page.match(/\/(\d+)/)?.[1]);assert(total>4);
  for(let i=0;i<total;i++){
   g=await geometry();assert(g.screenFits,`long slide ${i+1}/${total} fits ${width}`);assert.equal(g.collisions,0);assert(!g.overflow);
   await page.getByRole('button',{name:'Next Slide →',exact:true}).filter({visible:true}).click();
  }
  await page.screenshot({path:`${output}/${width}x${height}-long.png`});
  results.push({width,height,longPages:total,containment:'pass',collisions:0});
 }
 await page.setViewportSize({width:1440,height:900});
 for(const count of [1,2,4,9]){
  await page.goto(`http://localhost:4178/?agents=${count}`);await page.waitForTimeout(100);
  const g=await geometry();assert.equal(g.seats.length,Math.min(count,6));assert.equal(new Set(g.seats).size,g.seats.length);assert.equal(g.collisions,0);
 }
 await page.goto('http://localhost:4178/');
 const before=await page.locator('[data-seat-id]').evaluateAll(es=>es.map(e=>[e.getAttribute('aria-label'),e.dataset.seatId]));
 await page.evaluate(()=>window.renderMeeting({participants:[...Array.from({length:3},(_,i)=>({id:'agent-'+(i+1),agentCode:'A-10'+(i+1),name:'Agent '+(i+1),roleTitle:'Advisor',avatarUrl:null,enabled:true})),{id:'joining',agentCode:'A-109',name:'New colleague',roleTitle:'Advisor',avatarUrl:null,enabled:true}]}));
 await page.waitForTimeout(100);const after=await geometry();assert.equal(after.seats[0],before[1][1]);
 let turnCalls=0,closeCalls=0;
 await page.route('**/api/meetings/deliberate',async route=>{turnCalls++;await new Promise(r=>setTimeout(r,200));await route.fulfill({json:{ok:true,status:'completed',content:'Synthesis ready',phase:'synthesis',speaker:{code:'B-001',name:'Executive Orchestrator'},turnIndex:1}})});
 await page.route('**/api/meetings/close',async route=>{closeCalls++;await route.fulfill({json:{ok:true}})});
 await page.getByRole('button',{name:'Next Action ↗',exact:true}).dblclick();await page.waitForTimeout(300);assert.equal(turnCalls,1);
 await page.getByRole('button',{name:'End Meeting',exact:true}).click();assert.equal(closeCalls,0);
 await page.getByRole('button',{name:'Keep meeting open',exact:true}).click();assert.equal(closeCalls,0);
 await page.getByRole('button',{name:'End Meeting',exact:true}).click();await page.getByRole('button',{name:'Confirm End Meeting',exact:true}).click();await page.waitForTimeout(100);assert.equal(closeCalls,1);
 await page.getByRole('button',{name:'Review synthesis',exact:true}).click();await page.getByRole('button',{name:'Open Human CEO decision form',exact:true}).click();assert.equal(await page.locator('[aria-label="RYTHM executive boardroom"]').count(),0);
 assert.deepEqual(errors,[]);
 fs.writeFileSync(output+'/results.json',JSON.stringify({results,turnCalls,closeCalls,consoleErrors:errors},null,2));console.log(JSON.stringify({results,turnCalls,closeCalls,consoleErrors:errors},null,2));
 await browser.close();process.exit(0);
})().catch(error=>{console.error(error);process.exit(1)});
