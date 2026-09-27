(()=>{
  if(window.__donyaAdminInbox)return;window.__donyaAdminInbox=true;
  let messages=[],timer=null,loading=false;
  const tabs=document.querySelector('.tabs'),main=document.querySelector('#app main.wrap');
  if(!tabs||!main)return;

  const tab=document.createElement('button');
  tab.className='tab inbox-tab';tab.dataset.tab='inbox';tab.innerHTML='پیام‌ها <span class="inbox-count" id="inboxCount"></span>';
  const settingsTab=tabs.querySelector('[data-tab="settings"]');settingsTab?tabs.insertBefore(tab,settingsTab):tabs.append(tab);

  const page=document.createElement('section');page.className='page';page.id='inbox';page.innerHTML=`<div class="hero"><div><h1>اینباکس پیام‌ها</h1><div class="muted">پیام‌هایی که از صفحه تماس با ما ارسال می‌شوند.</div></div></div><div class="inbox-toolbar"><div class="muted" id="inboxMeta">در حال بارگذاری…</div><button class="btn light" id="refreshInbox" type="button">تازه‌سازی</button></div><div class="inbox-list" id="inboxList"></div>`;main.append(page);

  const countEl=page.ownerDocument.getElementById('inboxCount'),meta=page.querySelector('#inboxMeta'),list=page.querySelector('#inboxList'),refresh=page.querySelector('#refreshInbox');
  const fmt=iso=>new Intl.DateTimeFormat('fa-IR-u-ca-persian',{timeZone:'Asia/Tehran',year:'numeric',month:'short',day:'numeric',hour:'2-digit',minute:'2-digit'}).format(new Date(iso));
  const phone=v=>v?`0${String(v).replace(/^0/,'')}`:'';
  const activate=()=>{document.querySelectorAll('[data-tab]').forEach(x=>x.classList.toggle('on',x===tab));document.querySelectorAll('.page').forEach(x=>x.classList.toggle('on',x===page));history.replaceState(null,'','#inbox');loadMessages(true)};
  tab.addEventListener('click',activate);

  function render(){
    const unread=messages.filter(m=>m.status==='unread').length;countEl.textContent=unread?String(unread):'';meta.textContent=messages.length?`${messages.length} پیام · ${unread} خوانده‌نشده`:'پیامی وجود ندارد';
    if(!messages.length){list.innerHTML='<div class="inbox-empty">هنوز پیامی از صفحه تماس دریافت نشده است.</div>';return}
    list.innerHTML=messages.map(m=>`<article class="inbox-item ${m.status==='unread'?'unread':''}" data-message-id="${esc(m.id)}"><div class="inbox-head"><div><h3 class="inbox-name">${esc(m.name)}</h3><div class="inbox-subject">${esc(m.subject)}</div></div><div class="inbox-meta">${esc(fmt(m.created_at))}</div></div><p class="inbox-preview">${esc(m.message)}</p><div class="inbox-contact">${m.phone?`<span dir="ltr">${esc(phone(m.phone))}</span>`:''}</div><div class="inbox-actions"><button class="read" type="button" data-message-action="${m.status==='unread'?'mark_read':'mark_unread'}">${m.status==='unread'?'خوانده شد':'خوانده‌نشده'}</button><button class="archive" type="button" data-message-action="archive">بایگانی</button></div></article>`).join('');
    list.querySelectorAll('.inbox-item').forEach(card=>card.addEventListener('click',event=>{if(event.target.closest('button'))return;card.classList.toggle('open');const id=card.dataset.messageId,item=messages.find(x=>x.id===id);if(item?.status==='unread')act(id,'mark_read',card.querySelector('[data-message-action="mark_read"]'))}));
    list.querySelectorAll('[data-message-action]').forEach(button=>button.addEventListener('click',event=>{event.stopPropagation();const card=button.closest('[data-message-id]');act(card.dataset.messageId,button.dataset.messageAction,button)}));
  }

  async function loadMessages(force=false){
    if(loading&&!force)return;loading=true;refresh.disabled=true;refresh.textContent='در حال دریافت…';
    try{const response=await fetch('/api/2nya-nailart/admin-messages',{cache:'no-store'});if(response.status===401||response.status===403)return;const payload=await response.json();if(!response.ok||!payload.ok)throw new Error(payload.error||'load_failed');messages=payload.messages||[];render();}
    catch{meta.textContent='دریافت پیام‌ها ناموفق بود.'}
    finally{loading=false;refresh.disabled=false;refresh.textContent='تازه‌سازی'}
  }

  async function act(id,action,button){
    if(!id||!action)return;if(button){button.disabled=true;button.textContent='…'}
    try{const response=await fetch('/api/2nya-nailart/admin-messages',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id,action})}),payload=await response.json();if(!response.ok||!payload.ok)throw new Error();if(action==='archive')messages=messages.filter(x=>x.id!==id);else messages=messages.map(x=>x.id===id?{...x,status:action==='mark_read'?'read':'unread',read_at:action==='mark_read'?new Date().toISOString():null}:x);render();}
    catch{if(button){button.disabled=false;button.textContent='دوباره تلاش کن'}}
  }

  refresh.addEventListener('click',()=>loadMessages(true));
  const schedule=()=>{clearInterval(timer);timer=setInterval(()=>{if(!document.hidden)loadMessages()},20000)};
  document.addEventListener('visibilitychange',()=>{if(!document.hidden)loadMessages(true)});
  window.addEventListener('hashchange',()=>{if(location.hash==='#inbox')activate()});
  loadMessages(true);schedule();if(location.hash==='#inbox')setTimeout(activate,0);
})();
