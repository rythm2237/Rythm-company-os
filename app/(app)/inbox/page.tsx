import Link from "next/link";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type Risk = "low" | "medium" | "high" | "critical";
type AttentionItem = {
  key: string;
  kind: string;
  title: string;
  detail: string;
  priority: 0 | 1 | 2 | 3;
  risk: Risk;
  href: string;
  createdAt: string;
  category: string;
};

type DecisionRow = { id:string; decision_key:string; title:string; status:string; risk_level:Risk; project_id:string|null; created_at:string };
type ApprovalRow = { id:string; title:string; status:string; risk_level:Risk; project_id:string|null; expires_at:string|null; created_at:string };
type ActionRow = { id:string; action_code:string|null; title:string; status:string; priority:number; risk_level:Risk|null; project_id:string|null; due_at:string|null; created_at:string };
type IntakeRow = { id:string; intake_key:string; item_type:string; title:string; status:string; priority:number; risk_level:Risk; project_id:string|null; created_at:string };
type SessionRow = { id:string; meeting_id:string; project_id:string|null; decision_question:string; status:string; legal_triage_status:string|null; created_at:string };
type LegalReviewRow = { id:string; session_id:string; status:string; outcome:string|null; licensed_counsel_required:boolean; created_at:string };

const riskRank: Record<Risk, number> = { low: 0, medium: 1, high: 2, critical: 3 };
const fmt = (value:string|null) => value ? new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value)) : "Not set";

async function ownerContext(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) redirect("/login?error=Owner%20authorization%20required.");
  return {supabase,organizationId:membership.organization_id as string};
}

function approvalPriority(risk:Risk):0|1|2|3 {
  if(risk==="critical") return 0;
  if(risk==="high") return 1;
  return 2;
}

function actionPriority(action:ActionRow):0|1|2|3 {
  if(action.status==="blocked" && action.risk_level==="critical") return 0;
  if(action.status==="blocked" || action.priority===1 || action.risk_level==="high") return 1;
  if(action.priority<=3) return 2;
  return 3;
}

export default async function InboxPage({ searchParams }: { searchParams: Promise<{ category?: string }> }){
  const {supabase,organizationId}=await ownerContext();

  const [decisionResult,approvalResult,blockedResult,intakeResult,sessionResult,legalResult,questionsResult,integrationsResult,communicationResult]=await Promise.all([
    supabase.from("decisions").select("id,decision_key,title,status,risk_level,project_id,created_at").eq("organization_id",organizationId).in("status",["draft","review"]).order("created_at",{ascending:false}).limit(50),
    supabase.from("approval_requests").select("id,title,status,risk_level,project_id,expires_at,created_at").eq("organization_id",organizationId).eq("status","pending").order("created_at",{ascending:false}).limit(50),
    supabase.from("action_items").select("id,action_code,title,status,priority,risk_level,project_id,due_at,created_at").eq("organization_id",organizationId).eq("status","blocked").order("priority").limit(50),
    supabase.from("intake_items").select("id,intake_key,item_type,title,status,priority,risk_level,project_id,created_at").eq("organization_id",organizationId).in("status",["inbox","to_review","research_required","under_evaluation"]).order("priority").order("created_at",{ascending:false}).limit(50),
    supabase.from("meeting_agent_sessions").select("id,meeting_id,project_id,decision_question,status,legal_triage_status,created_at").eq("organization_id",organizationId).in("legal_triage_status",["pending","recommended"]).order("created_at",{ascending:false}).limit(50),
    supabase.from("meeting_legal_reviews").select("id,session_id,status,outcome,licensed_counsel_required,created_at").eq("organization_id",organizationId).neq("status","completed").order("created_at",{ascending:false}).limit(50),
    supabase.from("project_clarification_requests").select("id,project_id,question,reason,created_at").eq("organization_id",organizationId).eq("status","open").order("created_at",{ascending:false}).limit(50),
    supabase.from("organization_integrations").select("id,display_name,status,updated_at").eq("organization_id",organizationId).in("status",["expired","error","reauthorization_required"]).limit(50),
    supabase.from("communication_threads").select("id,subject,manager_attention_reason,priority,updated_at").eq("organization_id",organizationId).eq("requires_manager_attention",true).in("status",["open","approval_required"]).order("updated_at",{ascending:false}).limit(30),
  ]);

  const decisions=(decisionResult.data??[]) as DecisionRow[];
  const approvals=(approvalResult.data??[]) as ApprovalRow[];
  const blocked=(blockedResult.data??[]) as ActionRow[];
  const intake=(intakeResult.data??[]) as IntakeRow[];
  const sessions=(sessionResult.data??[]) as SessionRow[];
  const legalReviews=(legalResult.data??[]) as LegalReviewRow[];
  const legalReviewBySession=new Set(legalReviews.map(r=>r.session_id));

  const items:AttentionItem[]=[];
  for(const d of decisions) items.push({key:`decision-${d.id}`,kind:"CEO Decision",title:`${d.decision_key} · ${d.title}`,detail:`${d.status} · ${d.risk_level} risk`,priority:d.risk_level==="critical"?0:d.risk_level==="high"?1:2,risk:d.risk_level,href:`/decisions?decision=${d.id}&status=${d.status}`,createdAt:d.created_at,category:"decisions"});
  for(const a of approvals) items.push({key:`approval-${a.id}`,kind:"Approval",title:a.title,detail:`${a.risk_level} risk · expires ${fmt(a.expires_at)}`,priority:approvalPriority(a.risk_level),risk:a.risk_level,href:a.project_id?`/projects/operating?project=${a.project_id}&view=decisions`:`/approvals?approval=${a.id}&status=pending`,createdAt:a.created_at,category:"approvals"});
  for(const a of blocked) items.push({key:`blocked-${a.id}`,kind:"Blocked Action",title:`${a.action_code?`${a.action_code} · `:""}${a.title}`,detail:`P${a.priority} · ${a.risk_level??"unclassified"} risk`,priority:actionPriority(a),risk:a.risk_level??"medium",href:`/actions?action=${a.id}&status=blocked`,createdAt:a.created_at,category:"blocked"});
  for(const i of intake) items.push({key:`intake-${i.id}`,kind:i.item_type==="issue"?"Issue Intake":"Idea Intake",title:`${i.intake_key} · ${i.title}`,detail:`${i.status} · P${i.priority} · ${i.risk_level} risk`,priority:i.risk_level==="critical"?1:3,risk:i.risk_level,href:`/ideas?item=${i.id}`,createdAt:i.created_at,category:"decisions"});
  for(const s of sessions){
    if(s.legal_triage_status==="pending") items.push({key:`legal-triage-${s.id}`,kind:"Legal Triage",title:s.decision_question,detail:"B-001 legal relevance triage pending",priority:1,risk:"high",href:`/meetings/room?meeting=${s.meeting_id}&session=${s.id}`,createdAt:s.created_at,category:"decisions"});
    if(s.legal_triage_status==="recommended" && !legalReviewBySession.has(s.id)) items.push({key:`legal-review-${s.id}`,kind:"AI Legal Review",title:s.decision_question,detail:"A-106 review required before CEO decision",priority:1,risk:"high",href:`/meetings/room?meeting=${s.meeting_id}&session=${s.id}`,createdAt:s.created_at,category:"decisions"});
  }
  for(const r of legalReviews) items.push({key:`legal-record-${r.id}`,kind:"AI Legal Review",title:r.outcome??"Legal review in progress",detail:r.licensed_counsel_required?"Licensed counsel required":"Review not completed",priority:r.licensed_counsel_required?0:1,risk:r.licensed_counsel_required?"critical":"high",href:"/meetings/room",createdAt:r.created_at,category:"decisions"});

  for (const question of questionsResult.data ?? []) items.push({ key:`question-${question.id}`,kind:"Agent Question",title:question.question,detail:question.reason??"A required answer is missing",priority:2,risk:"medium",href:`/projects/operating?project=${question.project_id}`,createdAt:question.created_at,category:"questions" });
  for (const integration of integrationsResult.data ?? []) items.push({ key:`integration-${integration.id}`,kind:"Integration Issue",title:integration.display_name,detail:`Connection ${integration.status}`,priority:2,risk:"medium",href:"/settings/integrations",createdAt:integration.updated_at,category:"integrations" });

  for (const thread of communicationResult.data ?? []) items.push({ key:`communication-${thread.id}`,kind:"Important Communication",title:thread.subject,detail:thread.manager_attention_reason??"Communication needs manager attention",priority:thread.priority==="urgent"?1:2,risk:"medium",href:`/communication?thread=${thread.id}`,createdAt:thread.updated_at,category:"communication" });

  const deduped=[...new Map(items.map(i=>[i.key,i])).values()].sort((a,b)=>a.priority-b.priority || riskRank[b.risk]-riskRank[a.risk] || new Date(a.createdAt).getTime()-new Date(b.createdAt).getTime());
  const selected=(await searchParams).category??"all";
  const categories=["all","approvals","decisions","questions","blocked","integrations","communication"];
  const visible=selected==="all"?deduped:deduped.filter(item=>item.category===selected);
  return <main className="command-shell">
    <header className="command-header">
      <div><p className="eyebrow">YOUR WORKSPACE</p><h1>Inbox</h1><p className="subtitle">Decisions, approvals, questions and blockers that need your attention.</p></div>
    </header>

    <nav className="simple-inbox-filters" aria-label="Inbox filters">{categories.map(category=><Link key={category} href={`/inbox?category=${category}`} aria-current={selected===category?"page":undefined}>{category[0].toUpperCase()+category.slice(1)}</Link>)}</nav>
    <section style={{marginTop:18}}>
      <article className="panel panel-wide">
        <div className="panel-heading"><div><p className="label">Your queue</p><h2>Needs action</h2></div><span className="pill">{visible.length}</span></div>
        <div className="data-list">
          {visible.length?visible.map(item=><Link key={item.key} href={item.href} className="data-row" style={{textDecoration:"none"}}><div><strong>{item.kind} · {item.title}</strong><span>{item.detail} · {fmt(item.createdAt)}</span></div><div className="row-meta"><span className="pill">{item.risk} risk</span></div></Link>):<p className="empty-state">Nothing needs your attention.</p>}
        </div>
      </article>

    </section>
  </main>;
}
