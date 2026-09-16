import { NextRequest,NextResponse } from 'next/server';
import { requireNailAdmin } from '@/lib/2nya-nailart/server';
export const dynamic='force-dynamic';

function fail(error:string,status=400){return NextResponse.json({ok:false,error},{status,headers:{'Cache-Control':'no-store'}})}

export async function GET(request:NextRequest){
  const auth=await requireNailAdmin(request);if(!auth.ok)return auth.response;
  const {supabase,admin}=auth;
  const now=new Date(),until=new Date(Date.now()+1000*60*60*24*90);
  const [business,services,hours,exceptions,special,blocks,appointments,pushSettings]=await Promise.all([
    supabase.from('nail_2nya_business_profile').select('*').limit(1).maybeSingle(),
    supabase.from('nail_2nya_services').select('*').order('sort_order'),
    supabase.from('nail_2nya_business_hours').select('*').order('weekday').order('start_time'),
    supabase.from('nail_2nya_availability_exceptions').select('*').gte('exception_date',now.toISOString().slice(0,10)).order('exception_date').limit(120),
    supabase.from('nail_2nya_special_availability').select('*').gte('availability_date',now.toISOString().slice(0,10)).order('availability_date').limit(120),
    supabase.from('nail_2nya_blocked_periods').select('*').gte('end_at',new Date(Date.now()-86400000).toISOString()).lte('start_at',until.toISOString()).order('start_at').limit(200),
    supabase.from('nail_2nya_appointments').select('id,booking_reference,start_at,end_at,reserved_start_at,reserved_end_at,status,source,customer_notes,admin_notes,service_id,nail_2nya_services(name,duration_minutes,buffer_before,buffer_after),customer_id,nail_2nya_customers(name,phone,instagram_username,email)').gte('start_at',new Date(Date.now()-7*86400000).toISOString()).lte('start_at',until.toISOString()).order('start_at').limit(500),
    supabase.from('nail_2nya_site_settings').select('key,value').in('key',['push_vapid_public'])
  ]);
  const failed=[business,services,hours,exceptions,special,blocks,appointments,pushSettings].find(x=>x.error);
  if(failed?.error){console.error('2nya_admin_load_failed',{code:failed.error.code});return fail('اطلاعات پنل مدیریت بارگذاری نشد.',503)}
  const pushPublicKey=(pushSettings.data??[]).find((x:any)=>x.key==='push_vapid_public')?.value?.key??null;
  const response=NextResponse.json({ok:true,admin,business:business.data,services:services.data??[],hours:hours.data??[],exceptions:exceptions.data??[],special:special.data??[],blocks:blocks.data??[],appointments:appointments.data??[],push_public_key:pushPublicKey},{headers:{'Cache-Control':'no-store'}});
  auth.response.cookies.getAll().forEach(c=>response.cookies.set(c));return response;
}

export async function POST(request:NextRequest){
  const auth=await requireNailAdmin(request);if(!auth.ok)return auth.response;const db=auth.supabase;
  try{
    const body=await request.json(),action=String(body?.action??'');let result:any=null;
    if(action==='save_service'){
      const row={name:String(body.name??'').trim(),description:String(body.description??'').trim()||null,duration_minutes:Number(body.duration_minutes),buffer_before:Number(body.buffer_before||0),buffer_after:Number(body.buffer_after||0),price:body.price===''||body.price==null?null:Number(body.price),deposit_amount:body.deposit_amount===''||body.deposit_amount==null?null:Number(body.deposit_amount),active:Boolean(body.active),booking_available:Boolean(body.booking_available),preparation_note:String(body.preparation_note??'').trim()||null,sort_order:Number(body.sort_order||0)};
      if(!row.name||!Number.isFinite(row.duration_minutes)||row.duration_minutes<5)return fail('نام و مدت سرویس الزامی است.');
      result=body.id?await db.from('nail_2nya_services').update(row).eq('id',body.id).select().single():await db.from('nail_2nya_services').insert(row).select().single();
    }else if(action==='delete_service') result=await db.from('nail_2nya_services').delete().eq('id',body.id);
    else if(action==='save_business') result=await db.from('nail_2nya_business_profile').update({phone:body.phone||null,address:body.address||null,timezone:body.timezone||'UTC',currency:body.currency||null,language:'fa',slot_interval_minutes:Number(body.slot_interval_minutes||15),min_booking_notice_minutes:Number(body.min_booking_notice_minutes||0),max_advance_days:Number(body.max_advance_days||180)}).eq('id',body.id).select().single();
    else if(action==='add_hours') result=await db.from('nail_2nya_business_hours').insert({weekday:Number(body.weekday),start_time:body.start_time,end_time:body.end_time,active:true}).select().single();
    else if(action==='delete_hours') result=await db.from('nail_2nya_business_hours').delete().eq('id',body.id);
    else if(action==='close_day') result=await db.from('nail_2nya_availability_exceptions').upsert({exception_date:body.date,is_closed:true,note:body.note||null},{onConflict:'exception_date'}).select().single();
    else if(action==='reopen_day') result=await db.from('nail_2nya_availability_exceptions').delete().eq('exception_date',body.date);
    else if(action==='add_special') result=await db.from('nail_2nya_special_availability').insert({availability_date:body.date,start_time:body.start_time,end_time:body.end_time,note:body.note||null}).select().single();
    else if(action==='delete_special') result=await db.from('nail_2nya_special_availability').delete().eq('id',body.id);
    else if(action==='add_block') result=await db.from('nail_2nya_blocked_periods').insert({start_at:body.start_at,end_at:body.end_at,reason:body.reason||null,created_by:auth.user.id}).select().single();
    else if(action==='delete_block') result=await db.from('nail_2nya_blocked_periods').delete().eq('id',body.id);
    else if(action==='appointment_status') result=await db.from('nail_2nya_appointments').update({status:body.status}).eq('id',body.id).select().single();
    else if(action==='manual_booking'){
      result=await db.rpc('nail_2nya_admin_create_appointment',{p_service_id:body.service_id,p_start_at:body.start_at,p_name:String(body.name??'').trim(),p_phone:String(body.phone??'').trim(),p_instagram:body.instagram||null,p_email:body.email||null,p_customer_notes:body.customer_notes||null,p_admin_notes:body.admin_notes||null});
      if(!result.error&&result.data?.ok===false){const conflict=result.data.code==='appointment_conflict';return fail(conflict?'این زمان با یک رزرو دیگر تداخل دارد.':'رزرو دستی ساخته نشد.',conflict?409:400)}
    }else if(action==='push_subscribe'){
      const sub=body?.subscription;if(!sub?.endpoint||!sub?.keys?.p256dh||!sub?.keys?.auth)return fail('اشتراک اعلان معتبر نیست.');
      result=await db.from('nail_2nya_push_subscriptions').upsert({auth_user_id:auth.user.id,endpoint:String(sub.endpoint),p256dh:String(sub.keys.p256dh),auth:String(sub.keys.auth),active:true,updated_at:new Date().toISOString()},{onConflict:'endpoint'}).select().single();
    }else if(action==='push_unsubscribe'){
      result=await db.from('nail_2nya_push_subscriptions').update({active:false,updated_at:new Date().toISOString()}).eq('auth_user_id',auth.user.id).eq('endpoint',String(body.endpoint||''));
    }else if(action==='appointment_move'){
      const {data:service,error:se}=await db.from('nail_2nya_services').select('id,duration_minutes,buffer_before,buffer_after').eq('id',body.service_id).single();if(se||!service)return fail('سرویس پیدا نشد.');
      const start=new Date(String(body.start_at||''));if(Number.isNaN(start.getTime()))return fail('زمان رزرو معتبر نیست.');
      const end=new Date(start.getTime()+Number(service.duration_minutes)*60000),rs=new Date(start.getTime()-Number(service.buffer_before||0)*60000),re=new Date(end.getTime()+Number(service.buffer_after||0)*60000);
      result=await db.from('nail_2nya_appointments').update({service_id:service.id,start_at:start.toISOString(),end_at:end.toISOString(),reserved_start_at:rs.toISOString(),reserved_end_at:re.toISOString(),admin_notes:body.admin_notes??null}).eq('id',body.id).select().single();
    }else return fail('عملیات ناشناخته است.');
    if(result?.error){console.error('2nya_admin_action_failed',{action,code:result.error.code});const conflict=result.error.code==='23P01';return fail(conflict?'این زمان با یک رزرو دیگر تداخل دارد.':'تغییر ذخیره نشد.',conflict?409:400)}
    return NextResponse.json({ok:true,data:result?.data??null},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('2nya_admin_action_exception',{message:error instanceof Error?error.message:'unknown'});return fail('تغییر ذخیره نشد.')}
}
