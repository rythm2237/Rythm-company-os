(()=>{
  const API='/api/2nya-nailart/admin/gallery';
  let galleryLoaded=false;
  const one=selector=>document.querySelector(selector);
  const all=selector=>[...document.querySelectorAll(selector)];
  const escapeHtml=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));

  function ensureStyle(){
    if(one('#adminGalleryStyle'))return;
    const style=document.createElement('style');style.id='adminGalleryStyle';style.textContent=`
      .gallery-admin-upload{display:grid;grid-template-columns:170px 1fr;gap:16px;align-items:start}.gallery-admin-preview{height:170px;border-radius:20px;border:1px dashed var(--line);background:#f4ebe4;display:grid;place-items:center;overflow:hidden;color:var(--muted);text-align:center;padding:10px}.gallery-admin-preview img{width:100%;height:100%;object-fit:cover;display:none}.gallery-admin-preview.has-image img{display:block}.gallery-admin-preview.has-image span{display:none}.gallery-admin-list{display:grid;grid-template-columns:repeat(3,minmax(0,1fr));gap:12px}.gallery-admin-item{background:#fff;border:1px solid var(--line);border-radius:20px;overflow:hidden}.gallery-admin-item img{width:100%;aspect-ratio:4/5;display:block;object-fit:cover;background:#eee4db}.gallery-admin-item-body{padding:12px}.gallery-admin-item-title{font-weight:700;line-height:1.55;min-height:2.8em}.gallery-admin-item-meta{font-size:.76rem;color:var(--muted);margin:5px 0 10px}.gallery-admin-item .btn{width:100%}.gallery-admin-help{font-size:.82rem;color:var(--muted);line-height:1.8}.gallery-admin-status{margin-top:9px;font-size:.86rem}.gallery-admin-status.error{color:#842735}.gallery-admin-status.ok{color:#245d30}@media(max-width:820px){.gallery-admin-list{grid-template-columns:repeat(2,minmax(0,1fr))}}@media(max-width:560px){.gallery-admin-upload{grid-template-columns:1fr}.gallery-admin-preview{height:220px}.gallery-admin-list{grid-template-columns:1fr 1fr;gap:8px}.gallery-admin-item-body{padding:9px}.gallery-admin-item-title{font-size:.83rem}.gallery-admin-item .btn{padding:9px;font-size:.82rem}}
    `;document.head.append(style);
  }

  function mount(){
    if(one('#gallery'))return;
    ensureStyle();
    const servicesTab=one('[data-tab="services"]');
    const tab=document.createElement('button');tab.className='tab';tab.type='button';tab.dataset.tab='gallery';tab.textContent='نمونه‌کارها';servicesTab?.after(tab);
    const section=document.createElement('section');section.className='page';section.id='gallery';section.innerHTML=`
      <div class="hero"><div><h1>گالری نمونه‌کارها</h1><div class="muted">عکس‌های نمایش‌داده‌شده در بخش نمونه‌کارهای سایت را مدیریت کنید.</div></div></div>
      <div class="card"><h3>افزودن عکس جدید</h3><form id="galleryUploadForm" class="gallery-admin-upload"><div class="gallery-admin-preview" id="galleryPreview"><span>پیش‌نمایش عکس</span><img alt="پیش‌نمایش"></div><div><label class="field"><span>انتخاب عکس *</span><input id="galleryFile" name="file" type="file" accept="image/jpeg,image/png,image/webp" required></label><label class="field" style="margin-top:10px"><span>عنوان کوتاه</span><input id="galleryTitle" name="title" maxlength="120" placeholder="مثلاً فرنچ قرمز مینیمال"></label><p class="gallery-admin-help">فرمت‌های JPG، PNG و WebP · حداکثر ۸ مگابایت. عکس جدید در انتهای گالری قرار می‌گیرد.</p><button class="btn wine" id="galleryUploadButton" type="submit">افزودن به گالری</button><div id="galleryUploadStatus" class="gallery-admin-status"></div></div></form></div>
      <div class="row between" style="margin:18px 0 10px"><h3 style="margin:0">عکس‌های فعلی</h3><button class="btn light" id="galleryRefresh" type="button">بروزرسانی</button></div>
      <div id="galleryAdminList"><div class="empty">در حال بارگذاری…</div></div>`;
    one('#availability')?.before(section);

    tab.onclick=()=>{
      all('[data-tab]').forEach(button=>button.classList.remove('on'));tab.classList.add('on');
      all('.page').forEach(page=>page.classList.remove('on'));section.classList.add('on');
      loadGallery();
    };
    one('#galleryRefresh').onclick=()=>loadGallery(true);
    one('#galleryFile').onchange=previewSelected;
    one('#galleryUploadForm').onsubmit=upload;
  }

  function previewSelected(){
    const file=one('#galleryFile').files?.[0],box=one('#galleryPreview'),img=box.querySelector('img');
    if(!file){box.classList.remove('has-image');img.removeAttribute('src');return}
    const url=URL.createObjectURL(file);img.onload=()=>URL.revokeObjectURL(url);img.src=url;box.classList.add('has-image');
  }

  async function loadGallery(force=false){
    const root=one('#galleryAdminList');if(!root)return;
    if(!force&&galleryLoaded&&root.dataset.ready==='1')return;
    root.innerHTML='<div class="empty">در حال بارگذاری…</div>';
    try{
      const response=await fetch(API,{cache:'no-store'}),payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error(payload.error||'گالری بارگذاری نشد.');
      galleryLoaded=true;root.dataset.ready='1';render(payload.items||[]);
    }catch(error){root.innerHTML=`<div class="empty">${escapeHtml(error.message||'گالری بارگذاری نشد.')}</div>`}
  }

  function render(items){
    const root=one('#galleryAdminList');
    if(!items.length){root.innerHTML='<div class="empty">در حال حاضر عکسی در گالری نیست.</div>';return}
    root.innerHTML=`<div class="gallery-admin-list">${items.map((item,index)=>`<article class="gallery-admin-item"><img src="${escapeHtml(item.src)}" alt="${escapeHtml(item.alt_text||'نمونه‌کار')}" loading="lazy"><div class="gallery-admin-item-body"><div class="gallery-admin-item-title">${escapeHtml(item.alt_text||'بدون عنوان')}</div><div class="gallery-admin-item-meta">عکس ${index+1} از ${items.length}</div><button class="btn danger" type="button" data-gallery-delete="${item.id}">حذف از گالری</button></div></article>`).join('')}</div>`;
    all('[data-gallery-delete]').forEach(button=>button.onclick=()=>removeItem(button.dataset.galleryDelete));
  }

  async function upload(event){
    event.preventDefault();
    const file=one('#galleryFile').files?.[0],button=one('#galleryUploadButton'),status=one('#galleryUploadStatus');
    if(!file)return;
    if(file.size>8*1024*1024){status.className='gallery-admin-status error';status.textContent='حجم عکس باید کمتر از ۸ مگابایت باشد.';return}
    const form=new FormData();form.append('file',file);form.append('title',one('#galleryTitle').value.trim());
    button.disabled=true;button.textContent='در حال آپلود…';status.className='gallery-admin-status';status.textContent='';
    try{
      const response=await fetch(API,{method:'POST',body:form}),payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error(payload.error||'آپلود انجام نشد.');
      status.className='gallery-admin-status ok';status.textContent='عکس به گالری اضافه شد.';
      one('#galleryUploadForm').reset();one('#galleryPreview').classList.remove('has-image');one('#galleryPreview img').removeAttribute('src');
      galleryLoaded=false;await loadGallery(true);
    }catch(error){status.className='gallery-admin-status error';status.textContent=error.message||'آپلود انجام نشد.'}
    finally{button.disabled=false;button.textContent='افزودن به گالری'}
  }

  async function removeItem(id){
    if(!confirm('این عکس از گالری سایت حذف شود؟'))return;
    try{
      const response=await fetch(API,{method:'DELETE',headers:{'Content-Type':'application/json'},body:JSON.stringify({id})}),payload=await response.json();
      if(!response.ok||!payload.ok)throw new Error(payload.error||'حذف انجام نشد.');
      galleryLoaded=false;await loadGallery(true);
    }catch(error){alert(error.message||'حذف عکس انجام نشد.')}
  }

  mount();
})();
