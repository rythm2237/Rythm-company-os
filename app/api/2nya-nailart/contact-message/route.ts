import { NextRequest,NextResponse } from 'next/server';
import { publicClient } from '@/lib/2nya-nailart/server';

export const dynamic='force-dynamic';

function normalizeIranMobile(value:unknown){
  const latin=String(value??'').trim()
    .replace(/[۰-۹]/g,d=>String('۰۱۲۳۴۵۶۷۸۹'.indexOf(d)))
    .replace(/[٠-٩]/g,d=>String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)));
  if(!latin)return '';
  if(!/^[0-9\s\u00a0]+$/.test(latin))return null;
  const digits=latin.replace(/[\s\u00a0]+/g,'');
  if(/^09\d{9}$/.test(digits))return digits.slice(1);
  if(/^9\d{9}$/.test(digits))return digits;
  return null;
}

export async function POST(request:NextRequest){
  try{
    const body=await request.json();
    if(String(body?.website??'').trim())return NextResponse.json({ok:true},{status:201});
    const name=String(body?.name??'').trim();
    const phone=normalizeIranMobile(body?.phone);
    const subject=String(body?.subject??'').trim();
    const message=String(body?.message??'').trim();
    if(!name||name.length>80||phone===null||!subject||subject.length>120||message.length<2||message.length>2000){
      const error=phone===null?'شماره موبایل باید به شکل 09xx xxx xxxx یا 9xxxxxxxxx باشد.':'لطفاً اطلاعات پیام را بررسی کنید.';
      return NextResponse.json({ok:false,error},{status:400,headers:{'Cache-Control':'no-store'}});
    }
    const db=publicClient();
    const {data,error}=await db.rpc('nail_2nya_create_contact_message',{p_name:name,p_phone:phone||'',p_subject:subject,p_message:message});
    if(error)throw error;
    if(!data?.ok){
      const errorText=data?.code==='invalid_phone'?'شماره موبایل معتبر نیست.':'پیام ثبت نشد. لطفاً دوباره تلاش کنید.';
      return NextResponse.json({ok:false,error:errorText},{status:400,headers:{'Cache-Control':'no-store'}});
    }
    try{
      await fetch('https://dezbacyuvsdrlpmmpjht.supabase.co/functions/v1/two-nya-push',{
        method:'POST',headers:{'Content-Type':'application/json'},
        body:JSON.stringify({message_id:data.message_id,event_type:'contact_message',target:'admin'}),cache:'no-store'
      });
    }catch(error){console.error('2nya_contact_push_failed',{message:error instanceof Error?error.message:'unknown'});}
    return NextResponse.json({ok:true,message_id:data.message_id},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('2nya_contact_message_failed',{message:error instanceof Error?error.message:'unknown'});
    return NextResponse.json({ok:false,error:'ارسال پیام انجام نشد. لطفاً دوباره تلاش کنید.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
