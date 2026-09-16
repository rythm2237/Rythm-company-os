import { NextRequest,NextResponse } from 'next/server';
import { sessionClient } from '@/lib/2nya-nailart/server';
export const dynamic='force-dynamic';
export async function POST(request:NextRequest){
  try{
    const {email,password,bootstrap_code}=await request.json();
    if(!email||!password)return NextResponse.json({ok:false,error:'ایمیل و رمز عبور الزامی است.'},{status:400});
    const response=NextResponse.json({ok:true},{headers:{'Cache-Control':'no-store'}});
    const supabase=sessionClient(request,response);
    const {data,error}=await supabase.auth.signInWithPassword({email:String(email),password:String(password)});
    if(error||!data.user)return NextResponse.json({ok:false,error:'ایمیل یا رمز عبور صحیح نیست.'},{status:401});
    let {data:admin}=await supabase.from('nail_2nya_admin_users').select('active').eq('auth_user_id',data.user.id).maybeSingle();
    if(!admin?.active&&bootstrap_code){
      const {data:claim,error:claimError}=await supabase.rpc('nail_2nya_claim_admin',{p_code:String(bootstrap_code)});
      if(claimError||!claim?.ok){await supabase.auth.signOut();return NextResponse.json({ok:false,error:'کد راه‌اندازی معتبر نیست یا مدیریت قبلاً فعال شده است.'},{status:403});}
      const check=await supabase.from('nail_2nya_admin_users').select('active').eq('auth_user_id',data.user.id).maybeSingle();admin=check.data;
    }
    if(!admin?.active){await supabase.auth.signOut();return NextResponse.json({ok:false,error:'این حساب برای مدیریت 2nya Nail Art مجاز نیست. اگر اولین ورود است، کد راه‌اندازی را وارد کنید.'},{status:403});}
    return response;
  }catch{return NextResponse.json({ok:false,error:'ورود انجام نشد.'},{status:400})}
}
