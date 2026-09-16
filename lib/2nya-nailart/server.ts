import { createServerClient } from '@supabase/ssr';
import { createClient } from '@supabase/supabase-js';
import { NextRequest, NextResponse } from 'next/server';
import type { SupabaseCookieToSet } from '@/types/supabase-cookie';

export function env(){
  const url=process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if(!url||!key) throw new Error('Supabase public configuration is missing');
  return {url,key};
}

export function publicClient(){
  const {url,key}=env();
  return createClient(url,key,{auth:{persistSession:false,autoRefreshToken:false,detectSessionInUrl:false}});
}

export function sessionClient(request:NextRequest,response:NextResponse){
  const {url,key}=env();
  return createServerClient(url,key,{cookies:{
    getAll(){return request.cookies.getAll()},
    setAll(cookies:SupabaseCookieToSet[]){cookies.forEach(({name,value,options})=>response.cookies.set(name,value,options))}
  }});
}

export async function requireNailAdmin(request:NextRequest){
  const response=NextResponse.next();
  const supabase=sessionClient(request,response);
  const {data:{user},error}=await supabase.auth.getUser();
  if(error||!user) return {ok:false as const,response:NextResponse.json({ok:false,error:'Authentication required.'},{status:401})};
  const {data:admin}=await supabase.from('nail_2nya_admin_users').select('auth_user_id,display_name,active').eq('auth_user_id',user.id).maybeSingle();
  if(!admin?.active) return {ok:false as const,response:NextResponse.json({ok:false,error:'This account is not authorized for 2nya Nail Art admin.'},{status:403})};
  return {ok:true as const,supabase,user,admin,response};
}

export function jsonError(message='Request could not be completed.',status=400){
  return NextResponse.json({ok:false,error:message},{status,headers:{'Cache-Control':'no-store'}});
}
