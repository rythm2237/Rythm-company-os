import { NextRequest,NextResponse } from 'next/server';
import { sessionClient } from '@/lib/2nya-nailart/server';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
  try{
    const {email,password}=await request.json();
    if(!email||!password)return NextResponse.json({ok:false,error:'Email and password are required.'},{status:400});
    const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
    const supabase=sessionClient(request,response);
    const {data,error}=await supabase.auth.signInWithPassword({email:String(email),password:String(password)});
    if(error||!data.user)return NextResponse.json({ok:false,error:'Email or password is incorrect.'},{status:401});
    const {data:admin}=await supabase.from('nail_2nya_admin_users').select('active').eq('auth_user_id',data.user.id).maybeSingle();
    if(!admin?.active){await supabase.auth.signOut();return NextResponse.json({ok:false,error:'This account is not authorized for 2nya Nail Art admin.'},{status:403});}
    return response;
  }catch{return NextResponse.json({ok:false,error:'Sign in could not be completed.'},{status:400})}
}
