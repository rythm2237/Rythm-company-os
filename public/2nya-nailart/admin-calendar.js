(function enhance2nyaAdminCalendar(){
  const calState={serviceId:null,bootstrapped:false,requestSeq:0};
  const HOUR_PX=68;
  const dayNames=['یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه','شنبه'];
  const weekNames=['شنبه','یکشنبه','دوشنبه','سه‌شنبه','چهارشنبه','پنج‌شنبه','جمعه'];

  function tz(){return data?.business?.timezone||'UTC'}
  function pad(n){return String(n).padStart(2,'0')}
  function partsInZone(value){
    const d=value instanceof Date?value:new Date(value);
    const parts=new Intl.DateTimeFormat('en-GB',{timeZone:tz(),year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).formatToParts(d);
    const out={};parts.forEach(p=>{if(p.type!=='literal')out[p.type]=p.value});
    const hour=Number(out.hour)==24?0:Number(out.hour);
    return {year:Number(out.year),month:Number(out.month),day:Number(out.day),hour,minute:Number(out.minute),date:`${out.year}-${out.month}-${out.day}`,minutes:hour*60+Number(out.minute)};
  }
  function businessToday(){return partsInZone(new Date()).date}
  function carrierFromIso(iso){const [y,m,d]=iso.split('-').map(Number);return new Date(y,m-1,d,12,0,0,0)}
  function isoFromCarrier(d){return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`}
  function shiftIso(iso,days){const [y,m,d]=iso.split('-').map(Number),x=new Date(Date.UTC(y,m-1,d+days,12));return `${x.getUTCFullYear()}-${pad(x.getUTCMonth()+1)}-${pad(x.getUTCDate())}`}
  function weekdayOf(iso){const [y,m,d]=iso.split('-').map(Number);return new Date(Date.UTC(y,m-1,d,12)).getUTCDay()}
  function minutesFromClock(v){const [h,m]=String(v||'00:00').slice(0,5).split(':').map(Number);return h*60+m}
  function faDate(iso,opts={weekday:'long',day:'numeric',month:'long',year:'numeric'}){const [y,m,d]=iso.split('-').map(Number);return new Intl.DateTimeFormat('fa-IR',{...opts,timeZone:'UTC'}).format(new Date(Date.UTC(y,m-1,d,12)))}
  function faTime(value){return new Intl.DateTimeFormat('fa-IR',{timeZone:tz(),hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(value))}
  function faNum(v){return new Intl.NumberFormat('fa-IR').format(v)}
  function zonedInputValue(value){const p=partsInZone(value);return `${p.year}-${pad(p.month)}-${pad(p.day)}T${pad(p.hour)}:${pad(p.minute)}`}
  function zonedLocalToISO(local){
    const m=String(local||'').match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2})$/);if(!m)return null;
    const wanted={year:+m[1],month:+m[2],day:+m[3],hour:+m[4],minute:+m[5]};
    const wantedUtc=Date.UTC(wanted.year,wanted.month-1,wanted.day,wanted.hour,wanted.minute);let guess=wantedUtc;
    for(let i=0;i<3;i++){
      const p=partsInZone(new Date(guess));const represented=Date.UTC(p.year,p.month-1,p.day,p.hour,p.minute);guess+=wantedUtc-represented;
    }
    return new Date(guess).toISOString();
  }
  function serviceOfAppointment(a){return Array.isArray(a.nail_2nya_services)?a.nail_2nya_services[0]:a.nail_2nya_services}
  function customerOfAppointment(a){return Array.isArray(a.nail_2nya_customers)?a.nail_2nya_customers[0]:a.nail_2nya_customers}
  function activeAppointments(){return (data?.appointments||[]).filter(a=>a.status!=='cancelled')}
  function appointmentsForDate(iso){return activeAppointments().filter(a=>partsInZone(a.start_at).date===iso)}
  function blocksForDate(iso){return (data?.blocks||[]).filter(b=>partsInZone(b.start_at).date===iso||partsInZone(b.end_at).date===iso)}
  function workWindows(iso){
    if((data?.exceptions||[]).some(x=>x.exception_date===iso&&x.is_closed))return [];
    const special=(data?.special||[]).filter(x=>x.availability_date===iso).map(x=>({start:minutesFromClock(x.start_time),end:minutesFromClock(x.end_time),special:true}));
    if(special.length)return special;
    const wd=weekdayOf(iso);
    return (data?.hours||[]).filter(h=>h.active!==false&&Number(h.weekday)===wd).map(h=>({start:minutesFromClock(h.start_time),end:minutesFromClock(h.end_time),special:false}));
  }
  function monthDates(carrier){const y=carrier.getFullYear(),m=carrier.getMonth(),last=new Date(y,m+1,0).getDate();return Array.from({length:last},(_,i)=>`${y}-${pad(m+1)}-${pad(i+1)}`)}
  function weekDates(carrier){const iso=isoFromCarrier(carrier),delta=(weekdayOf(iso)+1)%7,start=shiftIso(iso,-delta);return Array.from({length:7},(_,i)=>shiftIso(start,i))}
  function selectedService(){
    const active=(data?.services||[]).filter(s=>s.active!==false);
    if(!active.length)return null;
    let s=active.find(x=>x.id===calState.serviceId);if(!s)s=active[0];calState.serviceId=s.id;return s;
  }
  function setView(v){view=v;qsa('[data-view]').forEach(x=>x.classList.toggle('on',x.dataset.view===v))}
  function setCurrentIso(iso){currentDate=carrierFromIso(iso)}
  function moveCurrent(amount){
    if(view==='month'){
      const d=new Date(currentDate),wanted=d.getDate();d.setDate(1);d.setMonth(d.getMonth()+amount);const last=new Date(d.getFullYear(),d.getMonth()+1,0).getDate();d.setDate(Math.min(wanted,last));currentDate=d;
    }else currentDate=carrierFromIso(shiftIso(isoFromCarrier(currentDate),amount*(view==='week'?7:1)));
    renderAppointments();
  }
  function updateNavigation(){
    const prev=qs('#prevDate'),next=qs('#nextDate');if(!prev||!next)return;
    const unit=view==='day'?'روز':view==='week'?'هفته':'ماه';prev.textContent=`${unit} قبل`;next.textContent=`${unit} بعد`;
  }
  async function fetchFreeSlots(dates,serviceId,seq){
    const rows=await Promise.all(dates.map(async date=>{
      try{const r=await fetch(`/api/2nya-nailart/availability?date=${encodeURIComponent(date)}&service_id=${encodeURIComponent(serviceId)}`,{cache:'no-store'});const j=await r.json();return [date,r.ok&&j.ok?(j.slots||[]):[]]}catch{return [date,[]]}
    }));
    if(seq!==calState.requestSeq)return null;
    return Object.fromEntries(rows);
  }
  function servicePicker(service){
    const options=(data?.services||[]).filter(s=>s.active!==false).map(s=>`<option value="${s.id}" ${s.id===service?.id?'selected':''}>${esc(s.name)} · ${faNum(s.duration_minutes)} دقیقه</option>`).join('');
    return `<div class="cal-toolbar"><label class="cal-service-label"><span>نمایش وقت خالی برای</span><select id="calendarService">${options}</select></label><div class="cal-legend" aria-label="راهنمای تقویم"><span><i class="dot free"></i>وقت آزاد</span><span><i class="dot booked"></i>رزرو</span><span><i class="dot blocked"></i>بلاک</span></div></div>`;
  }
  function rangeBounds(dates){
    let min=24*60,max=0;
    dates.forEach(date=>{
      workWindows(date).forEach(w=>{min=Math.min(min,w.start);max=Math.max(max,w.end)});
      appointmentsForDate(date).forEach(a=>{min=Math.min(min,partsInZone(a.start_at).minutes);max=Math.max(max,partsInZone(a.end_at).minutes)});
      blocksForDate(date).forEach(b=>{min=Math.min(min,partsInZone(b.start_at).minutes);max=Math.max(max,partsInZone(b.end_at).minutes)});
    });
    if(min===24*60||max===0){min=9*60;max=18*60}
    min=Math.max(0,Math.floor(min/60)*60);max=Math.min(24*60,Math.ceil(max/60)*60);if(max-min<240)max=Math.min(24*60,min+480);
    return {min,max,height:Math.max(300,((max-min)/60)*HOUR_PX)};
  }
  function timeAxis(bounds){
    let html='';for(let m=bounds.min;m<=bounds.max;m+=60){html+=`<div class="cal-hour-label" style="top:${((m-bounds.min)/60)*HOUR_PX}px">${faNum(Math.floor(m/60))}:۰۰</div><div class="cal-hour-line" style="top:${((m-bounds.min)/60)*HOUR_PX}px"></div>`}return html;
  }
  function clippedPosition(start,end,bounds){const s=Math.max(bounds.min,start),e=Math.min(bounds.max,end);return {top:((s-bounds.min)/60)*HOUR_PX,height:Math.max(18,((e-s)/60)*HOUR_PX)} }
  function dayLane(date,bounds,slots,compact=false,column=null){
    const windows=workWindows(date),appts=appointmentsForDate(date),blocks=blocksForDate(date);
    const work=windows.map(w=>{const p=clippedPosition(w.start,w.end,bounds);return `<div class="cal-work-window" style="top:${p.top}px;height:${p.height}px"></div>`}).join('');
    const blockHtml=blocks.map(b=>{let sp=partsInZone(b.start_at),ep=partsInZone(b.end_at);let sm=sp.date===date?sp.minutes:0,em=ep.date===date?ep.minutes:1440;const p=clippedPosition(sm,em,bounds);return `<div class="cal-block" style="top:${p.top}px;height:${p.height}px" title="${esc(b.reason||'زمان بسته')}"><span>${compact?'بلاک':esc(b.reason||'زمان بسته')}</span></div>`}).join('');
    const apptHtml=appts.map(a=>{const sp=partsInZone(a.start_at),ep=partsInZone(a.end_at),p=clippedPosition(sp.minutes,ep.minutes,bounds),s=serviceOfAppointment(a),c=customerOfAppointment(a);return `<button class="cal-appt status-${esc(a.status)}" style="top:${p.top}px;height:${Math.max(compact?28:44,p.height-3)}px" data-cal-appt="${a.id}" title="${esc(c?.name||'مشتری')} · ${esc(s?.name||'سرویس')}"><b>${compact?esc(c?.name||'مشتری'):`${faTime(a.start_at)} · ${esc(c?.name||'مشتری')}`}</b><small>${compact?faTime(a.start_at):esc(s?.name||'سرویس')}</small></button>`}).join('');
    const freeHtml=(slots||[]).map(slot=>{const sp=partsInZone(slot.start_at);if(sp.date!==date)return '';const top=((sp.minutes-bounds.min)/60)*HOUR_PX;return `<button class="cal-free-slot" style="top:${top}px" data-cal-free="${esc(slot.start_at)}" title="رزرو در ${esc(slot.label||faTime(slot.start_at))}"><span>${compact?'آزاد':`${esc(slot.label||faTime(slot.start_at))} آزاد`}</span></button>`}).join('');
    let nowLine='';if(date===businessToday()){const now=partsInZone(new Date()).minutes;if(now>=bounds.min&&now<=bounds.max)nowLine=`<div class="cal-now" style="top:${((now-bounds.min)/60)*HOUR_PX}px"><i></i></div>`}
    return `<div class="cal-lane ${compact?'compact':''}" data-date="${date}" style="height:${bounds.height}px${column?`;grid-column:${column}`:''}">${work}${blockHtml}${freeHtml}${apptHtml}${nowLine}</div>`;
  }
  function summaryHtml(dates,slotMap){const bookings=dates.reduce((n,d)=>n+appointmentsForDate(d).length,0),free=dates.reduce((n,d)=>n+(slotMap[d]?.length||0),0),closed=dates.filter(d=>!workWindows(d).length).length;return `<div class="cal-summary"><div><b>${faNum(bookings)}</b><span>رزرو</span></div><div><b>${faNum(free)}</b><span>شروعِ آزاد</span></div><div><b>${faNum(closed)}</b><span>روز بسته</span></div></div>`}
  function bindCalendarInteractions(){
    const select=qs('#calendarService');if(select)select.onchange=()=>{calState.serviceId=select.value;renderAppointments()};
    qsa('[data-cal-free]').forEach(b=>b.onclick=()=>openCalendarBooking({startAt:b.dataset.calFree,serviceId:calState.serviceId}));
    qsa('[data-cal-appt]').forEach(b=>b.onclick=()=>openCalendarAppointment(b.dataset.calAppt));
    qsa('[data-calendar-day]').forEach(b=>b.onclick=()=>{setCurrentIso(b.dataset.calendarDay);setView('day');renderAppointments()});
  }
  function renderDay(date,slotMap,bounds){
    const schedule=workWindows(date);return `<div class="cal-day-card"><div class="cal-day-title"><div><b>${faDate(date)}</b><span>${schedule.length?schedule.map(w=>`${pad(Math.floor(w.start/60))}:${pad(w.start%60)}–${pad(Math.floor(w.end/60))}:${pad(w.end%60)}`).join('، '):'تعطیل / بسته'}</span></div><button class="btn wine cal-add" id="calendarAdd">+ رزرو</button></div><div class="cal-timeline cal-single" style="height:${bounds.height}px"><div class="cal-axis" style="height:${bounds.height}px">${timeAxis(bounds)}</div>${dayLane(date,bounds,slotMap[date]||[],false)}</div></div>`;
  }
  function renderWeek(dates,slotMap,bounds){
    const heads=dates.map(d=>`<div class="cal-week-head ${d===businessToday()?'today':''}"><b>${weekNames[(weekdayOf(d)+1)%7]}</b><span>${faDate(d,{day:'numeric',month:'short'})}</span></div>`).join('');
    const lanes=dates.map((d,i)=>dayLane(d,bounds,slotMap[d]||[],true,i+2)).join('');
    return `<div class="cal-week-scroll"><div class="cal-week-grid" style="--week-height:${bounds.height}px"><div class="cal-week-corner">ساعت</div>${heads}<div class="cal-axis week-axis" style="height:${bounds.height}px">${timeAxis(bounds)}</div>${lanes}</div></div>`;
  }
  function renderMonth(carrier){
    const dates=monthDates(carrier),first=dates[0],leading=(weekdayOf(first)+1)%7,heads=weekNames.map(x=>`<div class="month-weekday">${x}</div>`).join('');let cells='';
    for(let i=0;i<leading;i++)cells+='<div class="month-cell ghost"></div>';
    dates.forEach(date=>{const appts=appointmentsForDate(date),open=workWindows(date).length>0,today=date===businessToday();cells+=`<button class="month-cell ${today?'today':''} ${open?'open':'closed'}" data-calendar-day="${date}"><strong>${faNum(Number(date.slice(-2)))}</strong><span>${open?'باز':'تعطیل'}</span>${appts.length?`<em>${faNum(appts.length)} رزرو</em>`:'<em>بدون رزرو</em>'}</button>`});
    return `<div class="cal-month-note">برای دیدن ساعت‌های خالی، روی هر روز بزنید.</div><div class="month-grid">${heads}${cells}</div>`;
  }
  async function renderCalendar(){
    if(!data)return;
    if(!calState.bootstrapped){setCurrentIso(businessToday());calState.bootstrapped=true}
    updateNavigation();const service=selectedService(),root=qs('#appointments');if(!root)return;
    const currentIso=isoFromCarrier(currentDate);let dates=[];
    if(view==='day')dates=[currentIso];else if(view==='week')dates=weekDates(currentDate);else dates=monthDates(currentDate);
    qs('#agendaMeta').textContent=view==='day'?faDate(dates[0]):view==='week'?`${faDate(dates[0],{day:'numeric',month:'long'})} تا ${faDate(dates[6],{day:'numeric',month:'long',year:'numeric'})}`:faDate(`${currentDate.getFullYear()}-${pad(currentDate.getMonth()+1)}-01`,{month:'long',year:'numeric'});
    if(!service){root.innerHTML='<div class="empty">ابتدا یک سرویس فعال تعریف کنید تا تقویم وقت‌های آزاد نمایش داده شود.</div>';return}
    root.innerHTML=`${servicePicker(service)}<div class="cal-loading">در حال محاسبه زمان‌های آزاد…</div>`;
    const select=qs('#calendarService');if(select)select.onchange=()=>{calState.serviceId=select.value;renderAppointments()};
    if(view==='month'){root.innerHTML=`${servicePicker(service)}${renderMonth(currentDate)}`;bindCalendarInteractions();return}
    const seq=++calState.requestSeq,slotMap=await fetchFreeSlots(dates,service.id,seq);if(!slotMap)return;
    const bounds=rangeBounds(dates);root.innerHTML=`${servicePicker(service)}${summaryHtml(dates,slotMap)}${view==='day'?renderDay(dates[0],slotMap,bounds):renderWeek(dates,slotMap,bounds)}`;
    const add=qs('#calendarAdd');if(add)add.onclick=()=>openCalendarBooking({serviceId:service.id,date:dates[0]});bindCalendarInteractions();
  }
  function openCalendarBooking(prefill={}){
    const services=(data?.services||[]).filter(s=>s.active!==false);if(!services.length){alert('ابتدا یک سرویس فعال تعریف کنید.');return}
    const serviceId=prefill.serviceId||calState.serviceId||services[0].id,service=services.find(s=>s.id===serviceId)||services[0];let startValue='';
    if(prefill.startAt)startValue=zonedInputValue(prefill.startAt);else{const base=prefill.date||businessToday(),windows=workWindows(base);const minute=windows[0]?.start??10*60;startValue=`${base}T${pad(Math.floor(minute/60))}:${pad(minute%60)}`}
    const opts=services.map(s=>`<option value="${s.id}" ${s.id===service.id?'selected':''}>${esc(s.name)} · ${faNum(s.duration_minutes)} دقیقه</option>`).join('');
    openDrawer(`<div class="cal-drawer-head"><div><h2>رزرو جدید</h2><p>زمان‌ها بر اساس ${esc(tz())} نمایش داده می‌شوند.</p></div></div><form id="calendarManualForm" class="grid"><label class="field"><span>سرویس</span><select id="cmservice">${opts}</select></label><label class="field"><span>شروع</span><input id="cmstart" type="datetime-local" value="${esc(startValue)}" required></label><label class="field"><span>نام مشتری *</span><input id="cmname" required></label><label class="field"><span>تلفن *</span><input id="cmphone" required></label><label class="field full"><span>یادداشت مدیر</span><textarea id="cmnote"></textarea></label><button class="btn wine field full">ثبت رزرو</button></form>`);
    qs('#calendarManualForm').onsubmit=e=>{e.preventDefault();const iso=zonedLocalToISO(qs('#cmstart').value);if(!iso){alert('زمان معتبر نیست.');return}action({action:'manual_booking',service_id:qs('#cmservice').value,start_at:iso,name:qs('#cmname').value,phone:qs('#cmphone').value,admin_notes:qs('#cmnote').value})};
  }
  function openCalendarAppointment(id){
    const a=(data?.appointments||[]).find(x=>x.id===id);if(!a)return;const c=customerOfAppointment(a),opts=(data?.services||[]).map(s=>`<option value="${s.id}" ${s.id===a.service_id?'selected':''}>${esc(s.name)}</option>`).join('');
    openDrawer(`<div class="cal-drawer-head"><div><h2>جزئیات وقت</h2><p>${esc(c?.name||'مشتری')} · ${esc(c?.phone||'')}</p></div><span class="badge ${esc(a.status)}">${statusFa(a.status)}</span></div><form id="calendarMoveForm" class="grid"><label class="field"><span>سرویس</span><select id="caservice">${opts}</select></label><label class="field"><span>شروع</span><input id="castart" type="datetime-local" value="${esc(zonedInputValue(a.start_at))}" required></label><label class="field full"><span>یادداشت مدیر</span><textarea id="canote">${esc(a.admin_notes||'')}</textarea></label><button class="btn wine field full">ذخیره تغییر</button></form><div class="cal-status-actions"><button class="btn" data-cal-status="completed">انجام شد</button><button class="btn light" data-cal-status="no_show">عدم حضور</button><button class="btn danger" data-cal-status="cancelled">لغو وقت</button></div>`);
    qs('#calendarMoveForm').onsubmit=e=>{e.preventDefault();const iso=zonedLocalToISO(qs('#castart').value);if(!iso){alert('زمان معتبر نیست.');return}action({action:'appointment_move',id:a.id,service_id:qs('#caservice').value,start_at:iso,admin_notes:qs('#canote').value})};
    qsa('[data-cal-status]').forEach(b=>b.onclick=()=>{const st=b.dataset.calStatus;if(st==='cancelled'&&!confirm('این وقت لغو شود؟'))return;action({action:'appointment_status',id:a.id,status:st})});
  }

  renderAppointments=renderCalendar;
  qs('#prevDate').onclick=()=>moveCurrent(-1);qs('#nextDate').onclick=()=>moveCurrent(1);qs('#today').onclick=()=>{setCurrentIso(businessToday());renderAppointments()};
  qsa('[data-view]').forEach(b=>b.onclick=()=>{setView(b.dataset.view);renderAppointments()});
  qs('#newBooking').onclick=()=>openCalendarBooking({serviceId:calState.serviceId});qs('#quickBooking').onclick=()=>openCalendarBooking({serviceId:calState.serviceId});
})();
