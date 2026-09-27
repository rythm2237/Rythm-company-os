import { NextResponse } from 'next/server';
export const dynamic='force-dynamic';

export async function GET(){
  try{
    const r=await fetch('https://dezbacyuvsdrlpmmpjht.supabase.co/functions/v1/two-nya-push',{method:'GET',cache:'no-store'});
    const j=await r.json();
    if(!r.ok||!j?.ok||!j?.public_key)throw new Error('push_key_unavailable');
    return NextResponse.json({ok:true,public_key:String(j.public_key)},{headers:{'Cache-Control':'no-store'}});
  }catch(error){
    console.error('2nya_push_key_failed',{message:error instanceof Error?error.message:'unknown'});
    return NextResponse.json({ok:false,error:'کلید اعلان در دسترس نیست.'},{status:503,headers:{'Cache-Control':'no-store'}});
  }
}
