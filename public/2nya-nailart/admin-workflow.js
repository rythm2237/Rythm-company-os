(function enhance2nyaAdminWorkflow(){
  const b64Key=value=>{const s=String(value||'').replace(/-/g,'+').replace(/_/g,'/'),raw=atob(s+'='.repeat((4-s.length%4)%4));return Uint8Array.from(raw,c=>c.charCodeAt(0))};
  const customerOf=a=>Array.isArray(a?.nail_2nya_customers)?a.nail_2nya_customers[0]:a?.nail_2nya_customers;
  const serviceOf=a=>Array.isArray(a?.nail_2nya_services)?a.nail_2nya_services[0]:a?.nail_2nya_services;

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
    const c=customerOf(a),s=serviceOf(a),date=new Intl.DateTimeFormat('fa-IR',{timeZone:data?.business?.timezone||'UTC',weekday:'long',day:'numeric',month:'long',hour:'2-digit',minute:'2-digit'}).format(new Date(a.start_at));
    openDrawer(`<h2>درخواست وقت</h2><div class="card" style="margin-top:12px"><div class="row between"><span>مشتری</span><b>${esc(c?.name||'مشتری')}</b></div><div class="row between"><span>تلفن</span><b dir="ltr">${esc(c?.phone||'')}</b></div><div class="row between"><span>سرویس</span><b>${esc(s?.name||'سرویس')}</b></div><div class="row between"><span>زمان</span><b>${esc(date)}</b></div>${a.customer_notes?`<div style="margin-top:12px"><span class="muted">توضیح مشتری</span><p>${esc(a.customer_notes)}</p></div>`:''}</div><div class="notice">این زمان تا زمان تصمیم شما برای رزروهای دیگر مسدود می‌ماند.</div><div class="grid"><button class="btn wine" id="approveRequest">تأیید درخواست</button><button class="btn danger" id="rejectRequest">رد درخواست</button></div>`);
    qs('#approveRequest').onclick=()=>action({action:'appointment_status',id:a.id,status:'confirmed'});
    qs('#rejectRequest').onclick=()=>confirm('این درخواست رد شود؟')&&action({action:'appointment_status',id:a.id,status:'cancelled'});
    return true;
  }

  async function enableAdminPush(){
    try{
      if(!('serviceWorker'in navigator)||!('PushManager'in window)||!('Notification'in window))throw Error('این مرورگر از اعلان وب پشتیبانی نمی‌کند.');
      const perm=await Notification.requestPermission();if(perm!=='granted')throw Error('اجازه اعلان داده نشد.');
      const kr=await fetch('/api/2nya-nailart/push-key',{cache:'no-store'}),kj=await kr.json();if(!kr.ok||!kj?.public_key)throw Error('کلید اعلان در دسترس نیست.');
      const reg=await navigator.serviceWorker.ready,newKey=b64Key(kj.public_key),old=await reg.pushManager.getSubscription();
      if(old){const a=old.options?.applicationServerKey?Array.from(new Uint8Array(old.options.applicationServerKey)).join(','):'',b=Array.from(newKey).join(',');if(a&&a!==b)await old.unsubscribe();}
      const sub=await reg.pushManager.subscribe({userVisibleOnly:true,applicationServerKey:newKey});
      const ok=await action({action:'push_subscribe',subscription:sub.toJSON()});if(ok){const button=qs('#notify');if(button)button.textContent='اعلان‌ها فعال است';alert('اعلان درخواست‌های وقت روی این دستگاه فعال شد.');}
    }catch(error){alert(error.message||'فعال‌سازی اعلان انجام نشد.');}
  }

  const originalRenderAll=renderAll;
  renderAll=function(){originalRenderAll();setTimeout(mountDefaultHours,0)};

  document.addEventListener('click',event=>{
    const button=event.target.closest?.('[data-cal-appt]');if(!button)return;
    const a=(data?.appointments||[]).find(x=>x.id===button.dataset.calAppt);if(a?.status!=='pending')return;
    event.preventDefault();event.stopPropagation();event.stopImmediatePropagation();openPendingReview(a.id);
  },true);

  const notify=qs('#notify');if(notify)notify.onclick=enableAdminPush;
})();
