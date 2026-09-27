(()=>{
  if(window.__donyaBookingCustomerUx)return;window.__donyaBookingCustomerUx=true;
  const toLatinDigits=value=>String(value??'').replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d))).replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  const parseIranMobile=value=>{
    const raw=toLatinDigits(value).trim();
    if(!raw)return{ok:false,error:'شماره موبایل را وارد کن.'};
    if(!/^[0-9\s\u00a0]+$/.test(raw))return{ok:false,error:'شماره موبایل فقط می‌تواند شامل عدد و فاصله باشد.'};
    const digits=raw.replace(/[\s\u00a0]+/g,'');
    if(/^09\d{9}$/.test(digits))return{ok:true,canonical:digits.slice(1),display:digits};
    if(/^9\d{9}$/.test(digits))return{ok:true,canonical:digits,display:digits};
    return{ok:false,error:'شماره موبایل باید به شکل 09xx xxx xxxx یا 9xxxxxxxxx باشد.'};
  };
  const firstName=()=>{
    const input=document.querySelector('#name');
    return String(input?.value||'').trim().split(/\s+/)[0]||'';
  };
  const greeting=()=>{const name=firstName();return name?`${name} جان، `:''};
  const ensureStyles=()=>{
    if(document.getElementById('donya-booking-customer-ux-style'))return;
    const style=document.createElement('style');style.id='donya-booking-customer-ux-style';style.textContent=`
      .donya-phone-help{display:block;margin-top:6px;font-size:.78rem;line-height:1.7;color:#7d686b}.donya-phone-help.is-error{color:#a61f3d;font-weight:700}.donya-phone-help.is-ok{color:#287443}.donya-phone-invalid{border-color:#b82a49!important;box-shadow:0 0 0 3px rgba(184,42,73,.09)!important}.donya-personal-greeting{margin:0 0 12px;padding:11px 13px;border-radius:14px;background:#fff3ee;color:#6f1837;font-weight:750}.donya-personalized strong:first-child{color:#6f1837}`;
    document.head.append(style);
  };
  const setupPhoneField=()=>{
    const phone=document.querySelector('#phone');if(!phone)return null;
    phone.setAttribute('inputmode','tel');phone.setAttribute('autocomplete','tel-national');phone.setAttribute('placeholder','0912 345 6789 یا 9123456789');
    let help=document.getElementById('donyaPhoneHelp');
    if(!help){help=document.createElement('small');help.id='donyaPhoneHelp';help.className='donya-phone-help';help.textContent='مثال: 0912 345 6789 یا 9123456789';phone.insertAdjacentElement('afterend',help)}
    const validate=(showError=false)=>{
      const parsed=parseIranMobile(phone.value);
      phone.dataset.canonicalPhone=parsed.ok?parsed.canonical:'';
      phone.classList.toggle('donya-phone-invalid',showError&&!parsed.ok);
      help.classList.toggle('is-error',showError&&!parsed.ok);help.classList.toggle('is-ok',parsed.ok);
      help.textContent=parsed.ok?'شماره موبایل معتبر است ✓':showError?parsed.error:'مثال: 0912 345 6789 یا 9123456789';
      return parsed;
    };
    phone.addEventListener('input',()=>{validate(false);queueMicrotask(syncNextButton)});
    phone.addEventListener('blur',()=>validate(Boolean(phone.value.trim())));
    return{phone,validate,help};
  };
  let phoneApi=null;
  const activeStep=()=>document.querySelector('.step.on')?.dataset.step||'';
  const syncNextButton=()=>{
    const next=document.querySelector('#next');if(!next||activeStep()!=='2'||!phoneApi)return;
    const name=String(document.querySelector('#name')?.value||'').trim();
    next.disabled=!name||!phoneApi.validate(false).ok;
  };
  const addSummaryGreeting=()=>{
    if(activeStep()!=='3')return;
    const summary=document.querySelector('#summary');if(!summary)return;
    let box=document.getElementById('donyaPersonalGreeting');
    if(!box){box=document.createElement('p');box.id='donyaPersonalGreeting';box.className='donya-personal-greeting';summary.before(box)}
    const name=firstName();box.textContent=name?`${name} جان، لطفاً جزئیات درخواستت را یک‌بار بررسی کن.`:'لطفاً جزئیات درخواستت را یک‌بار بررسی کن.';
  };
  const prefixElement=(el,name)=>{
    if(!el||!name||el.dataset.personalizedName===name)return;
    const text=el.textContent.trim();if(!text||text.startsWith(`${name} جان`))return;
    el.textContent=`${name} جان، ${text}`;el.dataset.personalizedName=name;el.classList.add('donya-personalized');
  };
  const personalizeMessages=()=>{
    const name=firstName();if(!name)return;
    const result=document.querySelector('#result');
    if(result){const primary=result.querySelector('.success h3,.empty,.push-onboard h4,.push-success b,.push-fallback h4');prefixElement(primary,name)}
    const push=document.querySelector('#pushOnboard');if(push){const h=push.querySelector('h4,.push-success b,.push-fallback h4');prefixElement(h,name)}
    addSummaryGreeting();
  };
  const normalizeBeforeSubmit=()=>{
    if(!phoneApi)return false;
    const parsed=phoneApi.validate(true);if(!parsed.ok){phoneApi.phone.focus();return false}
    phoneApi.phone.value=parsed.canonical;phoneApi.phone.dataset.canonicalPhone=parsed.canonical;return true;
  };
  const bind=()=>{
    ensureStyles();phoneApi=setupPhoneField();if(!phoneApi)return;
    document.querySelector('#name')?.addEventListener('input',()=>{syncNextButton();personalizeMessages()});
    const next=document.querySelector('#next');
    next?.addEventListener('click',event=>{
      const step=activeStep();
      if(step==='2'){
        const name=String(document.querySelector('#name')?.value||'').trim();
        if(!name)return;
        if(!normalizeBeforeSubmit()){event.preventDefault();event.stopImmediatePropagation();return}
        setTimeout(()=>{addSummaryGreeting();personalizeMessages()},0);
      }else if(step==='3'){
        if(!normalizeBeforeSubmit()){event.preventDefault();event.stopImmediatePropagation();return}
      }
    },true);
    const observer=new MutationObserver(()=>{syncNextButton();personalizeMessages()});
    observer.observe(document.querySelector('#modal')||document.body,{subtree:true,childList:true,characterData:true});
    syncNextButton();personalizeMessages();
  };
  if(document.readyState==='loading')document.addEventListener('DOMContentLoaded',bind,{once:true});else bind();
})();
