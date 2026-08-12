import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { AgentPortrait } from "@/app/components/agent-portrait";
import DeliberationConsole from "./DeliberationConsole";
import styles from "./boardroom.module.css";

export const dynamic = "force-dynamic";

type Agent = { id:string; agent_code:string; display_name:string|null; name:string; role_title:string; avatar_url:string|null; presence_status:string; purpose:string|null; work_style:string|null; enabled:boolean };
type Meeting = { id:string; project_id:string|null; title:string; purpose:string; status:string; agenda:unknown; created_at:string };
type Session = { id:string; meeting_id:string; project_id:string|null; status:string; decision_question:string; language:string; max_rounds:number; budget_cap_usd:number; recommendation:string|null; decision_options:unknown; synthesis:string|null; error_message:string|null; estimated_cost_usd:number };
type Participant = { agent_id:string; seat_order:number; session_role:string; agents:Agent|Agent[]|null };
type Message = { id:string; turn_index:number; round_no:number; message_type:string; content:string; agent_id:string|null; agents:Pick<Agent,"agent_code"|"display_name"|"name"|"role_title">|Pick<Agent,"agent_code"|"display_name"|"name"|"role_title">[]|null };
type LegalDecisionReview = { outcome:string|null; executive_note:string|null; risk_summary:string|null; conditions:unknown; licensed_counsel_required:boolean };
type Props = { searchParams: Promise<{ meeting?:string; session?:string; project?:string; message?:string; error?:string }> };

const CUSTOM_CEO_OPTION="__custom_ceo_decision__";
const list = (value:unknown) => Array.isArray(value) ? value.map(String) : [];
const joinedAgent = <T,>(value:T|T[]|null):T|null => Array.isArray(value) ? value[0] ?? null : value;

async function ownerContext(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) redirect("/login?error=Owner%20authorization%20required.");
  return {supabase,user,organizationId:membership.organization_id as string};
}

async function prepareSession(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const meetingId=String(formData.get("meetingId")??"");
  const decisionQuestion=String(formData.get("decisionQuestion")??"").trim();
  const language=String(formData.get("language")??"English").trim()||"English";
  const rounds=Math.max(1,Math.min(3,Number(formData.get("rounds")??2)));
  const budget=Math.max(0,Math.min(10,Number(formData.get("budgetCapUsd")??1.5)));
  const requestedAgentIds=formData.getAll("agentIds").map(String).filter(Boolean);
  if(!meetingId||decisionQuestion.length<10||requestedAgentIds.length<2) redirect(`/meetings/room?meeting=${meetingId}&error=Select%20at%20least%20two%20enabled%20agents%20and%20provide%20a%20decision%20question.`);

  const {data:meeting}=await supabase.from("meetings").select("id,project_id,status").eq("id",meetingId).eq("organization_id",organizationId).maybeSingle();
  if(!meeting) redirect("/meetings/room?error=Meeting%20not%20found.");
  if(meeting.status==="completed"||meeting.status==="cancelled") redirect(`/meetings/room?meeting=${meetingId}&error=Completed%20or%20cancelled%20meetings%20cannot%20start%20a%20new%20agent%20session.`);

  const {data:agents}=await supabase.from("agents").select("id,agent_code,enabled").eq("organization_id",organizationId).in("id",requestedAgentIds);
  const selected=agents??[];
  const valid=selected.filter(agent=>agent.agent_code!=="T-001"&&agent.enabled);
  if(selected.length!==requestedAgentIds.length||valid.length!==requestedAgentIds.length) redirect(`/meetings/room?meeting=${meetingId}&error=Paused%20or%20unavailable%20agents%20cannot%20be%20authorized%20for%20a%20meeting.`);
  if(!valid.some(agent=>agent.agent_code==="B-001")) redirect(`/meetings/room?meeting=${meetingId}&error=Enabled%20B-001%20Executive%20Orchestrator%20is%20required%20for%20governed%20meeting%20synthesis.`);

  const {data:session,error}=await supabase.from("meeting_agent_sessions").insert({organization_id:organizationId,meeting_id:meetingId,project_id:meeting.project_id,status:"ready",decision_question:decisionQuestion,language,max_rounds:rounds,budget_cap_usd:budget,external_research_allowed:false}).select("id").single();
  if(error||!session) redirect(`/meetings/room?meeting=${meetingId}&error=Agent%20session%20could%20not%20be%20created.%20Refresh%20and%20retry.`);

  const ordered=valid.sort((a,b)=>requestedAgentIds.indexOf(a.id)-requestedAgentIds.indexOf(b.id));
  const {error:participantError}=await supabase.from("meeting_agent_participants").insert(ordered.map((agent,index)=>({session_id:session.id,organization_id:organizationId,agent_id:agent.id,seat_order:index+1,session_role:agent.agent_code==="B-001"?"synthesizer":"advisor",explicitly_authorized_by_ceo:true})));
  if(participantError){
    console.error("meeting_participant_authorization_failed",{meetingId,sessionId:session.id,participantError});
    await supabase.from("meeting_agent_sessions").delete().eq("id",session.id).eq("organization_id",organizationId).eq("status","ready");
    redirect(`/meetings/room?meeting=${meetingId}&error=Selected%20agents%20could%20not%20be%20authorized.%20Confirm%20they%20are%20enabled%20and%20retry.`);
  }

  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"meeting.agent_session_prepared",object_type:"meeting",object_id:meetingId,risk_level:"medium",payload:{session_id:session.id,agents:ordered.map(a=>a.agent_code),rounds,budget_cap_usd:budget,external_actions:false,external_research:false,enabled_agents_only:true}});
  revalidatePath("/meetings/room");
  redirect(`/meetings/room?meeting=${meetingId}&session=${session.id}&message=Multi-Agent%20session%20prepared.%20Start%20the%20meeting%20when%20ready.`);
}

async function startMeeting(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const meetingId=String(formData.get("meetingId")??"");
  const sessionId=String(formData.get("sessionId")??"");
  const now=new Date().toISOString();
  const {data:meeting}=await supabase.from("meetings").select("id,status,title").eq("id",meetingId).eq("organization_id",organizationId).maybeSingle();
  if(!meeting||!["draft","scheduled"].includes(meeting.status)) redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=This%20meeting%20cannot%20be%20started.`);

  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,status").eq("id",sessionId).eq("meeting_id",meetingId).eq("organization_id",organizationId).maybeSingle();
  if(!session||session.status!=="ready") redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=The%20governed%20agent%20session%20is%20not%20ready%20to%20start.`);
  const {data:participantRows}=await supabase.from("meeting_agent_participants").select("agent_id,agents(agent_code,enabled)").eq("session_id",sessionId).eq("organization_id",organizationId).eq("explicitly_authorized_by_ceo",true);
  const participantAgents=(participantRows??[]).map(row=>joinedAgent(row.agents as {agent_code:string;enabled:boolean}|{agent_code:string;enabled:boolean}[]|null)).filter((agent):agent is {agent_code:string;enabled:boolean}=>Boolean(agent));
  if(participantAgents.length<2||participantAgents.some(agent=>!agent.enabled)||!participantAgents.some(agent=>agent.agent_code==="B-001"&&agent.enabled)) redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=Meeting%20start%20blocked.%20At%20least%20two%20enabled%20agents%20including%20B-001%20are%20required.`);

  const {error}=await supabase.from("meetings").update({status:"running",started_at:now}).eq("id",meetingId).eq("organization_id",organizationId).in("status",["draft","scheduled"]);
  if(error){
    console.error("meeting_start_failed",{meetingId,sessionId,error});
    redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=Meeting%20could%20not%20be%20started.%20Refresh%20and%20retry.`);
  }
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"meeting.started",object_type:"meeting",object_id:meetingId,risk_level:"low",payload:{title:meeting.title,multi_agent_session_id:sessionId,human_chair:true,enabled_agents_verified:true}});
  revalidatePath("/meetings/room");revalidatePath("/meetings");
  redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&message=Meeting%20started.%20Agent%20deliberation%20is%20authorized.`);
}

async function recordCeoDecision(formData:FormData){
  "use server";
  const {supabase,organizationId}=await ownerContext();
  const meetingId=String(formData.get("meetingId")??"");
  const sessionId=String(formData.get("sessionId")??"");
  const selectedOptionKey=String(formData.get("selectedOption")??"").trim();
  const customDecision=String(formData.get("customDecision")??"").trim();
  const rationale=String(formData.get("rationale")??"").trim();
  const riskLevel=String(formData.get("riskLevel")??"medium");
  const isCustomDecision=selectedOptionKey===CUSTOM_CEO_OPTION;
  if(!selectedOptionKey||rationale.length<3||!["low","medium","high","critical"].includes(riskLevel)) redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=Select%20a%20decision%20option%20and%20enter%20CEO%20rationale.`);
  if(isCustomDecision&&(customDecision.length<10||customDecision.length>2000)) redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=${encodeURIComponent("Enter a custom Human CEO decision between 10 and 2000 characters.")}`);

  const {data:meeting}=await supabase.from("meetings").select("id,status,title,project_id").eq("id",meetingId).eq("organization_id",organizationId).maybeSingle();
  if(!meeting||meeting.status!=="completed") redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=${encodeURIComponent("The Human CEO / Chair must explicitly close the meeting before recording the final decision.")}`);
  const {data:session}=await supabase.from("meeting_agent_sessions").select("id,project_id,status,decision_question,decision_options,recommendation,synthesis,legal_triage_status,legal_triage_reason").eq("id",sessionId).eq("meeting_id",meetingId).eq("organization_id",organizationId).maybeSingle();
  if(!session||session.status!=="completed") redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=The%20latest%20agent%20synthesis%20must%20finish%20before%20a%20CEO%20decision%20is%20recorded.`);
  if(session.legal_triage_status==="pending") redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=${encodeURIComponent("B-001 legal relevance triage must finish after chair closure and before the Human CEO decision is recorded.")}`);

  let legalReview:LegalDecisionReview|null=null;
  if(session.legal_triage_status==="recommended"){
    const result=await supabase.from("meeting_legal_reviews").select("outcome,executive_note,risk_summary,conditions,licensed_counsel_required,status").eq("session_id",sessionId).eq("organization_id",organizationId).eq("status","completed").order("created_at",{ascending:false}).limit(1).maybeSingle();
    legalReview=result.data as LegalDecisionReview|null;
    if(!legalReview) redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=${encodeURIComponent("B-001 recommended legal review. Complete the A-106 AI Legal Review before recording the final CEO decision.")}`);
    if(legalReview.licensed_counsel_required||legalReview.outcome==="LICENSED_COUNSEL_REQUIRED") redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=${encodeURIComponent("A-106 requires licensed counsel review before this legally sensitive decision can be finalized for execution.")}`);
    if(legalReview.outcome==="RISK_IDENTIFIED"&&!['high','critical'].includes(riskLevel)) redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=${encodeURIComponent("A-106 identified material legal risk. Record this decision as High or Critical risk so it routes through the Approval Engine.")}`);
  }

  const options=list(session.decision_options);
  if(!isCustomDecision&&!options.includes(selectedOptionKey)) redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=The%20selected%20option%20is%20not%20part%20of%20the%20meeting%20decision%20package.`);
  const selectedOption=isCustomDecision?`Custom Human CEO Decision: ${customDecision}`:selectedOptionKey;
  const recordedOptions=isCustomDecision?[...options,selectedOption]:options;
  const decisionSource=isCustomDecision?"Human CEO — Custom":"Human CEO — selected from B-001 decision package";
  const {data:b001}=await supabase.from("agents").select("id").eq("organization_id",organizationId).eq("agent_code","B-001").maybeSingle();
  const {data:project}=session.project_id?await supabase.from("projects").select("project_code,name").eq("id",session.project_id).eq("organization_id",organizationId).maybeSingle():{data:null};
  const projectPrefix=project?`${project.project_code} — ${project.name}`:"Company-wide";
  const title=meeting.title.toLowerCase().includes(String(project?.project_code??"").toLowerCase())&&project?.project_code?meeting.title:`${projectPrefix}: ${meeting.title}`;
  const legalContext=legalReview?` AI Legal Review: ${legalReview.outcome}. ${legalReview.executive_note??""}`:"";
  const context=`Project: ${projectPrefix}. Meeting: ${meeting.title}. Decision source: ${decisionSource}. Decision produced from governed multi-agent meeting after explicit chair closure. Question: ${session.decision_question}.${legalContext}`;
  const legalMinutes=legalReview?`\n\nAI Legal Review (${legalReview.outcome}): ${legalReview.executive_note??""}\nRisk summary: ${legalReview.risk_summary??""}`:"";

  const {data:decisionId,error}=await supabase.rpc("record_meeting_ceo_decision",{
    target_org_id:organizationId,
    target_meeting_id:meetingId,
    target_session_id:sessionId,
    target_project_id:session.project_id,
    target_title:title,
    target_context:context,
    target_options:recordedOptions,
    target_recommendation:session.recommendation?{text:session.recommendation}:null,
    target_rationale:rationale,
    target_risk_level:riskLevel,
    target_selected_option:selectedOption,
    target_legal_triage_status:session.legal_triage_status,
    target_legal_review_outcome:legalReview?.outcome??null,
    target_synthesis:session.synthesis??"",
    target_legal_minutes:legalMinutes,
    target_proposed_by_agent_id:b001?.id??null,
  });
  if(error||!decisionId){
    console.error("meeting_ceo_decision_record_failed",{meetingId,sessionId,error});
    redirect(`/meetings/room?meeting=${meetingId}&session=${sessionId}&error=Decision%20could%20not%20be%20recorded.%20Refresh%20the%20meeting%20and%20retry.`);
  }

  const {data:decision}=await supabase.from("decisions").select("id,status").eq("id",String(decisionId)).eq("organization_id",organizationId).maybeSingle();
  const decisionStatus=decision?.status??(riskLevel==="high"||riskLevel==="critical"?"review":"approved");
  revalidatePath("/meetings/room");revalidatePath("/meetings");revalidatePath("/decisions");revalidatePath("/approvals");revalidatePath("/command-center");
  redirect(`/decisions?decision=${String(decisionId)}&status=${decisionStatus}&message=${decisionStatus==="review"?"Meeting%20decision%20created%20for%20governed%20approval.":"Meeting%20decision%20recorded%20by%20Human%20CEO."}`);
}

export default async function Boardroom({searchParams}:Props){
  const params=await searchParams;
  const {supabase,organizationId}=await ownerContext();
  const [{data:meetingData},{data:agentData}]=await Promise.all([
    supabase.from("meetings").select("id,project_id,title,purpose,status,agenda,created_at").eq("organization_id",organizationId).in("status",["draft","scheduled","running","completed"]).order("created_at",{ascending:false}).limit(30),
    supabase.from("agents").select("id,agent_code,display_name,name,role_title,avatar_url,presence_status,purpose,work_style,enabled").eq("organization_id",organizationId).neq("agent_code","T-001").order("agent_code"),
  ]);
  const allMeetings=(meetingData??[]) as Meeting[];
  const meetings=params.project?allMeetings.filter(item=>item.project_id===params.project):allMeetings;
  const agents=(agentData??[]) as Agent[];
  const selectedMeetingId=params.meeting??null;
  const meeting=selectedMeetingId?meetings.find(m=>m.id===selectedMeetingId)??((await supabase.from("meetings").select("id,project_id,title,purpose,status,agenda,created_at").eq("organization_id",organizationId).eq("id",selectedMeetingId).maybeSingle()).data as Meeting|null):null;

  let session:Session|null=null;
  if(meeting){
    let sessionQuery=supabase.from("meeting_agent_sessions").select("id,meeting_id,project_id,status,decision_question,language,max_rounds,budget_cap_usd,recommendation,decision_options,synthesis,error_message,estimated_cost_usd").eq("organization_id",organizationId).eq("meeting_id",meeting.id);
    if(params.session) sessionQuery=sessionQuery.eq("id",params.session);
    const result=await sessionQuery.order("created_at",{ascending:false}).limit(1).maybeSingle();
    session=result.data as Session|null;
  }

  let participants:Participant[]=[];let messages:Message[]=[];
  if(session){
    const [participantResult,messageResult]=await Promise.all([
      supabase.from("meeting_agent_participants").select("agent_id,seat_order,session_role,agents(id,agent_code,display_name,name,role_title,avatar_url,presence_status,purpose,work_style,enabled)").eq("organization_id",organizationId).eq("session_id",session.id).order("seat_order"),
      supabase.from("meeting_agent_messages").select("id,turn_index,round_no,message_type,content,agent_id,agents(agent_code,display_name,name,role_title)").eq("organization_id",organizationId).eq("session_id",session.id).order("turn_index"),
    ]);
    participants=(participantResult.data??[]) as unknown as Participant[];
    messages=(messageResult.data??[]) as unknown as Message[];
  }

  const seatedAgents=session?participants.map(p=>joinedAgent(p.agents)).filter((agent):agent is Agent=>Boolean(agent)):agents.slice(0,7);
  const seats=[{x:50,y:12},{x:78,y:22},{x:88,y:49},{x:76,y:73},{x:24,y:73},{x:12,y:49},{x:22,y:22}];
  const transcript=messages.map(message=>{const agent=joinedAgent(message.agents);const human=message.message_type==="ceo_decision"||message.message_type==="ceo_contribution";return {id:message.id,turnIndex:message.turn_index,roundNo:message.round_no,messageType:message.message_type,content:message.content,speakerCode:human?"CEO":agent?.agent_code??"SYSTEM",speakerName:human?"Human CEO":agent?.display_name??agent?.name??"System",speakerRole:human?"Meeting Chair":agent?.role_title??"Meeting Runtime"};});
  const decisionOptions=session?list(session.decision_options):[];

  return <main className="command-shell" style={{maxWidth:"100%",overflowX:"hidden"}}>
    <header className="command-header"><div><p className="eyebrow">RYTHM EXECUTIVE BOARDROOM</p><h1>Live governed multi-agent meetings</h1><p className="subtitle">Human CEO-led deliberation with persistent agent turns, challenge rounds, executive synthesis, explicit chair closure, and governed decision capture.</p></div><Link className="secondary-button" href="/meetings">Meeting Engine</Link></header>
    <section className="organization-banner"><div><span>Meeting chair</span><strong>Human CEO</strong></div><div><span>Agent mode</span><strong>Enabled internal agents only</strong></div><div><span>External actions / research</span><strong>Disabled · separately approval-gated</strong></div></section>
    {params.message?<p className="form-success">{params.message}</p>:null}{params.error?<p className="form-error">{params.error}</p>:null}

    <section className="panel panel-wide" style={{marginTop:18,minWidth:0,maxWidth:"100%",boxSizing:"border-box"}}><div className="panel-heading"><div><p className="label">Boardroom context</p><h2>{meeting?.title??"Select a meeting"}</h2></div>{meeting?<div className="row-meta"><span>{meeting.status}</span>{session?<b className={session.status==="completed"?"state-active":"state-paused"}>{session.status} agent session</b>:null}</div>:null}</div><form method="get" style={{display:"grid",gridTemplateColumns:"minmax(0,1fr) auto",gap:10,minWidth:0}}>{params.project?<input type="hidden" name="project" value={params.project}/>:null}<select name="meeting" defaultValue={meeting?.id??""} style={{minWidth:0,maxWidth:"100%"}}><option value="">Select meeting</option>{meetings.map(item=><option key={item.id} value={item.id}>{item.title} · {item.status}</option>)}</select><button className="secondary-button">Open in boardroom</button></form>{meeting?<><p style={{color:"#596579",lineHeight:1.65,overflowWrap:"anywhere"}}>{meeting.purpose}</p><p className="label">Agenda</p><ol style={{color:"#596579",lineHeight:1.7}}>{list(meeting.agenda).map((item,index)=><li key={`${item}-${index}`}>{item}</li>)}</ol></>:<p className="security-note">Choose the meeting you want to govern. The Boardroom never assumes the latest meeting or a specific project.</p>}</section>

    {meeting&&!session?<section className="panel panel-wide" style={{marginTop:18,minWidth:0,maxWidth:"100%",boxSizing:"border-box"}}><div className="panel-heading"><div><p className="label">CEO authorization</p><h2>Prepare Multi-Agent Session</h2></div></div><form action={prepareSession} className="auth-form"><input type="hidden" name="meetingId" value={meeting.id}/><label>Decision question<textarea name="decisionQuestion" required minLength={10} rows={4} defaultValue="What decision should this meeting resolve, which options should be compared, and what governance conditions should apply?" style={{width:"100%",maxWidth:"100%",minWidth:0,boxSizing:"border-box",resize:"vertical",padding:12,border:"1px solid #cfd6e2",borderRadius:10}}/></label><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(220px,1fr))",gap:10,minWidth:0}}>{agents.map(agent=><label key={agent.id} style={{display:"flex",gap:8,alignItems:"center",border:"1px solid #dfe4ec",borderRadius:10,padding:10,minWidth:0,opacity:agent.enabled?1:.6}}><input type="checkbox" name="agentIds" value={agent.id} disabled={!agent.enabled} defaultChecked={agent.enabled&&["B-001","A-101","A-102","A-104","A-105"].includes(agent.agent_code)}/><span style={{minWidth:0}}><strong>{agent.agent_code} · {agent.display_name??agent.name}</strong><small style={{display:"block",color:"#717b8e"}}>{agent.role_title} · {agent.enabled?"Enabled":"Paused"}</small></span></label>)}</div><div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(180px,1fr))",gap:10,minWidth:0}}><label>Language<input name="language" defaultValue="English"/></label><label>Challenge rounds<select name="rounds" defaultValue="2"><option value="1">1 — positions only</option><option value="2">2 — positions + challenge</option><option value="3">3 — extended deliberation</option></select></label><label>AI budget cap (USD)<input name="budgetCapUsd" type="number" min="0" max="10" step="0.1" defaultValue="1.5"/></label></div><button>Prepare governed agent session</button><p className="security-note">Only enabled agents may be selected. B-001 is required for synthesis. Preparing a session authorizes internal model analysis only; it does not authorize browsing, external actions, deployment, messaging, or transactions.</p></form></section>:null}

    {meeting&&session?<><section className={styles.room}><div className={styles.table}><div><p className={styles.tableLabel}>RYTHM</p><h2>{session.status==="completed"&&meeting.status==="running"?"Awaiting Chair":session.status==="completed"?"Decision Ready":"Executive Round Table"}</h2><p>Agenda · Discussion · Challenge · Synthesis · Chair Close · CEO Decision</p></div></div>{seatedAgents.map((agent,i)=>{const seat=seats[i%seats.length];return <Link key={agent.id} href={`/agents/${agent.agent_code.toLowerCase()}`} className={styles.seat} style={{left:`${seat.x}%`,top:`${seat.y}%`}}><AgentPortrait agentCode={agent.agent_code} avatarUrl={agent.avatar_url} alt={agent.display_name??agent.name} className={styles.avatar}/><div className={styles.nameplate}><strong>{agent.agent_code} · {agent.display_name??agent.name}</strong><span>{agent.role_title} · {agent.enabled?"Enabled":"Paused"}</span></div></Link>})}<div className={styles.ceo}><div className={styles.ceoAvatar}>CEO</div><div className={styles.ceoPlate}><strong>Human CEO</strong><span>Meeting Chair · Final authority</span></div></div></section>

      <section className="panel panel-wide" style={{marginTop:18,minWidth:0,maxWidth:"100%",boxSizing:"border-box"}}><div className="panel-heading"><div><p className="label">Decision mandate</p><h2>{session.decision_question}</h2></div><span className="pill">{session.max_rounds} rounds · ${Number(session.budget_cap_usd).toFixed(2)} cap</span></div>{meeting.status!=="running"&&["draft","scheduled"].includes(meeting.status)?<form action={startMeeting}><input type="hidden" name="meetingId" value={meeting.id}/><input type="hidden" name="sessionId" value={session.id}/><button>Start governed meeting</button></form>:null}<DeliberationConsole sessionId={session.id} meetingStatus={meeting.status} initialStatus={session.status} initialMessages={transcript} initialError={session.error_message}/></section>

      {session.status==="completed"&&meeting.status==="completed"?<section className="panel panel-wide" style={{marginTop:18,minWidth:0,maxWidth:"100%",boxSizing:"border-box"}}><div className="panel-heading"><div><p className="label">Human CEO gate</p><h2>Record the meeting decision</h2></div><span className="pill">Agent recommendation is advisory</span></div><div style={{padding:14,borderRadius:12,background:"#f8f9fb",marginBottom:14,minWidth:0}}><p className="label">B-001 recommendation</p><p style={{color:"#596579",lineHeight:1.65,overflowWrap:"anywhere"}}>{session.recommendation??"Review the synthesis and choose an option."}</p></div><form action={recordCeoDecision} className="auth-form"><input type="hidden" name="meetingId" value={meeting.id}/><input type="hidden" name="sessionId" value={session.id}/><label>CEO selected option<select name="selectedOption" required defaultValue=""><option value="" disabled>Select decision</option>{decisionOptions.map(option=><option key={option} value={option}>{option}</option>)}<option value={CUSTOM_CEO_OPTION}>Other — Custom Human CEO Decision</option></select></label><label>CEO custom decision<textarea name="customDecision" minLength={10} maxLength={2000} rows={3} placeholder="Required only when Other — Custom Human CEO Decision is selected." style={{width:"100%",maxWidth:"100%",minWidth:0,boxSizing:"border-box",resize:"vertical",padding:12,border:"1px solid #cfd6e2",borderRadius:10}}/><small style={{display:"block",marginTop:6,color:"#717b8e",lineHeight:1.5}}>Use this field only when selecting Other. The custom decision is recorded as a Human CEO decision and remains subject to the same legal, risk, approval, audit, and external-action controls.</small></label><label>CEO rationale<textarea name="rationale" required minLength={3} rows={5} style={{width:"100%",maxWidth:"100%",minWidth:0,boxSizing:"border-box",resize:"vertical",padding:12,border:"1px solid #cfd6e2",borderRadius:10}}/></label><label>Decision risk<select name="riskLevel" defaultValue="medium"><option value="low">Low</option><option value="medium">Medium</option><option value="high">High — routes to Approval Engine</option><option value="critical">Critical — routes to Approval Engine</option></select></label><button>Record Human CEO decision</button><p className="security-note">This gate appears only after explicit chair closure. The Human CEO may choose a B-001 option or record a custom decision. The session can create only one canonical CEO decision. Low/medium decisions are finalized here; High/Critical decisions create a governed Approval Request.</p></form></section>:null}
    </>:null}
  </main>;
}