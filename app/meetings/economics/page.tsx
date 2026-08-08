import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";

export const dynamic = "force-dynamic";

type EconomicsSession = {
  id:string;
  meeting_id:string;
  project_id:string|null;
  status:string;
  language:string;
  model:string|null;
  estimated_cost_usd:number;
  budget_cap_usd:number;
  accounting_usd_to_eur:number;
  ai_budget_eur:number;
  customer_price_eur:number;
  pricing_basis:string;
  total_input_tokens:number;
  total_output_tokens:number;
  created_at:string;
  meetings:{title:string}|{title:string}[]|null;
};

type Props={searchParams:Promise<{session?:string;message?:string;error?:string}>};

const joined=<T,>(value:T|T[]|null):T|null=>Array.isArray(value)?value[0]??null:value;
const money=(value:number,currency:"EUR"|"USD")=>new Intl.NumberFormat("en-IE",{style:"currency",currency,minimumFractionDigits:2,maximumFractionDigits:currency==="EUR"?2:4}).format(Number.isFinite(value)?value:0);
const pct=(value:number)=>`${Number.isFinite(value)?value.toFixed(1):"0.0"}%`;
const formatDate=(value:string)=>new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value));

async function ownerContext(){
  const supabase=await createAuthServerClient();
  const {data:{user}}=await supabase.auth.getUser();
  if(!user) redirect("/login");
  const {data:membership}=await supabase.from("organization_members").select("organization_id").eq("user_id",user.id).eq("role","owner").maybeSingle();
  if(!membership) redirect("/login?error=Owner%20authorization%20required.");
  return {supabase,user,organizationId:membership.organization_id as string};
}

async function updateEconomics(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await ownerContext();
  const sessionId=String(formData.get("sessionId")??"");
  const aiBudgetEur=Number(formData.get("aiBudgetEur")??0);
  const customerPriceEur=Number(formData.get("customerPriceEur")??0);
  const accountingFx=Number(formData.get("accountingFx")??0);
  if(!sessionId||!Number.isFinite(aiBudgetEur)||aiBudgetEur<0||!Number.isFinite(customerPriceEur)||customerPriceEur<0||!Number.isFinite(accountingFx)||accountingFx<=0){
    redirect(`/meetings/economics?session=${encodeURIComponent(sessionId)}&error=Enter%20valid%20non-negative%20EUR%20values%20and%20a%20positive%20accounting%20FX.`);
  }
  const {data:current}=await supabase.from("meeting_agent_sessions").select("id,meeting_id,ai_budget_eur,customer_price_eur,accounting_usd_to_eur").eq("id",sessionId).eq("organization_id",organizationId).maybeSingle();
  if(!current) redirect("/meetings/economics?error=Meeting%20session%20not%20found.");
  const {error}=await supabase.from("meeting_agent_sessions").update({
    ai_budget_eur:Math.round(aiBudgetEur*100)/100,
    customer_price_eur:Math.round(customerPriceEur*100)/100,
    accounting_usd_to_eur:accountingFx,
    pricing_basis:"human_ceo_internal_estimate",
    updated_at:new Date().toISOString(),
  }).eq("id",sessionId).eq("organization_id",organizationId);
  if(error) redirect(`/meetings/economics?session=${sessionId}&error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({
    organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"meeting.economics_updated",object_type:"meeting",object_id:current.meeting_id,risk_level:"low",
    payload:{session_id:sessionId,previous:{ai_budget_eur:current.ai_budget_eur,customer_price_eur:current.customer_price_eur,accounting_usd_to_eur:current.accounting_usd_to_eur},current:{ai_budget_eur:aiBudgetEur,customer_price_eur:customerPriceEur,accounting_usd_to_eur:accountingFx},currency:"EUR",provider_currency:"USD",external_actions:false}
  });
  revalidatePath("/meetings/economics");
  redirect(`/meetings/economics?session=${sessionId}&message=Meeting%20economics%20updated.`);
}

export default async function MeetingEconomicsPage({searchParams}:Props){
  const params=await searchParams;
  const {supabase,organizationId}=await ownerContext();
  const fields="id,meeting_id,project_id,status,language,model,estimated_cost_usd,budget_cap_usd,accounting_usd_to_eur,ai_budget_eur,customer_price_eur,pricing_basis,total_input_tokens,total_output_tokens,created_at,meetings(title)";
  const result=await supabase.from("meeting_agent_sessions").select(fields).eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(50);
  const schemaReady=!result.error;
  const sessions=(schemaReady?(result.data??[]):[]) as unknown as EconomicsSession[];
  const selectedId=params.session??sessions[0]?.id??null;
  const selected=selectedId?sessions.find(session=>session.id===selectedId)??null:null;
  const aiCostUsd=Number(selected?.estimated_cost_usd??0);
  const fx=Number(selected?.accounting_usd_to_eur??0);
  const aiCostEur=aiCostUsd*fx;
  const aiBudgetEur=Number(selected?.ai_budget_eur??0);
  const customerPriceEur=Number(selected?.customer_price_eur??0);
  const grossMarginEur=customerPriceEur-aiCostEur;
  const grossMarginPct=customerPriceEur>0?(grossMarginEur/customerPriceEur)*100:0;

  return <main className="command-shell">
    <header className="command-header">
      <div><p className="eyebrow">RYTHM MEETING ECONOMICS · WF-009</p><h1>AI cost → price → margin</h1><p className="subtitle">Business-facing economics in EUR with internal provider reconciliation preserved in USD.</p></div>
      <div style={{display:"flex",gap:10,flexWrap:"wrap"}}><Link className="secondary-button" href={selected?`/meetings/room?meeting=${selected.meeting_id}&session=${selected.id}`:"/meetings/room"}>Boardroom</Link><Link className="secondary-button" href="/attention">Attention Center</Link><Link className="secondary-button" href="/workflow/traceability">Traceability</Link><Link className="secondary-button" href="/command-center">Command Center</Link></div>
    </header>

    <section className="organization-banner"><div><span>Business currency</span><strong>EUR</strong></div><div><span>Provider reconciliation</span><strong>USD · internal</strong></div><div><span>Authority</span><strong>Human CEO / Owner</strong></div></section>
    {!schemaReady?<p className="form-error">Meeting Economics migration is pending. Apply migration 202608080014 before using this workspace.</p>:null}
    {params.message?<p className="form-success">{params.message}</p>:null}{params.error?<p className="form-error">{params.error}</p>:null}

    <section className="panel panel-wide" style={{marginTop:18}}>
      <div className="panel-heading"><div><p className="label">Meeting Economics</p><h2>Session economics register</h2></div><span className="pill">{sessions.length} sessions</span></div>
      <div style={{display:"grid",gridTemplateColumns:"minmax(280px,.75fr) minmax(0,1.6fr)",gap:18}}>
        <div className="data-list">{sessions.length?sessions.map(session=>{const meeting=joined(session.meetings);return <Link key={session.id} href={`/meetings/economics?session=${session.id}`} style={{display:"block",padding:"14px 0",borderBottom:"1px solid #e7eaf0",textDecoration:"none"}}><strong>{meeting?.title??"Meeting session"}</strong><span style={{display:"block",marginTop:5,color:"#717b8e",fontSize:".82rem"}}>{session.status} · {formatDate(session.created_at)}</span></Link>}):<p className="empty-state">No meeting economics records available.</p>}</div>
        {selected?<div>
          <div className="panel-heading"><div><p className="label">Selected session</p><h2>{joined(selected.meetings)?.title??"Meeting session"}</h2></div><span className="pill">{selected.status}</span></div>
          <section className="organization-banner" style={{marginBottom:18}}><div><span>AI Cost</span><strong>{money(aiCostEur,"EUR")}</strong></div><div><span>Meeting AI Budget</span><strong>{money(aiBudgetEur,"EUR")}</strong></div><div><span>Customer Price</span><strong>{money(customerPriceEur,"EUR")}</strong></div></section>
          <section className="organization-banner" style={{marginBottom:18}}><div><span>Est. Gross Margin</span><strong>{money(grossMarginEur,"EUR")}</strong></div><div><span>Est. Gross Margin %</span><strong>{pct(grossMarginPct)}</strong></div><div><span>Pricing basis</span><strong>{selected.pricing_basis.replaceAll("_"," ")}</strong></div></section>
          <article style={{border:"1px solid #dfe4ec",borderRadius:16,padding:18,background:"#f8f9fb",marginBottom:18}}><p className="label">Internal provider reconciliation</p><div className="compact-list"><div><strong>Provider AI cost</strong><span>{money(aiCostUsd,"USD")}</span></div><div><strong>Provider budget cap</strong><span>{money(Number(selected.budget_cap_usd??0),"USD")}</span></div><div><strong>Accounting USD → EUR</strong><span>{fx.toFixed(6)}</span></div><div><strong>Tokens</strong><span>{Number(selected.total_input_tokens??0).toLocaleString()} input · {Number(selected.total_output_tokens??0).toLocaleString()} output</span></div><div><strong>Model</strong><span>{selected.model??"Runtime configured model"}</span></div></div></article>
          <form action={updateEconomics} className="auth-form"><input type="hidden" name="sessionId" value={selected.id}/><label>Meeting AI budget (EUR)<input name="aiBudgetEur" type="number" min="0" step="0.01" defaultValue={aiBudgetEur.toFixed(2)} required/></label><label>Customer price (EUR)<input name="customerPriceEur" type="number" min="0" step="0.01" defaultValue={customerPriceEur.toFixed(2)} required/></label><label>Accounting USD → EUR snapshot<input name="accountingFx" type="number" min="0.000001" step="0.000001" defaultValue={fx.toFixed(6)} required/></label><button type="submit">Save internal economics</button></form>
          <p className="security-note" style={{marginTop:14}}>Internal planning only. This workspace does not create invoices, charge customers, start meetings, authorize agents, approve decisions, or enable external actions.</p>
        </div>:<p className="empty-state">Select a session to inspect its economics.</p>}
      </div>
    </section>
  </main>;
}
