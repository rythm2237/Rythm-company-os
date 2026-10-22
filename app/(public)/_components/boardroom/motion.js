const DESIGN_W = 1672, DESIGN_H = 941;
const PATHS = [
  [[811,353],[916,352],[993,416],[1090,424]],
  [[950,317],[1005,301],[1070,342],[1110,360]],
  [[1146,300],[1175,313],[1180,340],[1175,370]],
  [[1307,346],[1242,343],[1216,384],[1180,399]],
  [[1430,414],[1328,433],[1269,423],[1200,425]]
];
const CHESTS = [[697,333],[857,273],[1133,265],[1399,293],[1539,369]];

function cubic(p,t) {
  const u=1-t;
  return [u*u*u*p[0][0]+3*u*u*t*p[1][0]+3*u*t*t*p[2][0]+t*t*t*p[3][0],u*u*u*p[0][1]+3*u*u*t*p[1][1]+3*u*t*t*p[2][1]+t*t*t*p[3][1]];
}
function glow(ctx,x,y,r,alpha) {
  const g=ctx.createRadialGradient(x,y,0,x,y,r);
  g.addColorStop(0,`rgba(174,239,255,${alpha})`);
  g.addColorStop(.18,`rgba(85,201,246,${alpha*.5})`);
  g.addColorStop(1,'rgba(60,168,240,0)');
  ctx.fillStyle=g;ctx.fillRect(x-r,y-r,r*2,r*2);
}

/** Pure Canvas 2D renderer, shared by the website and MP4 exporter.
 * Keeps the approved artwork intact. All movement is image-camera and lighting.
 * This is image-based motion, not a new geometric reconstruction or character rig.
 */
export function drawBoardroomFrame(ctx,image,time,{width,height,motion=1}={}) {
  width ??= ctx.canvas.width; height ??= ctx.canvas.height;
  // Match the static poster's contain framing, including in tall desktop heroes.
  // Camera and light animation stay in the original artwork's coordinate space.
  const scale=Math.min(width/DESIGN_W,height/DESIGN_H);
  ctx.fillStyle='#0b1220';ctx.fillRect(0,0,width,height);
  ctx.save();
  ctx.translate((width-DESIGN_W*scale)/2,(height-DESIGN_H*scale)/2);
  ctx.scale(scale,scale);
  const cycle=time*Math.PI*2/10;
  // About twice the original zoom excursion, with a smooth matching loop seam.
  const zoom=1.035+.020*(1-Math.cos(cycle))*motion;
  const panX=9*Math.sin(cycle)*motion,panY=3*Math.sin(cycle)*motion;
  const focusX=1100,focusY=740;
  ctx.translate(focusX+panX,focusY+panY);ctx.scale(zoom,zoom);ctx.translate(-focusX,-focusY);
  ctx.drawImage(image,0,0,DESIGN_W,DESIGN_H);
  ctx.globalCompositeOperation='screen';
  PATHS.forEach((path,index)=>{
    const progress=(time*.4+index*.173)%1;
    const envelope=Math.pow(Math.sin(Math.PI*progress),.6)*motion;
    // A short luminous packet follows the original light connections.
    for(let j=19;j>=0;j--){
      const q=progress-j*.005;if(q<=0||q>=1)continue;
      const [x,y]=cubic(path,q);const a=(1-j/20)*envelope;
      ctx.fillStyle=`rgba(152,231,255,${a*.8})`;
      ctx.beginPath();ctx.arc(x,y,1.1+(1-j/20)*.35,0,Math.PI*2);ctx.fill();
    }
    const [x,y]=cubic(path,progress);glow(ctx,x,y,14,.6*envelope);
    ctx.fillStyle=`rgba(216,249,255,${envelope*.9})`;ctx.beginPath();ctx.arc(x,y,1.7,0,Math.PI*2);ctx.fill();
  });
  CHESTS.forEach(([x,y],index)=>{
    const intensity=(.5+.5*Math.sin(cycle*3+index*1.7))*motion;
    glow(ctx,x,y,27,.045+intensity*.1);
    for(let j=0;j<4;j++){
      const a=j*2.4+index;
      const px=x+Math.cos(a)*9,py=y+Math.sin(a)*14;
      const alpha=(.5+.5*Math.sin(cycle*4+j+index))*.58*motion;
      ctx.fillStyle=`rgba(167,228,255,${alpha})`;ctx.beginPath();ctx.arc(px,py,.9,0,Math.PI*2);ctx.fill();
    }
  });
  glow(ctx,1138,398,68,(.035+.035*Math.sin(cycle*2-.5))*motion);
  ctx.restore();
}

export function mountOriginalMotion(host,{imageUrl='./assets/boardroom.jpg',motion=1,onPlayChange}={}) {
  const canvas=document.createElement('canvas');
  canvas.setAttribute('role','img');
  canvas.setAttribute('aria-label','The approved RYTHM AI boardroom scene, animated with a gentle camera move and light flowing from team members toward their shared project.');
  canvas.style.cssText='display:block;width:100%;height:100%;';host.appendChild(canvas);
  const ctx=canvas.getContext('2d');
  if(!ctx){canvas.remove();throw new Error('Canvas 2D unavailable');}
  const image=new Image();image.decoding='async';
  const reduce=matchMedia('(prefers-reduced-motion: reduce)');
  let playing=!reduce.matches,ready=false,disposed=false,visible=true,pageVisible=!document.hidden;
  let raf=0,last=0,time=0,width=1,height=1;
  function draw(){if(ready&&!disposed)drawBoardroomFrame(ctx,image,time,{width,height,motion});}
  function resize(){const box=host.getBoundingClientRect();width=box.width;height=box.height;const dpr=Math.min(devicePixelRatio||1,1.5);canvas.width=Math.round(width*dpr);canvas.height=Math.round(height*dpr);ctx.setTransform(dpr,0,0,dpr,0,0);draw();}
  function schedule(){if(!raf&&playing&&ready&&visible&&pageVisible&&!disposed)raf=requestAnimationFrame(frame);}
  function frame(now){raf=0;if(disposed||!visible||!pageVisible||!playing)return;const dt=last?Math.min((now-last)/1000,.1):0;last=now;time+=dt;draw();schedule();}
  function setPlaying(value){playing=!!value;last=0;if(playing)schedule();else{cancelAnimationFrame(raf);raf=0;draw();}onPlayChange?.(playing);}
  const changeReduced=()=>setPlaying(!reduce.matches);
  reduce.addEventListener('change',changeReduced);
  const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);
  const intersection=new IntersectionObserver(([e])=>{visible=e.isIntersecting;last=0;if(visible)schedule();});intersection.observe(host);
  const visibility=()=>{pageVisible=!document.hidden;last=0;if(pageVisible)schedule();};document.addEventListener('visibilitychange',visibility);
  const loaded=new Promise((resolve,reject)=>{image.onload=()=>{if(disposed){resolve();return;}ready=true;resize();schedule();resolve();};image.onerror=()=>{host.dataset.motionError='true';reject(new Error('Boardroom artwork could not be loaded'));};});
  image.src=imageUrl;
  return {ready:loaded,get playing(){return playing;},get time(){return time;},setPlaying,
    seek(seconds){time=Math.max(0,Number(seconds)||0);draw();},
    dispose(){if(disposed)return;disposed=true;cancelAnimationFrame(raf);resizeObserver.disconnect();intersection.disconnect();document.removeEventListener('visibilitychange',visibility);reduce.removeEventListener('change',changeReduced);image.onload=null;image.onerror=null;image.src='';canvas.remove();}
  };
}
