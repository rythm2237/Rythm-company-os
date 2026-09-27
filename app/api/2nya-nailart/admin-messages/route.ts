import { NextRequest,NextResponse } from 'next/server';
import { requireNailAdmin } from '@/lib/2nya-nailart/server';

export const dynamic='force-dynamic';

function fail(error:string,status=400){return NextResponse.json({ok:false,error},{status,headers:{'Cache-Control':'no-store'}})}

export async function GET(request:NextRequest){
  const auth=await requireNailAdmin(request);if(!auth.ok)return auth.response;
  const {data,error}=await auth.supabase.from('nail_2nya_contact_messages')
    .select('id,name,phone,subject,message,status,created_at,read_at,archived_at')
    .neq('status','archived').order('created_at',{ascending:false}).limit(200);
  if(error){console.error('2nya_admin_messages_load_failed',{code:error.code});return fail('پیام‌ها بارگذاری نشد.',503)}
  const messages=data??[],unread=messages.filter((x:any)=>x.status==='unread').length;
  const response=NextResponse.json({ok:true,messages,unread},{headers:{'Cache-Control':'no-store'}});
  auth.response.cookies.getAll().forEach(c=>response.cookies.set(c));return response;
}

export async function POST(request:NextRequest){
  const auth=await requireNailAdmin(request);if(!auth.ok)return auth.response;
  try{
    const body=await request.json(),action=String(body?.action??''),id=String(body?.id??'');
    if(!/^[0-9a-f-]{36}$/i.test(id))return fail('شناسه پیام معتبر نیست.');
    let result:any;
    if(action==='mark_read') result=await auth.supabase.from('nail_2nya_contact_messages').update({status:'read',read_at:new Date().toISOString()}).eq('id',id).select().single();
    else if(action==='mark_unread') result=await auth.supabase.from('nail_2nya_contact_messages').update({status:'unread',read_at:null}).eq('id',id).select().single();
    else if(action==='archive') result=await auth.supabase.from('nail_2nya_contact_messages').update({status:'archived',archived_at:new Date().toISOString()}).eq('id',id).select().single();
    else return fail('عملیات ناشناخته است.');
    if(result.error){console.error('2nya_admin_message_action_failed',{action,code:result.error.code});return fail('تغییر پیام ذخیره نشد.',400)}
    return NextResponse.json({ok:true,data:result.data},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('2nya_admin_message_action_exception',{message:error instanceof Error?error.message:'unknown'});return fail('تغییر پیام ذخیره نشد.')}
}
