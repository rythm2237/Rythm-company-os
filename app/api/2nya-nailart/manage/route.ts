import { NextRequest, NextResponse } from 'next/server';
import { publicClient } from '@/lib/2nya-nailart/server';

export const dynamic = 'force-dynamic';

async function dispatchStatusPush(appointmentId:string,status:string){
  const eventType=status==='confirmed'?'request_approved':status==='cancelled'?'request_rejected':null;
  if(!eventType)return;
  try{await fetch('https://dezbacyuvsdrlpmmpjht.supabase.co/functions/v1/two-nya-push',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({appointment_id:appointmentId,event_type:eventType,target:'customer'}),cache:'no-store'});}catch(error){console.error('2nya_customer_push_failed',{message:error instanceof Error?error.message:'unknown'});}
}

export async function GET(request: NextRequest) {
  const appointmentId = request.nextUrl.searchParams.get('id');
  const managementCode = request.nextUrl.searchParams.get('token');
  if (!appointmentId || !managementCode) {
    return NextResponse.json({ ok: false, error: 'لینک مدیریت رزرو معتبر نیست.' }, { status: 400 });
  }
  const db = publicClient();
  const [bookingResult,businessResult,pushResult]=await Promise.all([
    db.rpc('nail_2nya_get_booking',{p_appointment_id:appointmentId,p_token:managementCode}),
    db.from('nail_2nya_business_profile').select('timezone').limit(1).maybeSingle(),
    db.from('nail_2nya_site_settings').select('value').eq('key','push_vapid_public').maybeSingle(),
  ]);
  if (bookingResult.error || !bookingResult.data?.length) {
    return NextResponse.json({ ok: false, error: 'این لینک رزرو معتبر نیست یا منقضی شده است.' }, { status: 404 });
  }
  const pushPublicKey=(pushResult.data?.value as {key?:string}|null)?.key??null;
  return NextResponse.json({ ok: true, booking: bookingResult.data[0], timezone: businessResult.data?.timezone || 'UTC', push_public_key:pushPublicKey }, { headers: { 'Cache-Control': 'no-store' } });
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const action=String(body?.action??'');
    if(!body?.id||!body?.token)return NextResponse.json({ok:false,error:'درخواست معتبر نیست.'},{status:400});
    const db=publicClient();
    if(action==='cancel'){
      const result=await db.rpc('nail_2nya_cancel_booking',{p_appointment_id:body.id,p_token:body.token});
      if(result.error||!result.data)return NextResponse.json({ok:false,error:'لغو رزرو انجام نشد.'},{status:400});
      return NextResponse.json({ok:true});
    }
    if(action==='push_subscribe'){
      const sub=body?.subscription;
      if(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth)return NextResponse.json({ok:false,error:'اشتراک اعلان معتبر نیست.'},{status:400});
      const result=await db.rpc('nail_2nya_subscribe_customer_push',{p_appointment_id:body.id,p_token:body.token,p_endpoint:String(sub.endpoint),p_p256dh:String(sub.keys.p256dh),p_auth:String(sub.keys.auth)});
      if(result.error||result.data!==true)return NextResponse.json({ok:false,error:'فعال‌سازی اعلان انجام نشد.'},{status:400});
      const booking=await db.rpc('nail_2nya_get_booking',{p_appointment_id:body.id,p_token:body.token});
      const status=booking.data?.[0]?.status;
      if(status)await dispatchStatusPush(String(body.id),String(status));
      return NextResponse.json({ok:true});
    }
    return NextResponse.json({ok:false,error:'درخواست معتبر نیست.'},{status:400});
  } catch {
    return NextResponse.json({ ok: false, error: 'درخواست معتبر نیست.' }, { status: 400 });
  }
}
