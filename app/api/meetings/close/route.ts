import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic="force-dynamic";
export const runtime="nodejs";

const fail=(error:string,status:number)=>NextResponse.json({ok:false,error},{status});

export async function POST(request:Request){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) return fail("Authentication required.",401);
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) return fail("Only the Human CEO / Owner may close this meeting.",403);

  let sessionId="";
  try{sessionId=String(((await request.json()) as {sessionId?:string}).sessionId??"").trim();}
  catch{return fail("A JSON body with sessionId is required.",400);}
  if(!sessionId) return fail("sessionId is required.",400);

  const organizationId=membership.organization_id as string;
  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,status,synthesis").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!session) return fail("Meeting session not found.",404);
  if(session.status!=="completed") return fail("Agent deliberation and the latest synthesis must be complete before the chair can close the meeting.",409);
  const {data:meeting}=await supabase.from("meetings").select("id,status,title").eq("id",session.meeting_id).eq("organization_id",organizationId).maybeSingle();
  if(!meeting) return fail("Linked meeting not found.",404);
  if(meeting.status==="completed") return NextResponse.json({ok:true,meetingStatus:"completed",alreadyClosed:true});
  if(meeting.status!=="running") return fail("Only a running meeting can be closed by the chair.",409);

  const now=new Date().toISOString();
  const {error}=await supabase.from("meetings").update({status:"completed",ended_at:now}).eq("id",meeting.id).eq("organization_id",organizationId).eq("status","running");
  if(error) return fail(error.message,500);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"meeting.closed_by_chair",object_type:"meeting",object_id:meeting.id,risk_level:"low",payload:{session_id:sessionId,human_authority:"Human CEO / Owner",chair_confirmation:true,external_actions:false}});
  return NextResponse.json({ok:true,meetingStatus:"completed",closedAt:now,title:meeting.title});
}
