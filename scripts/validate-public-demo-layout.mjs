import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin=process.env.UI_PREVIEW_ORIGIN||'http://127.0.0.1:3000';
assert.ok(origin==='http://127.0.0.1:3000'||origin==='https://rythm-os.com','Only synthetic localhost or public read-only Demo');
const output=process.env.UI_EVIDENCE_DIR||'artifacts/public-demo';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.CRM_BROWSER_CHANNEL||'chrome'});
const evidence=[];
async function assertUnbrokenWords(locator){
 const broken=await locator.evaluate(el=>{
  const result=[],walker=document.createTreeWalker(el,NodeFilter.SHOW_TEXT);
  while(walker.nextNode())for(const match of walker.currentNode.textContent.matchAll(/[A-Za-z]{6,}/g)){
   const range=document.createRange();range.setStart(walker.currentNode,match.index);range.setEnd(walker.currentNode,match.index+match[0].length);
   if(range.getClientRects().length>1)result.push(match[0]);
  }
  return result;
 });
 assert.deepEqual(broken,[],'Heading words must not fragment across lines');
}
try{
 for(const [name,width,height]of [['desktop',1920,1080],['laptop',1366,768],['tablet',768,1024],['mobile',390,844],['small-mobile',320,780]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  await context.addInitScript(()=>{
   localStorage.setItem('rythm-public-guide-v3','dismissed');
   localStorage.setItem('rythm-public-education-locale-v1','en');
   localStorage.setItem('rythm-demo-experience-discovered-v1','seen');
  });
  const page=await context.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
  try{
   await page.goto(origin+'/demo?surface=agents');
   await page.locator('.demo-agent-grid button').first().waitFor();
   await assertUnbrokenWords(page.locator('.demo-main-heading h2'));
   const cards=page.locator('.demo-agent-grid button');
   assert.equal(await cards.count(),6,'All six synthetic Agent profiles must be present');
   const standard=await cards.evaluateAll(buttons=>buttons.map(b=>({width:b.querySelector('.demo-agent-identity').getBoundingClientRect().width,height:b.getBoundingClientRect().height})));
   for(const card of standard){assert.ok(card.width>=80,'Standard Demo identity must not collapse');assert.ok(card.height<240,'Standard Demo card must stay compact');}
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Standard Demo must not overflow');
   await page.screenshot({path:`${output}/${name}-demo-standard.png`,fullPage:true,animations:'disabled'});
   await page.getByRole('button',{name:'Enter Experience Mode',exact:true}).click();
   await page.locator('.marketing-shell.is-experience-mode').waitFor();
   await page.waitForFunction(()=>Math.abs(document.querySelector('.marketing-stage').getBoundingClientRect().x)<1);
   assert.equal(await cards.count(),6);
   const workspace=await page.locator('.demo-workspace').boundingBox();
   assert.ok(Math.abs(workspace.y)<1,'Immersive Demo must not reserve space for the hidden public header');
   const sizes=await cards.evaluateAll(buttons=>buttons.map(b=>{
    const name=b.querySelector('.demo-agent-identity'),content=b.querySelector('.ui-button-content');const r=b.getBoundingClientRect(),n=name.getBoundingClientRect(),c=content.getBoundingClientRect();
    return {width:r.width,height:r.height,identityWidth:n.width,contentWidth:c.width,scrollWidth:b.scrollWidth,clientWidth:b.clientWidth};
   }));
   for(const s of sizes){assert.ok(s.identityWidth>=80,`${name}: collapsed Agent identity ${s.identityWidth}`);assert.ok(s.height<240,`${name}: excessively tall Agent card ${s.height}`);assert.ok(s.scrollWidth<=s.clientWidth+1,`${name}: Agent content overflow`);}
   await page.screenshot({path:`${output}/${name}-demo-agents.png`,fullPage:true,animations:'disabled'});
   await cards.first().scrollIntoViewIfNeeded();
   await page.locator('.demo-agent-grid').screenshot({path:`${output}/${name}-demo-card-grid.png`,animations:'disabled'});
   await cards.first().click();await page.locator('.demo-agent-panel').waitFor();
   assert.ok(await page.locator('.demo-agent-panel h3').innerText());
   await page.getByRole('button',{name:'Close Agent profile',exact:true}).click();
   await page.locator('.demo-agent-panel').waitFor({state:'hidden'});
   await page.getByRole('button',{name:'Exit Experience Mode',exact:true}).click();
   await page.locator('.marketing-shell.is-experience-mode').waitFor({state:'detached'});
   assert.equal(await cards.count(),6);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth+1),'Demo must not overflow after toggling');
   evidence.push({profile:name,path:'/demo?surface=agents',cards:sizes,profileInteraction:'PASS',experienceToggle:'PASS'});
   console.log(`PASS Demo Agent layout/profile (${name}, ${width}x${height})`);
  }catch(error){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});throw error;}
  finally{await context.close();}
 }
}finally{await writeFile(`${output}/measurements.json`,JSON.stringify(evidence,null,2));await browser.close();}
