import { NextRequest,NextResponse } from 'next/server';
import { publicClient } from '@/lib/2nya-nailart/server';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
  try{
    const body=await request.json();
    const name=String(body?.name??'').trim(),phone=String(body?.phone??'').trim(),serviceId=String(body?.service_id??''),startAt=String(body?.start_at??'');
    if(!name||name.length>120||!phone||phone.length>50||!serviceId||!startAt||Number.isNaN(Date.parse(startAt)))return NextResponse.json({ok:false,code:'invalid_input',error:'Check the booking details and try again.'},{status:400});
    const db=publicClient();
    const {data,error}=await db.rpc('nail_2nya_create_booking',{p_service_id:serviceId,p_start_at:startAt,p_name:name,p_phone:phone,p_instagram:String(body?.instagram??'').slice(0,120)||null,p_email:String(body?.email??'').slice(0,254)||null,p_notes:String(body?.notes??'').slice(0,1500)||null});
    if(error)throw error;
    if(!data?.ok){const code=data?.code||'booking_failed';const status=code==='slot_taken'?409:400;return NextResponse.json({ok:false,code,error:code==='slot_taken'?'This appointment was just booked by another client.':'The appointment could not be created.'},{status});}
    const managementUrl=`/booking/${encodeURIComponent(data.appointment_id)}?token=${encodeURIComponent(data.management_token)}`;
    return NextResponse.json({...data,management_url:managementUrl},{status:201,headers:{'Cache-Control':'no-store'}});
  }catch(error){console.error('2nya_booking_failed',{message:error instanceof Error?error.message:'unknown'});return NextResponse.json({ok:false,error:'We could not complete the booking. Please try again.'},{status:503});}
}
