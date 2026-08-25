import Link from "next/link";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {createAuthServerClient} from "@/lib/supabase/auth-server";
import MeetingCreateWizard from "./MeetingCreateWizard";

export const dynamic="force-dynamic";

type MeetingStatus="draft"|"scheduled"|"running"|"completed"|"cancelled";
type MeetingRow={id:string;title:string;purpose:string;status:MeetingStatus;scheduled_for:string|null;started_at:string|null;ended_at:string|null;human_join_allowed:boolean;agenda:unknown;minutes:unknown;created_at:string};
type AgentRow={id:string;agent_code:string;display_name:string|null;name:string;role_title:string;enabled:boolean};
type ActionRow={id:string;title:string;status:string;priority:number;due_at:string|null};
type AuditRow={id:number;actor_type:string;event_type:string;risk_level:string;created_at:string};
type Props={searchParams:Promise<{meeting?:string;status?:string;message?:string;error?:string}>};

const statuses=new Set<MeetingStatus>(["draft","scheduled","running","completed","cancelled"]);
const formatDate=(value:string|null)=>value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)):"Not set";
const list=(value:unknown)=>Array.isArray(value)?value.map(item=>typeof item==="string"?item:JSON.stringify(item)):[];
const minutesText=(value:unknown)=>{if(!value)return"";if(typeof value==="string")return value;if(typeof value==="object"&&!Array.isArray(value)){const text=(value as Record<string,unknown>).text;if(typeof text==="string")return text;}return JSON.stringify(value);};

async function ownerContext(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user)redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership)redirect("/login?error=Owner%20authorization%20required.");
  return{supabase,user,organizationId:membership.organization_id as string};
}

async function createMeeting(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const title=String(formData.get("title")??"").trim();
  const purpose=String(formData.get("purpose")??"").trim();
  const decisionQuestion=String(formData.get("decisionQuestion")??"").trim();
  const scheduledValue=String(formData.get("scheduledFor")??"").trim();
  const launchMode=String(formData.get("launchMode")??"now")==="schedule"?"schedule":"now";
  const chairMode=String(formData.get("chairMode")??"live")==="review"?"review":"live";
  const language=String(formData.get("language")??"English").trim()||"English";
  const rounds=Math.max(1,Math.min(3,Number(formData.get("rounds")??2)));
  const budget=Math.max(0.1,Math.min(10,Number(formData.get("budgetCapUsd")??1.5)));
  const requestedAgentIds=formData.getAll("agentIds").map(String).filter(Boolean);
  const agenda=String(formData.get("agenda")??"").split("\n").map(v=>v.trim()).filter(Boolean);
  if(title.length<3||purpose.length<10||decisionQuestion.length<10||agenda.length===0||requestedAgentIds.length<2)redirect(`/meetings?error=${encodeURIComponent("Complete the meeting topic, objective, decision question, agenda and at least two Agent participants.")}`);
  const scheduled=scheduledValue?new Date(scheduledValue):null;
  if(launchMode==="schedule"&&(!scheduled||Number.isNaN(scheduled.getTime())))redirect("/meetings?error=Choose%20a%20valid%20scheduled%20time.");
  const {data:agents}=await supabase.from("agents").select("id,agent_code,enabled").eq("organization_id",organizationId).in("id",requestedAgentIds);
  const selected=agents??[];
  if(selected.length!==requestedAgentIds.length||selected.some(a=>!a.enabled||a.agent_code==="T-001"))redirect(`/meetings?error=${encodeURIComponent("Only enabled Boardroom Agents may be selected.")}`);
  if(!selected.some(a=>a.agent_code==="B-001"))redirect(`/meetings?error=${encodeURIComponent("B-001 Executive Orchestrator is required for governed synthesis.")}`);
  const now=new Date().toISOString();
  const status:MeetingStatus=launchMode==="now"?"running":"scheduled";
  const {data:meeting,error:meetingError}=await supabase.from("meetings").insert({organization_id:organizationId,title,purpose,status,scheduled_for:launchMode==="schedule"?scheduled!.toISOString():null,started_at:launchMode==="now"?now:null,agenda,human_join_allowed:chairMode==="live",created_by_user_id:user.id}).select("id").single();
  if(meetingError||!meeting)redirect(`/meetings?error=${encodeURIComponent(meetingError?.message??"Meeting could not be created.")}`);
  const {data:session,error:sessionError}=await supabase.from("meeting_agent_sessions").insert({organization_id:organizationId,meeting_id:meeting.id,status:"ready",decision_question:decisionQuestion,language,max_rounds:rounds,budget_cap_usd:budget,external_research_allowed:false}).select("id").single();
  if(sessionError||!session){await supabase.from("meetings").delete().eq("id",meeting.id).eq("organization_id",organizationId);redirect(`/meetings?error=${encodeURIComponent("Governed Agent session could not be prepared.")}`);}
  const ordered=[...selected].sort((a,b)=>requestedAgentIds.indexOf(a.id)-requestedAgentIds.indexOf(b.id));
  const {error:participantError}=await supabase.from("meeting_agent_participants").insert(ordered.map((a,index)=>({session_id:session.id,organization_id:organizationId,agent_id:a.id,seat_order:index+1,session_role:a.agent_code==="B-001"?"synthesizer":"advisor",explicitly_authorized_by_ceo:true})));
  if(participantError){await supabase.from("meeting_agent_sessions").delete().eq("id",session.id).eq("organization_id",organizationId);await supabase.from("meetings").delete().eq("id",meeting.id).eq("organization_id",organizationId);redirect(`/meetings?error=${encodeURIComponent("Selected Agents could not be authorized for the Boardroom.")}`);}
  await supabase.from("audit_events").insert([{organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"meeting.created",object_type:"meeting",object_id:meeting.id,risk_level:"low",payload:{title,status,agenda_count:agenda.length,launch_mode:launchMode,chair_mode:chairMode}},{organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"meeting.agent_session_prepared",object_type:"meeting",object_id:meeting.id,risk_level:"medium",payload:{session_id:session.id,agents:ordered.map(a=>a.agent_code),rounds,budget_cap_usd:budget,language,chair_mode:chairMode,external_actions:false,external_research:false,enabled_agents_only:true}}]);
  revalidatePath("/meetings");revalidatePath("/meetings/room");revalidatePath("/command-center");
  if(launchMode==="now")redirect(`/meetings/room?meeting=${meeting.id}&session=${session.id}&message=${encodeURIComponent("Governed Boardroom created. Start Agent deliberation when ready.")}`);
  redirect(`/meetings?meeting=${meeting.id}&status=scheduled&message=${encodeURIComponent("Governed meeting scheduled and Agent session prepared.")}`);
}

async function transitionMeeting(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const meetingId=String(formData.get("meetingId")??"");const transition=String(formData.get("transition")??"");const minutes=String(formData.get("minutes")??"").trim();const actionItems=String(formData.get("actionItems")??"").split("\n").map(v=>v.trim()).filter(Boolean);const rawPriority=Number(formData.get("actionPriority")??3);const actionPriority=Number.isInteger(rawPriority)&&rawPriority>=1&&rawPriority<=5?rawPriority:3;
  const {data:meeting}=await supabase.from("meetings").select("id,title,status").eq("id",meetingId).eq("organization_id",organizationId).maybeSingle();if(!meeting)redirect("/meetings?error=Meeting%20not%20found.");
  const now=new Date().toISOString();let update:Record<string,unknown>;let nextStatus:MeetingStatus;let eventType:string;
  if(transition==="start"&&(meeting.status==="draft"||meeting.status==="scheduled")){nextStatus="running";eventType="meeting.started";update={status:nextStatus,started_at:now};}
  else if(transition==="complete"&&meeting.status==="running"){if(minutes.length<3)redirect(`/meetings?meeting=${meetingId}&error=Meeting%20minutes%20are%20required.`);nextStatus="completed";eventType="meeting.completed";update={status:nextStatus,minutes:{text:minutes},ended_at:now};}
  else if(transition==="cancel"&&meeting.status!=="completed"&&meeting.status!=="cancelled"){nextStatus="cancelled";eventType="meeting.cancelled";update={status:nextStatus,ended_at:now};}
  else redirect(`/meetings?meeting=${meetingId}&error=This%20meeting%20transition%20is%20not%20allowed.`);
  const {data:updated,error}=await supabase.from("meetings").update(update).eq("id",meetingId).eq("organization_id",organizationId).eq("status",meeting.status).select("id").maybeSingle();if(error||!updated)redirect(`/meetings?meeting=${meetingId}&error=${encodeURIComponent(error?.message??"Meeting could not be updated.")}`);
  if(transition==="complete"&&actionItems.length){const {error:actionError}=await supabase.from("action_items").insert(actionItems.map(title=>({organization_id:organizationId,meeting_id:meetingId,title,description:`Created from meeting: ${meeting.title}`,status:"open",priority:actionPriority,assigned_user_id:user.id})));if(actionError)redirect(`/meetings?meeting=${meetingId}&error=${encodeURIComponent(actionError.message)}`);}
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:eventType,object_type:"meeting",object_id:meetingId,risk_level:transition==="complete"?"medium":"low",payload:{title:meeting.title,previous_status:meeting.status,status:nextStatus,action_items_created:transition==="complete"?actionItems.length:0}});
  revalidatePath("/meetings");revalidatePath("/command-center");redirect(`/meetings?meeting=${meetingId}&status=${nextStatus}&message=Meeting%20${nextStatus}.`);
}

export default async function MeetingEnginePage({searchParams}:Props){
  const params=await searchParams;const {supabase,organizationId}=await ownerContext();const selectedStatus=statuses.has(params.status as MeetingStatus)?params.status as MeetingStatus:"scheduled";
  const [{data},{data:agentData}]=await Promise.all([supabase.from("meetings").select("id,title,purpose,status,scheduled_for,started_at,ended_at,human_join_allowed,agenda,minutes,created_at").eq("organization_id",organizationId).eq("status",selectedStatus).order("scheduled_for",{ascending:true,nullsFirst:false}).limit(100),supabase.from("agents").select("id,agent_code,display_name,name,role_title,enabled").eq("organization_id",organizationId).neq("agent_code","T-001").order("agent_code")]);
  const meetings=(data??[]) as MeetingRow[];const agents=(agentData??[]) as AgentRow[];const selectedId=params.meeting??meetings[0]?.id??null;
  const selected=selectedId?(await supabase.from("meetings").select("id,title,purpose,status,scheduled_for,started_at,ended_at,human_join_allowed,agenda,minutes,created_at").eq("organization_id",organizationId).eq("id",selectedId).maybeSingle()).data as MeetingRow|null:null;
  const actions=selected?((await supabase.from("action_items").select("id,title,status,priority,due_at").eq("organization_id",organizationId).eq("meeting_id",selected.id).order("priority")).data??[]) as ActionRow[]:[];
  const audit=selected?((await supabase.from("audit_events").select("id,actor_type,event_type,risk_level,created_at").eq("organization_id",organizationId).eq("object_type","meeting").eq("object_id",selected.id).order("created_at",{ascending:false}).limit(25)).data??[]) as AuditRow[]:[];
  const latestSession=selected?(await supabase.from("meeting_agent_sessions").select("id,status").eq("organization_id",organizationId).eq("meeting_id",selected.id).order("created_at",{ascending:false}).limit(1).maybeSingle()).data:null;
  const canStart=selected?.status==="draft"||selected?.status==="scheduled";const canComplete=selected?.status==="running";const canCancel=Boolean(selected&&selected.status!=="completed"&&selected.status!=="cancelled");
  return <main className="command-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM MEETING ENGINE</p><h1>Boardroom</h1><p className="subtitle">Create a governed decision meeting in one flow, then let the right Agents deliberate under Human CEO authority.</p></div><Link className="secondary-button" href="/command-center">Command Center</Link></header>
    <section className="organization-banner"><div><span>Authority</span><strong>Human CEO / Owner</strong></div><div><span>Governance</span><strong>B-001 synthesis · Human final authority</strong></div><div><span>Execution</span><strong>No external actions by default</strong></div></section>
    {params.message?<p className="form-success">{params.message}</p>:null}{params.error?<p className="form-error">{params.error}</p>:null}

    <section className="panel panel-wide meeting-create-panel" style={{marginTop:18}}><MeetingCreateWizard agents={agents} action={createMeeting}/></section>

    <section className="panel panel-wide" style={{marginTop:18}}>
      <div className="panel-heading"><div><p className="label">Meeting register</p><h2>Existing meetings</h2></div><span className="pill">{meetings.length} matching</span></div>
      <form method="get" className="meetings-status-filter"><select name="status" defaultValue={selectedStatus}><option value="draft">Draft</option><option value="scheduled">Scheduled</option><option value="running">Running</option><option value="completed">Completed</option><option value="cancelled">Cancelled</option></select><button className="secondary-button">Apply filter</button></form>
      <div className="meetings-workspace-grid">
        <div className="data-list">{meetings.length?meetings.map(m=><Link key={m.id} href={`/meetings?status=${selectedStatus}&meeting=${m.id}`} style={{display:"block",padding:"15px 0",borderBottom:"1px solid #e7eaf0",textDecoration:"none"}}><strong>{m.title}</strong><span style={{display:"block",marginTop:6,color:"#717b8e",fontSize:".82rem"}}>{m.status} · {formatDate(m.scheduled_for)}</span></Link>):<p className="empty-state">No meetings match this status.</p>}</div>
        {selected?<article className="meeting-detail-card"><div className="panel-heading"><div><p className="label">Meeting details</p><h2>{selected.title}</h2></div><div className="row-meta"><b className={selected.status==="completed"?"state-active":"state-paused"}>{selected.status}</b></div></div><p style={{color:"#596579",lineHeight:1.65}}>{selected.purpose}</p><div className="compact-list"><div><strong>Scheduled</strong><span>{formatDate(selected.scheduled_for)}</span></div><div><strong>Started</strong><span>{formatDate(selected.started_at)}</span></div><div><strong>Ended</strong><span>{formatDate(selected.ended_at)}</span></div></div><div style={{marginTop:18}}><p className="label">Agenda</p><ol style={{color:"#596579",lineHeight:1.7}}>{list(selected.agenda).map((item,i)=><li key={`${item}-${i}`}>{item}</li>)}</ol></div>{latestSession?<Link className="primary-link" href={`/meetings/room?meeting=${selected.id}&session=${latestSession.id}`}>Open Boardroom</Link>:null}{selected.status==="completed"?<div style={{marginTop:18,padding:16,borderRadius:12,background:"#fff"}}><p className="label">Meeting minutes</p><p style={{color:"#596579",whiteSpace:"pre-wrap"}}>{minutesText(selected.minutes)}</p></div>:null}{(canStart||canComplete||canCancel)?<form action={transitionMeeting} className="auth-form" style={{marginTop:20}}><input type="hidden" name="meetingId" value={selected.id}/>{canComplete?<><label>Meeting minutes<textarea name="minutes" required rows={6}/></label><label>Action items, one per line<textarea name="actionItems" rows={5}/></label><label>Action item priority<select name="actionPriority" defaultValue="3"><option value="1">1 — Highest</option><option value="2">2 — High</option><option value="3">3 — Normal</option><option value="4">4 — Low</option><option value="5">5 — Lowest</option></select></label></>:null}<div className="meeting-action-grid">{canStart?<button name="transition" value="start">Start meeting</button>:null}{canComplete?<button name="transition" value="complete">Complete meeting</button>:null}{canCancel?<button name="transition" value="cancel" className="danger-button">Cancel meeting</button>:null}</div></form>:null}<div style={{marginTop:22}}><p className="label">Action items</p><div className="compact-list">{actions.length?actions.map(a=><div key={a.id}><strong>{a.title}</strong><span>{a.status} · Priority {a.priority} · Due {formatDate(a.due_at)}</span></div>):<p className="empty-state">No action items created from this meeting.</p>}</div></div><div style={{marginTop:22}}><p className="label">Audit trail</p><div className="compact-list">{audit.length?audit.map(e=><div key={e.id}><strong>{e.event_type}</strong><span>{e.actor_type} · {e.risk_level} risk · {formatDate(e.created_at)}</span></div>):<p className="empty-state">No audit events recorded.</p>}</div></div></article>:<p className="empty-state">Select a meeting to inspect.</p>}
      </div>
    </section>
  </main>;
}
