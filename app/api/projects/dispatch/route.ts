import { NextResponse } from "next/server";
import { createServerSupabaseClient } from "@/lib/supabase/server";
import { dispatchProjectWork } from "@/lib/projects/project-operating-system";
import { dispatchAutonomousProjectMeetings } from "@/lib/projects/project-autonomous-meetings";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

export async function GET(request:Request){
  const secret=process.env.CRON_SECRET?.trim();
  if(!secret||request.headers.get("authorization")!==`Bearer ${secret}`)return NextResponse.json({ok:false,error:"Unauthorized scheduler request."},{status:401});
  const service=createServerSupabaseClient();
  if(!service)return NextResponse.json({ok:false,error:"Project dispatcher is unavailable."},{status:503});
  try{
    const health=await service.rpc("refresh_project_execution_health_v1");
    if(health.error)console.error("project_health_refresh_failed",health.error.message);
    const [taskResults,meetingResults]=await Promise.all([
      dispatchProjectWork(service),
      dispatchAutonomousProjectMeetings(service),
    ]);
    return NextResponse.json({ok:true,processed:taskResults.length+meetingResults.length,healthEvents:Number(health.data??0),tasks:taskResults,meetings:meetingResults});
  }catch(error){
    console.error("project_dispatch_failed",error);
    return NextResponse.json({ok:false,error:error instanceof Error?error.message:"Project dispatcher failed."},{status:500});
  }
}