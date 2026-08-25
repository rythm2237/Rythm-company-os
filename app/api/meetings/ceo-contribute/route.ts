import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";

export const dynamic = "force-dynamic";
export const runtime = "nodejs";

const fail = (error:string,status:number) => NextResponse.json({ok:false,error},{status});

export async function POST(request:Request){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok) return fail(auth.error,auth.status);
  const {supabase,user,organizationId}=auth;

  let sessionId="";let content="";
  try{
    const body=await request.json() as {sessionId?:string;content?:string};
    sessionId=String(body.sessionId??"").trim();
    content=String(body.content??"").trim();
  }catch{return fail("A JSON body is required.",400);}
  if(!sessionId) return fail("sessionId is required.",400);
  if(content.length<2) return fail("Enter a CEO contribution before sending.",400);
  if(content.length>4000) return fail("CEO contribution must be 4000 characters or fewer.",400);

  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,status").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session||!["ready","running","completed"].includes(session.status)) return fail("CEO contributions are allowed while the governed meeting remains open.",409);
  const {data:meeting}=await supabase.from("meetings").select("id,status").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();
  if(!meeting||meeting.status!=="running") return fail("This meeting has already been closed by the chair.",409);

  const {data:last}=await supabase.from("meeting_agent_messages").select("turn_index,round_no").eq("session_id",sessionId).eq("organization_id",organizationId).order("turn_index",{ascending:false}).limit(1).maybeSingle();
  const turnIndex=Number(last?.turn_index??0)+1;
  const roundNo=Math.max(1,Number(last?.round_no??1));
  const {error}=await supabase.from("meeting_agent_messages").insert({
    organization_id:organizationId,
    meeting_id:meeting.id,
    session_id:sessionId,
    agent_id:null,
    turn_index:turnIndex,
    round_no:roundNo,
    speaker_type:"human_ceo",
    message_type:"ceo_contribution",
    content,
  });
  if(error) return fail(error.message,500);

  if(session.status==="completed"){
    const now=new Date().toISOString();
    await supabase.from("meeting_agent_sessions").update({status:"running",legal_triage_status:"pending",legal_triage_reason:null,legal_triaged_at:null,completed_at:null,updated_at:now}).eq("id",sessionId).eq("organization_id",organizationId);
  }

  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"meeting.ceo_contribution_added",object_type:"meeting",object_id:meeting.id,risk_level:"low",payload:{session_id:sessionId,turn_index:turnIndex,chair_follow_up:true,external_actions:false}});
  return NextResponse.json({ok:true,turnIndex,roundNo,content,sessionStatus:session.status==="completed"?"running":session.status,speaker:{code:"CEO",name:"Human CEO",role:"Meeting Chair"}});
}
