(function enhance2nyaAdminWorkflow(){
  const b64Key=value=>{const s=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),raw=atob(s+'='.repeat((4-s.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0))};
  const customerOf=a=>Array.isArray(a?.nail_2nya_customers)?a.nail_2nya_customers[0]:a?.nail_2nya_customers;
  const serviceOf=a=>Array.isArray(a?.nail_2nya_services)?a.nail_2nya_services[0]:a?.nail_2nya_services;
  let pushSyncedEndpoint='';

  function ensureWorkflowStyles(){
    if(qs('#adminWorkflowStyles'))return;
    const style=document.createElement('style');style.id='adminWorkflowStyles';style.textContent=`
      .request-tab-badge{display:inline-grid;place-items:center;min-width:22px;height:22px;padding:0 6px;margin-right:5px;border-radius:999px;background:#a92236;color:#fff;font-size:.72rem;font-weight:900}.request-tab-badge:empty{display:none}.pending-banner{display:flex;align-items:center;justify-content:space-between;gap:12px;padding:13px 15px;margin:0 0 12px;border:1px solid rgba(169,34,54,.18);border-radius:16px;background:#fff2f3}.pending-banner.hidden{display:none!important}.pending-banner b{color:#7d1f2e}.pending-list{display:grid;gap:10px}.pending-card{background:#fff;border:1px solid var(--line);border-right:4px solid #a92236;border-radius:18px;padding:14px}.pending-card-main{display:grid;grid-template-columns:minmax(0,1fr) auto;gap:12px;align-items:start}.pending-card h3{margin:0 0 5px;font:800 1.05rem Estedad}.pending-card .when{font-weight:800;color:#681b2a}.pending-card .details{margin-top:6px;color:var(--muted);font-size:.88rem;line-height:1.8}.pending-card-actions{display:flex;gap:7px;flex-wrap:wrap;margin-top:12px}.pending-card-actions .btn{padding:9px 12px}.request-empty{padding:28px 18px;text-align:center;border:1px dashed var(--line);border-radius:18px;background:#fff;color:var(--muted)}@media(max-width:620px){.pending-card-main{grid-template-columns:1fr}.pending-banner{align-items:flex-start;flex-direction:column}.pending-banner .btn{width:100%}.pending-card-actions .btn{flex:1}}
    `;document.head.append(style);
  }

  function pendingAppointments(){
    return (data?.appointments||[]).filter(a=>a.status==='pending').sort((a,b)=>new Date(a.start_at).getTime()-new Date(b.start_at).getTime());
  }

  function switchAdminTab(name){
    qsa('[data-tab]').forEach(button=>button.classList.toggle('on',button.dataset.tab===name));
    qsa('.page').forEach(page=>page.classList.toggle('on',page.id===name));
  }

  function ensurePendingUI(){
    ensureWorkflowStyles();
    if(!qs('[data-tab="requests"]')){
      const tab=document.createElement('button');tab.className='tab';tab.type='button';tab.dataset.tab='requests';tab.innerHTML='درخواست‌ها <span class="request-tab-badge" id="pendingRequestCount"></span>';
      qs('[data-tab="agenda"]')?.after(tab);
      tab.onclick=()=>switchAdminTab('requests');
    }
    if(!qs('#requests')){
      const section=document.createElement('section');section.className='page';section.id='requests';section.innerHTML=`<div class="hero"><div><h1>درخواست‌های وقت</h1><div class="muted">همه درخواست‌هایی که هنوز باید تأیید یا رد شوند، مستقل از تاریخ تقویم اینجا نمایش داده می‌شوند.</div></div></div><div id="pendingRequestList"></div>`;
      qs('#services')?.before(section);
    }
    if(!qs('#pendingRequestBanner')){
      const banner=document.createElement('div');banner.id='pendingRequestBanner';banner.className='pending-banner hidden';
      qs('#appointments')?.before(banner);
    }
  }

  function requestDate(a){
    return new Intl.DateTimeFormat('fa-IR',{timeZone:data?.business?.timezone||'UTC',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(a.start_at));
  }

  function renderPendingInbox(){
    ensurePendingUI();
    const rows=pendingAppointments(),badge=qs('#pendingRequestCount'),list=qs('#pendingRequestList'),banner=qs('#pendingRequestBanner');
    if(badge)badge.textContent=rows.length?String(rows.length):'';
    if(banner){
      banner.classList.toggle('hidden',!rows.length);
      banner.innerHTML=rows.length?`<div><b>${rows.length.toLocaleString('fa-IR')} درخواست در انتظار تأیید</b><div class="muted">برای تأیید یا رد لازم نیست روز رزرو را در تقویم پیدا کنید.</div></div><button class="btn wine" type="button" id="openPendingRequests">مشاهده درخواست‌ها</button>`:'';
      qs('#openPendingRequests')?.addEventListener('click',()=>switchAdminTab('requests'));
    }
    if(!list)return;
    if(!rows.length){list.innerHTML='<div class="request-empty">در حال حاضر درخواست تأییدنشده‌ای وجود ندارد.</div>';return}
    list.innerHTML=`<div class="pending-list">${rows.map(a=>{const c=customerOf(a),s=serviceOf(a);return `<article class="pending-card"><div class="pending-card-main"><div><h3>${esc(c?.name||'مشتری')}</h3><div class="when">${esc(requestDate(a))}</div><div class="details">${esc(s?.name||'سرویس')}${c?.phone?` · <span dir="ltr">${esc(c.phone)}</span>`:''}${a.booking_reference?` · کد <span dir="ltr">${esc(a.booking_reference)}</span>`:''}</div>${a.customer_notes?`<div class="details">یادداشت: ${esc(a.customer_notes)}</div>`:''}</div><span class="badge pending">در انتظار</span></div><div class="pending-card-actions"><button class="btn wine" type="button" data-request-approve="${a.id}">تأیید</button><button class="btn danger" type="button" data-request-reject="${a.id}">رد</button><button class="btn light" type="button" data-request-open="${a.id}">جزئیات</button></div></article>`}).join('')}</div>`;
    qsa('[data-request-open]').forEach(button=>button.onclick=()=>openPendingReview(button.dataset.requestOpen));
    qsa('[data-request-approve]').forEach(button=>button.onclick=()=>action({action:'appointment_status',id:button.dataset.requestApprove,status:'confirmed'}));
    qsa('[data-request-reject]').forEach(button=>button.onclick=()=>confirm('این درخواست رد شود؟')&&action({action:'appointment_status',id:button.dataset.requestReject,status:'cancelled'}));
  }

  function mountDefaultHours(){
    const page=qs('#availability');if(!page||!data)return;
    let card=qs('#defaultHoursCard');
    const rows=(data.hours||[]).filter(h=>Number(h.weekday)!==5&&h.active!==false);
    const start=rows[0]?String(rows[0].start_time).slice(0,5):'08:00',end=rows[0]?String(rows[0].end_time).slice(0,5):'17:00';
    if(!card){
      card=document.createElement('div');card.id='defaultHoursCard';card.className='card';
      const anchor=page.querySelector('.card');anchor?.before(card);
    }
    card.innerHTML=`<h3>ساعات پیش‌فرض کاری</h3><p class="muted">این بازه برای شنبه تا پنجشنبه اعمال می‌شود. جمعه به‌صورت پیش‌فرض بسته است؛ برای باز کردن یک جمعه مشخص از «ساعات ویژه» استفاده کنید.</p><form id="defaultHoursForm" class="grid"><label class="field"><span>شروع پیش‌فرض</span><input id="defaultStart" type="time" value="${esc(start)}" required></label><label class="field"><span>پایان پیش‌فرض</span><input id="defaultEnd" type="time" value="${esc(end)}" required></label><button class="btn wine field full">اعمال ساعات پیش‌فرض</button></form>`;
    qs('#defaultHoursForm').onsubmit=e=>{e.preventDefault();const s=qs('#defaultStart').value,n=qs('#defaultEnd').value;if(!s||!n||s>=n){alert('ساعت شروع و پایان را بررسی کنید.');return}if(confirm(`ساعات پیش‌فرض شنبه تا پنجشنبه روی ${s} تا ${n} تنظیم شود؟`))action({action:'set_default_hours',start_time:s,end_time:n})};
  }

  function openPendingReview(id){
    const a=(data?.appointments||[]).find(x=>x.id===id);if(!a||a.status!=='pending')return false;
    const c=customerOf(a),s=serviceOf(a),date=requestDate(a);
    openDrawer(`<h2>درخواست وقت</h2><div class="card" style="margin-top:12px"><div class="row between"><span>مشتری</span><b>${esc(c?.name||'مشتری')}</b></div><div class="row between"><span>تلفن</span><b dir="ltr">${esc(c?.phone||'')}</b></div><div class="row between"><span>سرویس</span><b>${esc(s?.name||'سرویس')}</b></div><div class="row between"><span>زمان</span><b>${esc(date)}</b></div>${a.customer_notes?`<div style="margin-top:12px"><span class="muted">توضیح مشتری</span><p>${esc(a.customer_notes)}</p></div>`:''}</div><div class="notice">این زمان تا زمان تصمیم شما برای رزروهای دیگر مسدود می‌ماند.</div><div class="grid"><button class="btn wine" id="approveRequest">تأیید درخواست</button><button class="btn danger" id="rejectRequest">رد درخواست</button></div>`);
    qs('#approveRequest').onclick=()=>action({action:'appointment_status',id:a.id,status:'confirmed'});
    qs('#rejectRequest').onclick=()=>confirm('این درخواست رد شود؟')&&action({action:'appointment_status',id:a.id,status:'cancelled'});
    return true;
  }

  async function persistPushSubscription(sub){
    if(!sub?.endpoint||sub.endpoint===pushSyncedEndpoint)return;
    const response=await fetch('/api/2nya-nailart/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'push_subscribe',subscription:sub.toJSON()})});
    if(response.ok)pushSyncedEndpoint=sub.endpoint;
  }

  async function syncAdminPushState(){
    const button=qs('#notify');if(!button)return;
    if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window)){button.textContent='اعلان پشتیبانی نمی‌شود';return}
    if(Notification.permission!=='granted'){button.textContent='فعال‌سازی اعلان‌ها';return}
    try{
      const reg=await navigator.serviceWorker.ready,sub=await reg.pushManager.getSubscription();
      if(!sub){button.textContent='فعال‌سازی اعلان‌ها';return}
      button.textContent='اعلان‌ها فعال است';
      await persistPushSubscription(sub);
    }catch{}
  }

  async function enableAdminPush(){
    try{
      if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('این مرورگر از اعلان وب پشتیبانی نمی‌کند.');
      const perm=await Notification.requestPermission();if(perm!=='granted')throw Error('اجازه اعلان داده نشد.');
      const kr=await fetch('/api/2nya-nailart/push-key',{cache:'no-store'}),kj=await kr.json();if(!kr.ok||!kj?.public_key)throw Error('کلید اعلان در دسترس نیست.');
      const reg=await navigator.serviceWorker.ready,newKey=b64Key(kj.public_key),old=await reg.pushManager.getSubscription();
      if(old){const a=old.options?.applicationServerKey?Array.from(new Uint8Array(old.options.applicationServerKey)).join(','):'',b=Array.from(newKey).join(',');if(a&&a!==b)await old.unsubscribe();}
      const sub=await reg.pushManager.getSubscription()||await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:newKey});
      const response=await fetch('/api/2nya-nailart/admin',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({action:'push_subscribe',subscription:sub.toJSON()})}),payload=await response.json();
      if(!response.ok||!payload.ok)throw Error(payload.error||'اشتراک اعلان ذخیره نشد.');
      pushSyncedEndpoint=sub.endpoint;const button=qs('#notify');if(button)button.textContent='اعلان‌ها فعال است';alert('اعلان درخواست‌های وقت روی این دستگاه فعال است.');
    }catch(error){alert(error.message||'فعال‌سازی اعلان انجام نشد.');}
  }

  const originalRenderAll=renderAll;
  renderAll=function(){originalRenderAll();setTimeout(()=>{mountDefaultHours();renderPendingInbox();syncAdminPushState()},0)};

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-cal-appt]');if(!button)return;
    const a=(data?.appointments||[]).find(x=>x.id===button.dataset.calAppt);if(a?.status!=='pending')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openPendingReview(a.id);
  },true);

  const notify=qs('#notify');if(notify)notify.onclick=enableAdminPush;
  ensurePendingUI();
  setInterval(()=>{if(!document.hidden&&!qs('#app')?.classList.contains('hidden'))load().catch(()=>{})},20000);
  document.addEventListener('visibilitychange',()=>{if(!document.hidden&&!qs('#app')?.classList.contains('hidden'))load().catch(()=>{})});
})();
