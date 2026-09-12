import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dispatchProjectWork } from "@/lib/projects/project-operating-system";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET?.trim();
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({ok:false,error:"Unauthorized scheduler request."},{status:401});
  const service=createServerSupabaseClient();
  if(!service)return NextResponse.json({ok:false,error:"Project dispatcher is unavailable."},{status:503});
  try{
    const results=await dispatchProjectWork(service);
    return NextResponse.json({ok:true,processed:results.length,results});
  }catch(error){
    console.error("project_dispatch_failed",error);
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Project dispatcher failed."},{status:500});
  }
}
