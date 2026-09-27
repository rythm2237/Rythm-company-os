import { NextRequest,NextResponse } from 'next/server';
import { publicClient } from '@/lib/2nya-nailart/server';
export const dynamic='force-dynamic';

function dateInZone(timeZone:string){
  const parts=new Intl.DateTimeFormat('en-CA',{timeZone,year:'numeric',month:'2-digit',day:'2-digit'}).formatToParts(new Date());
  const get=(type:string)=>parts.find(p=>p.type===type)?.value||'';
  return `${get('year')}-${get('month')}-${get('day')}`;
}

export async function GET(request:NextRequest){
  const date=request.nextUrl.searchParams.get('date');
  const serviceId=request.nextUrl.searchParams.get('service_id');
  if(!serviceId)return NextResponse.json({ok:false,error:'سرویس معتبر را انتخاب کنید.'},{status:400});
  if(date&&!/^[0-9]{4}-[0-9]{2}-[0-9]{2}$/.test(date))return NextResponse.json({ok:false,error:'تاریخ معتبر را انتخاب کنید.'},{status:400});
  try{
    const db=publicClient();
    const {data:business,error:be}=await db.from('nail_2nya_business_profile').select('timezone').limit(1).maybeSingle();
    if(be)throw be;
    const tz=business?.timezone||'UTC';

    if(!date){
      const days=Math.max(1,Math.min(Number(request.nextUrl.searchParams.get('days')||28),60));
      const from=dateInZone(tz);
      const {data,error}=await db.rpc('nail_2nya_available_dates',{p_service_id:serviceId,p_from:from,p_days:days});
      if(error)throw error;
      return NextResponse.json({ok:true,timezone:tz,dates:(data??[]).map((x:{available_date:string;slots_count:number})=>({date:x.available_date,slots_count:Number(x.slots_count||0)}))},{headers:{'Cache-Control':'no-store'}});
    }

    const {data,error}=await db.rpc('nail_2nya_available_slots',{p_date:date,p_service_id:serviceId});
    if(error)throw error;
    const fmt=new Intl.DateTimeFormat('fa-IR',{hour:'2-digit',minute:'2-digit',hour12:false,timeZone:tz});
    return NextResponse.json({ok:true,date,timezone:tz,slots:(data??[]).map((x:{slot_start:string;slot_end:string})=>({start_at:x.slot_start,end_at:x.slot_end,label:fmt.format(new Date(x.slot_start))}))},{headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('2nya_availability_failed',{message:error instanceof Error?error.message:'unknown'});return NextResponse.json({ok:false,error:'زمان‌های آزاد بارگذاری نشد.'},{status:503});}
}
