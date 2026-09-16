import { NextResponse } from 'next/server';
import { publicClient } from '@/lib/2nya-nailart/server';
export const dynamic='force-dynamic';
export async function GET(){
  try{
    const db=publicClient();
    const [b,s,p]=await Promise.all([
      db.from('nail_2nya_business_profile').select('business_name,instagram_url,phone,address,timezone,currency,language').limit(1).maybeSingle(),
      db.from('nail_2nya_services').select('id,name,description,duration_minutes,buffer_before,buffer_after,price,deposit_amount,preparation_note,sort_order').eq('active',true).eq('booking_available',true).order('sort_order'),
      db.from('nail_2nya_portfolio_items').select('id,image_path,alt_text,featured,sort_order').eq('visible',true).order('sort_order')
    ]);
    if(b.error||s.error||p.error) throw b.error||s.error||p.error;
    return NextResponse.json({ok:true,business:b.data,services:s.data??[],portfolio:p.data??[]},{headers:{'Cache-Control':'public, max-age=60, s-maxage=120'}});
  }catch(error){console.error('2nya_bootstrap_failed',{message:error instanceof Error?error.message:'unknown'});return NextResponse.json({ok:false,error:'The studio information is temporarily unavailable.'},{status:503});}
}
