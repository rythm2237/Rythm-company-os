import { randomUUID } from 'node:crypto';
import { NextRequest,NextResponse } from 'next/server';
import { requireNailAdmin } from '@/lib/2nya-nailart/server';

export const runtime='nodejs';
export const dynamic='force-dynamic';

const BUCKET='nail-2nya-media';
const MAX_BYTES=8*1024*1024;
const MIME_EXT:Record<string,string>={
  'image/jpeg':'jpg',
  'image/png':'png',
  'image/webp':'webp',
};

type AdminAuth=Awaited<ReturnType<typeof requireNailAdmin>> & {ok:true};

function reply(auth:AdminAuth,payload:unknown,status=200){
  const response=NextResponse.json(payload,{status,headers:{'Cache-Control':'no-store'}});
  auth.response.cookies.getAll().forEach(cookie=>response.cookies.set(cookie));
  return response;
}

function imageUrl(auth:AdminAuth,imagePath:string){
  if(!imagePath.startsWith('storage:'))return imagePath;
  return auth.supabase.storage.from(BUCKET).getPublicUrl(imagePath.slice('storage:'.length)).data.publicUrl;
}

export async function GET(request:NextRequest){
  const auth=await requireNailAdmin(request);if(!auth.ok)return auth.response;
  const {data,error}=await auth.supabase
    .from('nail_2nya_portfolio_items')
    .select('id,image_path,alt_text,featured,visible,sort_order,created_at')
    .eq('visible',true)
    .order('sort_order',{ascending:true})
    .order('created_at',{ascending:true});
  if(error){console.error('2nya_admin_gallery_load_failed',{code:error.code});return reply(auth,{ok:false,error:'گالری بارگذاری نشد.'},503)}
  const items=(data||[]).map(row=>({...row,src:imageUrl(auth,row.image_path)}));
  return reply(auth,{ok:true,items});
}

export async function POST(request:NextRequest){
  const auth=await requireNailAdmin(request);if(!auth.ok)return auth.response;
  let objectPath:string|null=null;
  try{
    const form=await request.formData();
    const file=form.get('file');
    const title=String(form.get('title')??'').trim();
    if(!(file instanceof File)||file.size===0)return reply(auth,{ok:false,error:'یک عکس انتخاب کنید.'},400);
    const ext=MIME_EXT[file.type];
    if(!ext)return reply(auth,{ok:false,error:'فرمت عکس باید JPG، PNG یا WebP باشد.'},400);
    if(file.size>MAX_BYTES)return reply(auth,{ok:false,error:'حجم عکس باید کمتر از ۸ مگابایت باشد.'},413);

    objectPath=`portfolio/${new Date().toISOString().slice(0,10)}/${randomUUID()}.${ext}`;
    const bytes=Buffer.from(await file.arrayBuffer());
    const uploaded=await auth.supabase.storage.from(BUCKET).upload(objectPath,bytes,{contentType:file.type,cacheControl:'31536000',upsert:false});
    if(uploaded.error){console.error('2nya_admin_gallery_upload_failed',{message:uploaded.error.message});return reply(auth,{ok:false,error:'آپلود عکس انجام نشد.'},400)}

    const {data:last}=await auth.supabase.from('nail_2nya_portfolio_items').select('sort_order').order('sort_order',{ascending:false}).limit(1).maybeSingle();
    const sortOrder=Number(last?.sort_order||0)+10;
    const inserted=await auth.supabase.from('nail_2nya_portfolio_items').insert({
      image_path:`storage:${objectPath}`,
      alt_text:title||'نمونه طراحی ناخن Donya Nail Art',
      featured:false,
      visible:true,
      sort_order:sortOrder,
    }).select('id,image_path,alt_text,featured,visible,sort_order,created_at').single();
    if(inserted.error){
      await auth.supabase.storage.from(BUCKET).remove([objectPath]);
      console.error('2nya_admin_gallery_insert_failed',{code:inserted.error.code});
      return reply(auth,{ok:false,error:'ثبت عکس در گالری انجام نشد.'},400);
    }
    return reply(auth,{ok:true,item:{...inserted.data,src:imageUrl(auth,inserted.data.image_path)}});
  }catch(error){
    if(objectPath)await auth.supabase.storage.from(BUCKET).remove([objectPath]).catch(()=>undefined);
    console.error('2nya_admin_gallery_exception',{message:error instanceof Error?error.message:'unknown'});
    return reply(auth,{ok:false,error:'افزودن عکس انجام نشد.'},400);
  }
}

export async function DELETE(request:NextRequest){
  const auth=await requireNailAdmin(request);if(!auth.ok)return auth.response;
  try{
    const body=await request.json();const id=String(body?.id??'');
    if(!id)return reply(auth,{ok:false,error:'شناسه عکس معتبر نیست.'},400);
    const existing=await auth.supabase.from('nail_2nya_portfolio_items').select('id,image_path').eq('id',id).eq('visible',true).maybeSingle();
    if(existing.error||!existing.data)return reply(auth,{ok:false,error:'عکس پیدا نشد.'},404);
    const hidden=await auth.supabase.from('nail_2nya_portfolio_items').update({visible:false}).eq('id',id);
    if(hidden.error)return reply(auth,{ok:false,error:'حذف عکس انجام نشد.'},400);
    if(existing.data.image_path.startsWith('storage:')){
      const objectPath=existing.data.image_path.slice('storage:'.length);
      const removed=await auth.supabase.storage.from(BUCKET).remove([objectPath]);
      if(removed.error)console.warn('2nya_admin_gallery_storage_cleanup_failed',{message:removed.error.message});
    }
    return reply(auth,{ok:true});
  }catch(error){
    console.error('2nya_admin_gallery_delete_exception',{message:error instanceof Error?error.message:'unknown'});
    return reply(auth,{ok:false,error:'حذف عکس انجام نشد.'},400);
  }
}
