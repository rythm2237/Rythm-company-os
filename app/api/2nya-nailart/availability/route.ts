import { NextRequest,NextResponse } from 'next/server';
import { publicClient } from '@/lib/2nya-nailart/server';
export const dynamic='force-dynamic';
export async function GET(request:NextRequest){
  const date=request.nextUrl.searchParams.get('date');const serviceId=request.nextUrl.searchParams.get('service_id');
  if(!date||!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date)||!serviceId)return NextResponse.json({ok:false,error:'سرویس و تاریخ معتبر را انتخاب کنید.'},{status:400});
  try{
    const db=publicClient();
    const [{data:business,error:be},{data,error}]=await Promise.all([
      db.from('nail_2nya_business_profile').select('timezone').limit(1).maybeSingle(),
      db.rpc('nail_2nya_available_slots',{p_date:date,p_service_id:serviceId})
    ]);
    if(be||error)throw be||error;const tz=business?.timezone||'UTC';
    const fmt=new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:tz});
    return NextResponse.json({ok:true,date,timezone:tz,slots:(data??[]).map((x:{slot_start:string;slot_end:string})=>({start_at:x.slot_start,end_at:x.slot_end,label:fmt.format(new Date(x.slot_start))}))},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('2nya_availability_failed',{message:error instanceof Error?error.message:'unknown'});return NextResponse.json({ok:false,error:'زمان‌های آزاد بارگذاری نشد.'},{status:503});}
}
