import Link from "next/link";
import {requireOwnerOrganizationContext} from "@/lib/auth/organization-context";
import {stripeConfigured} from "@/lib/billing/stripe-rest";
import {serviceClient} from "@/lib/ai-workspace/service";
export const dynamic="force-dynamic";

const money=(n:number,c:string)=>new Intl.NumberFormat("en-IE",{style:"currency",currency:c||"EUR"}).format(n||0);
const compact=(n:number)=>n>=1_000_000?`${(n/1_000_000).toFixed(n>=10_000_000?1:1)}M`:n>=1_000?`${Math.round(n/1_000)}K`:String(n);
const regionalPrice=(amount:number,currency:string)=>currency==="IRR"?`${new Intl.NumberFormat("en-US").format(Math.round(amount/10))} تومان`:money(amount,currency);

export default async function BillingPage(){
  const {supabase,organizationId,organization}=await requireOwnerOrganizationContext();
  const svc=serviceClient();
  const region=String(organization.country_code??"").toUpperCase()==="IR"?"IR":"INTL";
  const [accountR,subsR,payR,offersR,agentsR,catalogR,pricesR]=await Promise.all([
    supabase.from("billing_accounts").select("*").eq("organization_id",organizationId).maybeSingle(),
    supabase.from("billing_subscriptions").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}),
    supabase.from("billing_payments").select("*").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(20),
    supabase.from("commercial_offers").select("offer_code,name,summary,currency,base_price,billing_interval,self_serve,status").eq("status","public").eq("self_serve",true).order("sort_order"),
    supabase.from("agents").select("id,name,sale_price_monthly,cost_currency,cost_model,agent_status").eq("organization_id",organizationId).neq("agent_status","archived"),
    svc.from("aiw_plan_catalog").select("plan_code,display_name,allowed_modes,allowed_prompt_profiles,sort_order,most_popular").eq("active",true).order("sort_order"),
    svc.from("aiw_plan_prices").select("plan_code,region_code,currency,price_amount,fast_token_equivalent,smart_token_equivalent,payment_provider,checkout_enabled").eq("region_code",region)
  ]);
  const account=accountR.data;
  const subscriptions=subsR.data??[];
  const payments=payR.data??[];
  const offers=offersR.data??[];
  const agents=agentsR.data??[];
  const activeAi=subscriptions.find((s:any)=>["active","trialing","past_due"].includes(s.status)&&String(s.metadata?.offer_code??"").startsWith("ai_workspace_"));
  const activeCompany=subscriptions.find((s:any)=>["active","trialing","past_due"].includes(s.status)&&!String(s.metadata?.offer_code??"").startsWith("ai_workspace_"));
  const active=activeCompany??activeAi;
  const platformOffers=offers.filter((o:any)=>!String(o.offer_code).startsWith("ai_workspace_"));
  const prices=new Map((pricesR.data??[]).map((p:any)=>[p.plan_code,p]));
  const plans=(catalogR.data??[]).map((c:any)=>({ ...c, ...(prices.get(c.plan_code) as any) })).filter((p:any)=>p.currency);
  const recurringAgents=agents.reduce((s:number,a:any)=>s+Number(a.sale_price_monthly??0),0);
  const localIran=region==="IR";

  return <main className="command-shell finance-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM BILLING</p><h1>Billing & subscription</h1><p className="subtitle">Manage RYTHM AI and company subscriptions for {organization.name}. Provider state remains tenant-isolated and server verified.</p></div><Link className="secondary-button" href="/ai">Open RYTHM AI</Link></header>
    <section className="finance-kpis">
      <article><span>Subscription</span><strong>{active?.status??"Not active"}</strong><small>{active?.current_period_end?`Renews ${new Date(active.current_period_end).toLocaleDateString("en-GB")}`:"No active billing period"}</small></article>
      <article><span>Stripe customer</span><strong>{account?.provider_customer_id?"Connected":"Pending"}</strong><small>{account?.billing_email??"Created on first checkout"}</small></article>
      <article><span>AI positions / month</span><strong>{money(recurringAgents,organization.default_currency??"EUR")}</strong><small>Recurring position value configured in Workforce</small></article>
      <article><span>Payment rail</span><strong>{localIran?"Local provider required":stripeConfigured()?"Ready":"Configuration required"}</strong><small>{localIran?"Iran regional pricing is configured; local checkout is not connected yet.":"Stripe Checkout + verified webhook activation"}</small></article>
    </section>

    <section className="finance-panel" style={{marginBottom:20}}>
      <div className="finance-panel-head"><div><p className="eyebrow">RYTHM AI · {localIran?"IRAN REGIONAL PRICING":"INTERNATIONAL PRICING"}</p><h2>Personal AI Workspace</h2></div></div>
      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(240px,1fr))",gap:14}}>
        {plans.map((p:any)=>{
          const offerCode=`ai_workspace_${p.plan_code}`;
          const activePlan=activeAi?.metadata?.offer_code===offerCode;
          const professional=(p.allowed_prompt_profiles??[]).includes("professional");
          const best=(p.allowed_modes??[]).includes("best");
          return <article key={p.plan_code} className="finance-panel" style={{position:"relative",border:p.most_popular?"2px solid #6366f1":undefined}}>
            {p.most_popular?<span style={{position:"absolute",right:14,top:12,fontSize:11,fontWeight:900,color:"#4f46e5"}}>MOST POPULAR</span>:null}
            <p className="eyebrow">{String(p.plan_code).toUpperCase()}</p>
            <h3 style={{margin:"6px 0"}}>{p.display_name}</h3>
            <strong style={{fontSize:26}}>{regionalPrice(Number(p.price_amount),p.currency)} <small style={{fontSize:13,fontWeight:500}}>/ month</small></strong>
            <ul style={{lineHeight:1.6,paddingLeft:20}}>
              <li>≈ {compact(Number(p.fast_token_equivalent))} Fast/Luna token-equivalent</li>
              <li>≈ {compact(Number(p.smart_token_equivalent))} Smart/Terra token-equivalent</li>
              <li>{professional?"Normal + Professional":"Normal mode"}</li>
              <li>{best?"Fast + Smart + Best":"Fast + Smart"}</li>
              <li>No rollover</li>
            </ul>
            {activePlan?<strong>Current plan</strong>:localIran?<button type="button" disabled title="A supported local payment provider is required for Iran regional checkout.">Local checkout required</button>:<form action="/api/billing/checkout" method="POST"><input type="hidden" name="offerCode" value={offerCode}/><button type="submit" disabled={!stripeConfigured()||Boolean(activeAi)}>Subscribe & test</button></form>}
          </article>;
        })}
      </div>
      <p className="finance-note">Higher tiers include progressively better token value. Token figures are estimates because actual capacity varies with input/output mix, caching, reasoning and routing. RYTHM enforces the underlying usage budget server-side.</p>
      {localIran?<p className="finance-note"><strong>Iran checkout:</strong> regional prices and entitlements are configured, but payment is intentionally disabled until a supported local payment provider is connected. Stripe is not used for this regional rail.</p>:null}
    </section>

    <section className="finance-grid"><article className="finance-panel"><div className="finance-panel-head"><div><p className="eyebrow">FREE TRIAL</p><h2>Try before paying</h2></div></div><ul><li>Up to ≈110K Fast/Luna token-equivalent.</li><li>Maximum 15 AI requests.</li><li>Expires after 7 days.</li><li>Fast/Luna only.</li><li>No Professional Mode and no rollover.</li></ul></article><article className="finance-panel"><div className="finance-panel-head"><div><p className="eyebrow">SELF SERVICE</p><h2>Customer billing portal</h2></div></div><p>Owners can update payment methods, view Stripe invoices, and manage cancellation through a tenant-bound portal session.</p><form action="/api/billing/portal" method="POST"><button type="submit" disabled={!stripeConfigured()||!account?.provider_customer_id}>Open billing portal</button></form><p className="finance-note">Cancellation defaults to end-of-period. Entitlements change only from verified webhook state, never from a browser redirect.</p></article></section>

    <section className="finance-grid"><article className="finance-panel"><div className="finance-panel-head"><div><p className="eyebrow">PLATFORM PLANS</p><h2>Company subscription</h2></div></div><div className="finance-list">{platformOffers.map((o:any)=><div className="finance-row" key={o.offer_code}><div><strong>{o.name}</strong><small>{o.summary}</small></div><div><strong>{o.base_price!=null?money(Number(o.base_price),o.currency??"EUR"):"Custom"}</strong><small>{o.billing_interval}</small></div><form action="/api/billing/checkout" method="POST"><input type="hidden" name="offerCode" value={o.offer_code}/><button type="submit" disabled={!stripeConfigured()||Boolean(activeCompany)}>Subscribe</button></form></div>)}</div></article><article className="finance-panel"><div className="finance-panel-head"><div><p className="eyebrow">TENANT BOUNDARY</p><h2>Independent billing controls</h2></div></div><ul><li>One active RYTHM AI subscription per personal workspace.</li><li>Each paid invoice grants its plan allowance exactly once.</li><li>Plan entitlements are activated only from verified provider payment state.</li><li>Regional pricing and provider rails remain separate.</li><li>AI usage accounting remains ledger-based and immutable.</li></ul></article></section>

    <section className="finance-grid"><article className="finance-panel"><div className="finance-panel-head"><div><p className="eyebrow">PAYMENTS</p><h2>Recent provider payments</h2></div></div><div className="finance-list">{payments.length?payments.map((p:any)=><div className="finance-row" key={p.id}><div><strong>{p.status}</strong><small>{p.provider_invoice_id??p.provider_payment_intent_id??"Stripe"}</small></div><div><strong>{money(Number(p.amount),p.currency)}</strong><small>{new Date(p.created_at).toLocaleDateString("en-GB")}</small></div></div>):<p>No provider payments recorded yet.</p>}</div></article></section>
  </main>;
}
