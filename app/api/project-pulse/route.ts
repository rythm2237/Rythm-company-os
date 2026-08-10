import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

export async function GET(request:Request){
  try{
    const projectId=new URL(request.url).searchParams.get("project")?.trim()??"";
    if(!projectId)return NextResponse.json({event:null,nodes:[],project:null},{status:400});

    const supabase=await createAuthServerClient();
    const {data:{user}}=await supabase.auth.getUser();
    if(!user)return NextResponse.json({event:null,nodes:[],project:null},{status:401});

    const {data:membership}=await supabase.from("organization_members")
      .select("organization_id").eq("user_id",user.id).maybeSingle();
    if(!membership)return NextResponse.json({event:null,nodes:[],project:null},{status:403});

    const {data:project}=await supabase.from("projects")
      .select("id,project_code,name")
      .eq("organization_id",membership.organization_id)
      .eq("id",projectId)
      .maybeSingle();
    if(!project)return NextResponse.json({event:null,nodes:[],project:null});

    const {data:event}=await supabase.from("project_progress_events")
      .select("id,project_id,event_type,event_label,previous_progress,new_progress,previous_node,new_node,event_state,next_step,created_at")
      .eq("organization_id",membership.organization_id)
      .eq("project_id",projectId)
      .order("created_at",{ascending:false})
      .limit(1)
      .maybeSingle();

    if(!event)return NextResponse.json({event:null,nodes:[],project:{project_code:project.project_code,name:project.name}});

    const {data:nodes}=await supabase.from("project_progress_nodes")
      .select("stage_code,label,sequence_no,weight_percent,node_type")
      .eq("organization_id",membership.organization_id)
      .eq("project_id",projectId)
      .order("sequence_no");

    return NextResponse.json({event,nodes:nodes??[],project:{project_code:project.project_code,name:project.name}});
  }catch(error){
    console.error("project_pulse_context_failed",error);
    return NextResponse.json({event:null,nodes:[],project:null},{status:500});
  }
}
