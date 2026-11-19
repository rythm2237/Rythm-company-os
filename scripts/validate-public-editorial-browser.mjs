import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin=process.env.UI_PREVIEW_ORIGIN||'http://127.0.0.1:3000';
assert.equal(new URL(origin).hostname,'127.0.0.1','Synthetic preview only');
const output=process.env.UI_EVIDENCE_DIR||'artifacts/public-editorial';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.CRM_BROWSER_CHANNEL||'chrome'});
const evidence=[];
try{
 for(const [name,width,height]of [['desktop',1920,1080],['laptop',1366,768],['tablet',768,1024],['mobile',390,844],['small-mobile',320,780]]){
  const context=await browser.newContext({viewport:{width,height},reducedMotion:'reduce'});
  await context.addInitScript(()=>{
   localStorage.setItem('rythm-public-guide-v3','dismissed');
   localStorage.setItem('rythm-public-education-locale-v1','en');
   localStorage.setItem('rythm-demo-experience-discovered-v1','seen');
  });
  const page=await context.newPage();
  await page.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
  try{
   for(const [path,variant]of [['/solutions','team'],['/templates','workbench'],['/security','governance'],['/about','team'],['/ai-agents-for-business','team']]){
    await page.goto(origin+path);await page.locator('.public-hero-artwork').waitFor();
    await page.locator('.public-hero-artwork').evaluate(img=>img.decode());
    const metrics=await page.locator('.public-page-hero').evaluate(hero=>{
     const art=hero.querySelector('img'),title=hero.querySelector('h1'),copy=hero.querySelector('.public-hero-aside-copy');
     const r=el=>{const x=el.getBoundingClientRect();return{x:x.x,y:x.y,width:x.width,height:x.height,right:x.right,bottom:x.bottom};};
     return {art:r(art),title:r(title),copy:r(copy),source:art.getAttribute('src'),decorative:art.alt==='',overflow:document.documentElement.scrollWidth>innerWidth+1};
    });
    const guide=await page.locator('.marketing-guide-floating').boundingBox();
    if(guide)assert.ok(guide.y+guide.height<=metrics.title.y||guide.x>=metrics.title.right||guide.x+guide.width<=metrics.title.x,'Guide launcher must not cover the heading');
    assert.ok(metrics.source.includes(variant));assert.ok(metrics.decorative);assert.ok(metrics.art.width>150&&metrics.art.height>100);assert.ok(!metrics.overflow,`${name} ${path} horizontal overflow`);
    assert.ok(metrics.art.bottom<=metrics.copy.y+1,'Artwork cannot obscure product/policy copy');
    await page.locator('.public-page-hero').screenshot({path:`${output}/${name}-${path.split('/').pop()}.png`,animations:'disabled'});
    evidence.push({profile:name,path,...metrics});
   }
   await page.goto(origin+'/demo?surface=agents');
   await page.locator('.demo-agent-grid button').first().waitFor();
   const cards=page.locator('.demo-agent-grid button');
   assert.equal(await cards.count(),6,'All six synthetic Agent profiles must be present');
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
   evidence.push({profile:name,path:'/demo?surface=agents',cards:sizes,profileInteraction:'PASS',experienceToggle:'PASS'});
   console.log(`PASS public editorial + Demo Agent layout/profile (${name}, ${width}x${height})`);
  }catch(error){await page.screenshot({path:`${output}/${name}-failure.png`,fullPage:true}).catch(()=>{});throw error;}
  finally{await context.close();}
 }
}finally{await writeFile(`${output}/measurements.json`,JSON.stringify(evidence,null,2));await browser.close();}
