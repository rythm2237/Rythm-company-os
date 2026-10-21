import {NextResponse} from 'next/server';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {loadCustomerForm,publicForm,saveCustomerAnswers} from '@/lib/company-core/customer-forms';
export const dynamic='force-dynamic';
export const runtime='nodejs';
const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer','X-Robots-Tag':'noindex, nofollow'};
export async function GET(_req:Request,{params}:{params:Promise<{token:string}>}){
 try{const db=createServerSupabaseClient();if(!db)throw new Error('unavailable');return NextResponse.json({ok:true,form:publicForm(await loadCustomerForm(db,(await params).token))},{headers});}catch{return NextResponse.json({ok:false,error:'Form unavailable or expired.'},{status:404,headers});}
}
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({ok:false,error:'Invalid origin.'},{status:403,headers});
 try{
 const db=createServerSupabaseClient();if(!db)throw new Error('unavailable');
 const raw=await req.text();if(raw.length>100000)return NextResponse.json({ok:false,error:'Request too large.'},{status:413,headers});
 const b=JSON.parse(raw);if(!Number.isInteger(b.revision)||!b.answers||typeof b.answers!=='object'||Array.isArray(b.answers))throw new Error('Invalid answers.');
 const result=await saveCustomerAnswers(db,(await params).token,b.revision,b.answers,b.submit===true);
 return NextResponse.json({ok:true,...result},{headers});
 }catch{return NextResponse.json({ok:false,error:'Could not save. Reload the latest form and try again.'},{status:409,headers});}
}
