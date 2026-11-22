import assert from 'node:assert/strict';
import {mkdir,writeFile} from 'node:fs/promises';
import {chromium} from 'playwright';

const origin=process.env.CUBE_BROWSER_ORIGIN||'http://127.0.0.1:3000';
assert.ok(origin==='http://127.0.0.1:3000'||origin==='https://rythm-os.com','Only synthetic localhost or the public production site');
const output='artifacts/operating-model-cube';
await mkdir(output,{recursive:true});
const browser=await chromium.launch({channel:process.env.CRM_BROWSER_CHANNEL||'chrome',args:['--enable-unsafe-swiftshader']});
const evidence=[];
async function context(options){
 const c=await browser.newContext(options);
 await c.addInitScript(()=>{localStorage.setItem('rythm-public-guide-v3','dismissed');localStorage.setItem('rythm-public-education-locale-v1','en');});
 await c.route('**/*',route=>new URL(route.request().url()).origin===origin&&['GET','HEAD'].includes(route.request().method())?route.continue():route.abort());
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
    assert.equal(await page.locator('.model-cube-primary, .model-cube-reflection').count(),0);
    await page.waitForFunction(()=>document.querySelector('.operating-model-explorer')?.dataset.cubeEngine==='webgl');
    const scene=page.locator('.studio-cube-canvas');
    assert.equal(await scene.getAttribute('data-cubies'),'1');
    assert.ok(Number(await scene.getAttribute('data-rounded-radius'))>=.28);
    assert.equal(await scene.getAttribute('data-surface'),'continuous');
    assert.equal(await scene.getAttribute('data-rotation-mode'),'full-three-axis');
    assert.deepEqual((await scene.getAttribute('data-face-colors')).split(','),Array(6).fill('#20304d'),'Every face uses the same Rythm navy');
    assert.equal(await scene.getAttribute('data-title-geometry'),'extruded-bevel');
    assert.ok(Number(await scene.getAttribute('data-title-depth'))>0,'Titles have actual depth');
    assert.equal(await scene.getAttribute('data-reflection-mode'),'planar-camera');
    assert.ok(Number(await scene.getAttribute('data-reflection-frames'))>0,'Mirror camera really renders');
    await page.waitForFunction(()=>Boolean(document.querySelector('.studio-cube-canvas')?.dataset.pose));
    const staticPose=await scene.getAttribute('data-pose');await page.waitForTimeout(150);assert.equal(await scene.getAttribute('data-pose'),staticPose,'Reduced-motion geometry is static');
    assert.equal(await scene.getAttribute('data-reflection-pose'),staticPose,'Static reflection matches the real body');
    const controls=page.locator('.model-cube-options button');
    assert.equal(await controls.count(),path==='/solutions'?3:4);
    for(let i=0;i<await controls.count();i++){
     await controls.nth(i).focus();await page.keyboard.press('Enter');
     assert.equal(await controls.nth(i).getAttribute('aria-pressed'),'true');
     assert.equal(await explorer.getAttribute('data-cube-playing'),'false');
     await page.waitForFunction(index=>document.querySelector('.studio-cube-canvas')?.dataset.selected===String(index),i);
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
 await page.waitForFunction(()=>document.querySelector('.operating-model-explorer')?.dataset.cubeEngine==='webgl');
 const cube=page.locator('.studio-cube-canvas');await page.waitForFunction(()=>Boolean(document.querySelector('.studio-cube-canvas')?.dataset.pose));const before=await cube.getAttribute('data-pose');const anglesBefore=(await cube.getAttribute('data-angles')).split(',').map(Number);const reflectionBefore=Number(await cube.getAttribute('data-reflection-frames'));
 await page.waitForTimeout(600);const after=await cube.getAttribute('data-pose');assert.notEqual(after,before,'Cube really rotates');
 const anglesAfter=(await cube.getAttribute('data-angles')).split(',').map(Number);
 anglesAfter.forEach((value,axis)=>assert.ok(value>anglesBefore[axis],`Real scene rotates on axis ${axis}`));
 assert.ok(Number(await cube.getAttribute('data-reflection-frames'))>reflectionBefore,'Mirrored camera updates during rotation');
 await page.waitForTimeout(4000);
 await page.getByRole('button',{name:'Pause cube rotation'}).click();
 await page.waitForTimeout(100);const frozen=await cube.getAttribute('data-pose');await page.waitForTimeout(300);assert.equal(await cube.getAttribute('data-pose'),frozen,'Pause freezes the complete solid body');
 assert.equal(await cube.getAttribute('data-reflection-pose'),frozen,'Reflection freezes on the same orientation');
 const frozenFrames=await cube.getAttribute('data-reflection-frames');await page.waitForTimeout(200);assert.equal(await cube.getAttribute('data-reflection-frames'),frozenFrames,'Paused mirror does not keep rendering');
 await page.locator('.model-cube-options button').nth(1).click();await page.waitForFunction(()=>document.querySelector('.studio-cube-canvas')?.dataset.selected==='1'&&document.querySelector('.studio-cube-canvas')?.dataset.transitioning==='false');
 await page.locator('.model-cube-options button').nth(2).click();await page.waitForFunction(()=>document.querySelector('.studio-cube-canvas')?.dataset.selected==='2'&&document.querySelector('.studio-cube-canvas')?.dataset.transitioning==='false');
 const resumeFrom=(await cube.getAttribute('data-pose')).split(',').map(Number);
 await page.getByRole('button',{name:'Play cube rotation'}).click();
 const resumed=(await cube.getAttribute('data-pose')).split(',').map(Number);// q and -q encode the same orientation; compare angular distance, not signed components.
 const dot=Math.abs(resumed.slice(0,4).reduce((sum,value,i)=>sum+value*resumeFrom[i],0));
 const angularGap=2*Math.acos(Math.min(1,dot));
 assert.ok(angularGap<.15,`Resume remains continuous: ${angularGap} radians`);
 assert.equal(await page.locator('.operating-model-explorer').getAttribute('data-cube-playing'),'true');
 await page.waitForTimeout(3000);await page.screenshot({path:`${output}/motion-desktop.png`});
 evidence.push({engine:'WebGL',cubies:1,surface:'continuous',threeAxisMotion:'PASS',navyFaces:'PASS',extrudedTitles:'PASS',planarReflection:'PASS',reflectionPause:'PASS',motion:'PASS',pause:'PASS',resume:'PASS'});const video=page.video();await c.close();await video.saveAs(`${output}/cube-motion.webm`);
 const initial=await context({javaScriptEnabled:false}),initialPage=await initial.newPage();
 for(const path of ['/solutions','/templates']){
  await initialPage.goto(origin+path);
  assert.equal(await initialPage.locator('.operating-model-explorer').getAttribute('data-cube-engine'),'loading');
  assert.equal(await initialPage.locator('.model-cube-stage').locator('*').count(),0,'Initial HTML contains no legacy cube or reflection');
 }
 await initial.close();
 const fallback=await context({viewport:{width:1366,height:768},reducedMotion:'reduce'});
 await fallback.addInitScript(()=>{const get=HTMLCanvasElement.prototype.getContext;HTMLCanvasElement.prototype.getContext=function(type,...args){if(type==='webgl'||type==='webgl2'||type==='experimental-webgl')return null;return get.call(this,type,...args);};});
 const fallbackPage=await fallback.newPage();await fallbackPage.goto(origin+'/solutions');
 await fallbackPage.waitForFunction(()=>document.querySelector('.operating-model-explorer')?.dataset.cubeEngine==='fallback');
 assert.equal(await fallbackPage.locator('.model-cube-stage').isVisible(),false);
 assert.equal(await fallbackPage.locator('.model-cube-motion').count(),0);
 await fallbackPage.locator('.model-cube-options button').nth(1).click();assert.ok((await fallbackPage.locator('.model-cube-detail h2').innerText()).includes('Custom'));
 await fallbackPage.screenshot({path:`${output}/no-webgl-fallback.png`});evidence.push({noWebGLFallback:'PASS'});await fallback.close();
}finally{await writeFile(`${output}/evidence.json`,JSON.stringify(evidence,null,2));await browser.close();}
