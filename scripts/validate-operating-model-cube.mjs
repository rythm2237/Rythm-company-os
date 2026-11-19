import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin='http://127.0.0.1:3000';
const output='artifacts/operating-model-cube';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.CRM_BROWSER_CHANNEL||'chrome'});
const evidence=[];
async function context(options){
 const c=await browser.newContext(options);
 await c.addInitScript(()=>{localStorage.setItem('rythm-public-guide-v3','dismissed');localStorage.setItem('rythm-public-education-locale-v1','en');});
 await c.route('**/*',route=>new URL(route.request().url()).origin===origin?route.continue():route.abort());
 return c;
}
try{
 for(const [profile,width,height]of [['desktop',1920,1080],['laptop',1366,768],['tablet',768,1024],['mobile',390,844],['small-mobile',320,780]]){
  const c=await context({viewport:{width,height},reducedMotion:'reduce'}),page=await c.newPage();
  try{
   for(const path of ['/solutions','/templates']){
    await page.goto(origin+path);
    const explorer=page.locator('.operating-model-explorer');await explorer.waitFor();
    assert.equal(await explorer.getAttribute('data-cube-playing'),'false','Respect reduced motion');
    assert.equal(await page.locator('.model-cube-face').count(),6);
    assert.equal(await page.locator('.model-cube').evaluate(el=>getComputedStyle(el).animationName),'none');
    const controls=page.locator('.model-cube-options button');
    assert.equal(await controls.count(),path==='/solutions'?3:4);
    for(let i=0;i<await controls.count();i++){
     await controls.nth(i).focus();await page.keyboard.press('Enter');
     assert.equal(await controls.nth(i).getAttribute('aria-pressed'),'true');
     assert.equal(await explorer.getAttribute('data-cube-playing'),'false');
     const title=await page.locator('.model-cube-detail h2').innerText();assert.ok(title.length>5);
     if(path==='/templates'&&i===2)assert.ok(title.includes('Preview'),'Keep SaaS preview disclosure');
     const link=await page.locator('.model-cube-detail a').getAttribute('href');assert.ok(link.startsWith('/'));
    }
    await controls.first().click();
    await page.evaluate(()=>scrollTo(0,0));
    await page.screenshot({path:`${output}/${profile}-${path.slice(1)}-page.png`,fullPage:true,animations:'disabled'});
    await explorer.screenshot({path:`${output}/${profile}-${path.slice(1)}-cube.png`,animations:'disabled'});
    const geometry=await page.evaluate(()=>({viewport:innerWidth,scroll:document.documentElement.scrollWidth}));
    assert.ok(geometry.scroll<=width+1,`${profile} ${path}: horizontal overflow`);
    evidence.push({profile,path,...geometry,faces:6,keyboardSelection:'PASS',reducedMotion:'PASS'});
    console.log(`PASS ${profile} ${path}: six faces, keyboard selection, safe links, reduced motion, no overflow`);
   }
  }catch(error){await page.screenshot({path:`${output}/${profile}-failure.png`,fullPage:true}).catch(()=>{});throw error;}
  finally{await c.close();}
 }
 const c=await context({viewport:{width:1440,height:1000},reducedMotion:'no-preference',recordVideo:{dir:output,size:{width:1280,height:900}}}),page=await c.newPage();
 await page.goto(origin+'/solutions');
 await page.waitForFunction(()=>document.querySelector('.operating-model-explorer')?.dataset.cubePlaying==='true');
 const cube=page.locator('.model-cube');const before=await cube.evaluate(el=>getComputedStyle(el).transform);
 await page.waitForTimeout(600);const after=await cube.evaluate(el=>getComputedStyle(el).transform);assert.notEqual(after,before,'Cube really rotates');
 await page.waitForTimeout(4000);
 await page.getByRole('button',{name:'Pause cube rotation'}).click();
 const frozen=await cube.evaluate(el=>getComputedStyle(el).transform);await page.waitForTimeout(300);assert.equal(await cube.evaluate(el=>getComputedStyle(el).transform),frozen,'Pause freezes orientation');
 await page.locator('.model-cube-options button').nth(1).click();await page.waitForTimeout(1500);
 await page.locator('.model-cube-options button').nth(2).click();await page.waitForTimeout(1500);
 const resumeFrom=await cube.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m11);
 await page.getByRole('button',{name:'Play cube rotation'}).click();
 const resumed=await cube.evaluate(el=>new DOMMatrixReadOnly(getComputedStyle(el).transform).m11);assert.ok(Math.abs(resumed-resumeFrom)<.15,'Resume starts from the selected orientation');
 assert.equal(await page.locator('.operating-model-explorer').getAttribute('data-cube-playing'),'true');
 await page.waitForTimeout(3000);await page.screenshot({path:`${output}/motion-desktop.png`});
 evidence.push({motion:'PASS',pause:'PASS',resume:'PASS'});const video=page.video();await c.close();await video.saveAs(`${output}/cube-motion.webm`);
}finally{await writeFile(`${output}/evidence.json`,JSON.stringify(evidence,null,2));await browser.close();}
