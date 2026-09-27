(()=>{
  if(window.__donyaAdminUxInstalled)return;window.__donyaAdminUxInstalled=true;
  let lastTrigger=null,lastTriggerAt=0,busyCount=0,toastTimer=null;
  const isInteractive=node=>node?.closest?.('button,.btn,.tab,.icon,[role="button"],input[type="submit"],input[type="button"]');
  const recentTrigger=()=>Date.now()-lastTriggerAt<1400?lastTrigger:null;

  function ensureUi(){
    if(!document.querySelector('.ux-action-bar')){
      const bar=document.createElement('div');bar.className='ux-action-bar';bar.setAttribute('aria-hidden','true');document.body.append(bar);
    }
    if(!document.querySelector('.ux-toast')){
      const toast=document.createElement('div');toast.className='ux-toast';toast.setAttribute('role','status');toast.setAttribute('aria-live','polite');document.body.append(toast);
    }
  }
  function toast(message,type='success'){
    ensureUi();const el=document.querySelector('.ux-toast');clearTimeout(toastTimer);el.textContent=message;el.className=`ux-toast ${type}`;requestAnimationFrame(()=>el.classList.add('show'));toastTimer=setTimeout(()=>el.classList.remove('show'),2100);
  }
  function setButtonBusy(button,on){
    if(!button)return;
    if(on){
      if(button.dataset.uxBusy==='1')return;
      button.dataset.uxBusy='1';button.dataset.uxWasDisabled=button.disabled?'1':'0';button.setAttribute('aria-busy','true');
      if('disabled'in button)button.disabled=true;
    }else{
      delete button.dataset.uxBusy;button.removeAttribute('aria-busy');
      if('disabled'in button&&button.dataset.uxWasDisabled!=='1')button.disabled=false;
      delete button.dataset.uxWasDisabled;
    }
  }
  function begin(trigger){
    ensureUi();busyCount++;document.body.classList.add('ux-busy');
    const bar=document.querySelector('.ux-action-bar');bar.classList.remove('done');bar.classList.add('show');
    setButtonBusy(trigger,true);
  }
  function end(trigger,ok){
    busyCount=Math.max(0,busyCount-1);if(!busyCount)document.body.classList.remove('ux-busy');
    setButtonBusy(trigger,false);
    const bar=document.querySelector('.ux-action-bar');bar.classList.remove('show');bar.classList.add('done');setTimeout(()=>bar.classList.remove('done'),350);
    if(trigger)toast(ok?'انجام شد':'عملیات انجام نشد',ok?'success':'error');
  }

  document.addEventListener('pointerdown',event=>{
    const node=isInteractive(event.target);if(!node)return;lastTrigger=node;lastTriggerAt=Date.now();node.classList.add('ux-pressed');setTimeout(()=>node.classList.remove('ux-pressed'),170);
  },true);
  document.addEventListener('keydown',event=>{
    if(event.key!=='Enter'&&event.key!==' ')return;const node=isInteractive(event.target);if(!node)return;lastTrigger=node;lastTriggerAt=Date.now();
  },true);
  document.addEventListener('click',event=>{
    const node=isInteractive(event.target);if(node?.dataset?.uxBusy==='1'){event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();}
  },true);

  const originalFetch=window.fetch.bind(window);
  window.fetch=async function(input,init={}){
    const url=typeof input==='string'?input:input?.url||'';
    const method=String(init?.method||(typeof input!=='string'&&input?.method)||'GET').toUpperCase();
    const mutation=['POST','PUT','PATCH','DELETE'].includes(method)&&String(url).includes('/api/2nya-nailart/');
    const trigger=mutation?recentTrigger():null;
    if(trigger)begin(trigger);
    try{
      const response=await originalFetch(input,init);
      if(trigger)end(trigger,response.ok);
      return response;
    }catch(error){if(trigger)end(trigger,false);throw error}
  };

  const syncSelectedStates=()=>{
    document.querySelectorAll('.tab').forEach(tab=>{tab.setAttribute('aria-selected',tab.classList.contains('on')?'true':'false')});
    document.querySelectorAll('.seg button').forEach(button=>button.setAttribute('aria-pressed',button.classList.contains('on')?'true':'false'));
  };
  document.addEventListener('click',event=>{if(event.target.closest?.('.tab,.seg button'))setTimeout(syncSelectedStates,0)});
  const observer=new MutationObserver(syncSelectedStates);observer.observe(document.documentElement,{subtree:true,attributes:true,attributeFilter:['class'],childList:true});
  ensureUi();syncSelectedStates();
})();
