import type {CSSProperties} from "react";
import Link from "next/link";
import {requireOwnerOrganizationContext} from "@/lib/auth/organization-context";
import {stripeConfigured} from "@/lib/billing/stripe-rest";
import {serviceClient} from "@/lib/ai-workspace/service";

export const dynamic="force-dynamic";

const money=(n:number,c:string)=>new Intl.NumberFormat("en-IE",{style:"currency",currency:c||"EUR"}).format(n||0);
const compact=(n:number)=>n>=1_000_000?`${(n/1_000_000).toFixed(1)}M`:n>=1_000?`${Math.round(n/1_000)}K`:String(n);
const regionalPrice=(amount:number,currency:string)=>currency==="IRR"?`${new Intl.NumberFormat("en-US").format(Math.round(amount/10))} تومان`:money(amount,currency);

const card:CSSProperties={background:"var(--surface, #fff)",border:"1px solid rgba(15,23,42,.10)",borderRadius:22,padding:24,boxShadow:"0 10px 28px rgba(15,23,42,.05)"};
const muted:CSSProperties={color:"#697386",fontSize:14,lineHeight:1.55};
const statusChip:CSSProperties={display:"inline-flex",alignItems:"center",gap:8,border:"1px solid rgba(15,23,42,.10)",borderRadius:999,padding:"9px 12px",fontSize:13,fontWeight:700,background:"rgba(255,255,255,.72)"};
const planButton:CSSProperties={width:"100%",minHeight:48,borderRadius:12,fontWeight:800,fontSize:15,marginTop:"auto"};

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
  const platformOffers=offers.filter((o:any)=>!String(o.offer_code).startsWith("ai_workspace_"));
  const prices=new Map((pricesR.data??[]).map((p:any)=>[p.plan_code,p]));
  const plans=(catalogR.data??[]).map((c:any)=>({...c,...(prices.get(c.plan_code) as any)})).filter((p:any)=>p.currency);
  const recurringAgents=agents.reduce((s:number,a:any)=>s+Number(a.sale_price_monthly??0),0);
  const localIran=region==="IR";
  const stripeReady=stripeConfigured();
  const paymentRailReady=localIran?false:stripeReady;
  const aiPlanName=activeAi?.metadata?.offer_code?String(activeAi.metadata.offer_code).replace("ai_workspace_","").replace(/^./,(m:string)=>m.toUpperCase()):"Free Trial";

  return <main className="command-shell finance-shell" style={{maxWidth:1380}}>
    <header className="command-header" style={{alignItems:"flex-start",marginBottom:20}}>
      <div>
        <p className="eyebrow">RYTHM BILLING</p>
        <h1 style={{marginBottom:8}}>Plans & billing</h1>
        <p className="subtitle" style={{maxWidth:760}}>Choose the RYTHM AI plan that fits your usage. Token allowances scale with each tier, while billing and entitlements remain server-verified.</p>
      </div>
      <Link className="secondary-button" href="/ai">Back to RYTHM AI</Link>
    </header>

    <section aria-label="Billing status" style={{display:"flex",flexWrap:"wrap",gap:10,marginBottom:24}}>
      <span style={statusChip}><span>AI plan</span><strong>{aiPlanName}</strong></span>
      <span style={statusChip}><span>Payment</span><strong>{localIran?"Local rail pending":paymentRailReady?"Ready":"Setup required"}</strong></span>
      <span style={statusChip}><span>Customer</span><strong>{account?.provider_customer_id?"Connected":"Not created yet"}</strong></span>
      {activeAi?.current_period_end?<span style={statusChip}><span>Renews</span><strong>{new Date(activeAi.current_period_end).toLocaleDateString("en-GB")}</strong></span>:null}
    </section>

    {!localIran&&!paymentRailReady?<section style={{...card,border:"1px solid rgba(245,158,11,.32)",background:"rgba(255,251,235,.86)",marginBottom:24}}>
      <strong style={{display:"block",fontSize:16,marginBottom:5}}>Payment setup required</strong>
      <span style={muted}>Stripe Checkout is not available in this deployment yet. Once the server-side Stripe key is available, purchase buttons become active automatically.</span>
    </section>:null}

    <section style={{marginBottom:28}}>
      <div style={{display:"flex",alignItems:"end",justifyContent:"space-between",gap:16,marginBottom:14,flexWrap:"wrap"}}>
        <div>
          <p className="eyebrow">{localIran?"IRAN REGIONAL PRICING":"INTERNATIONAL PRICING"}</p>
          <h2 style={{margin:"4px 0 0"}}>RYTHM AI plans</h2>
        </div>
        <p style={{...muted,margin:0,maxWidth:520}}>Higher tiers provide more token value per unit of price. Allowances are estimates because actual usage depends on model mix and context size.</p>
      </div>

      <div style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(255px,1fr))",gap:16,alignItems:"stretch"}}>
        {plans.map((p:any)=>{
          const offerCode=`ai_workspace_${p.plan_code}`;
          const activePlan=activeAi?.metadata?.offer_code===offerCode;
          const professional=(p.allowed_prompt_profiles??[]).includes("professional");
          const best=(p.allowed_modes??[]).includes("best");
          const ctaDisabled=localIran||!stripeReady||Boolean(activeAi);
          const ctaLabel=activePlan?"Current plan":localIran?"Local checkout coming soon":activeAi?"Plan already active":!stripeReady?"Payment setup required":`Choose ${String(p.plan_code).replace(/^./,(m:string)=>m.toUpperCase())}`;
          return <article key={p.plan_code} style={{...card,display:"flex",flexDirection:"column",minHeight:410,position:"relative",border:p.most_popular?"2px solid #5b5bf7":"1px solid rgba(15,23,42,.10)",boxShadow:p.most_popular?"0 16px 42px rgba(91,91,247,.14)":"0 10px 28px rgba(15,23,42,.05)"}}>
            {p.most_popular?<span style={{position:"absolute",right:18,top:16,fontSize:11,fontWeight:900,letterSpacing:1,color:"#4f46e5"}}>MOST POPULAR</span>:null}
            <p className="eyebrow" style={{marginBottom:6}}>{String(p.plan_code).toUpperCase()}</p>
            <h3 style={{fontSize:22,margin:"0 0 10px"}}>{p.display_name}</h3>
            <div style={{display:"flex",alignItems:"baseline",gap:6,marginBottom:18}}><strong style={{fontSize:32,letterSpacing:-1}}>{regionalPrice(Number(p.price_amount),p.currency)}</strong><span style={muted}>/ month</span></div>

            <div style={{padding:"14px 0",borderTop:"1px solid rgba(15,23,42,.08)",borderBottom:"1px solid rgba(15,23,42,.08)",marginBottom:16}}>
              <div style={{fontSize:17,fontWeight:800,marginBottom:5}}>≈ {compact(Number(p.fast_token_equivalent))} Fast tokens</div>
              <div style={{...muted,fontSize:13}}>or ≈ {compact(Number(p.smart_token_equivalent))} Smart tokens from the same monthly allowance</div>
            </div>

            <ul style={{display:"grid",gap:9,paddingLeft:20,margin:"0 0 22px",fontSize:14,lineHeight:1.45}}>
              <li>{professional?"Normal + Professional modes":"Normal mode"}</li>
              <li>{best?"Fast + Smart + Best routing":"Fast + Smart routing"}</li>
              <li>No rollover</li>
            </ul>

            {activePlan?<div style={{...planButton,display:"grid",placeItems:"center",background:"rgba(34,197,94,.10)",color:"#166534",border:"1px solid rgba(34,197,94,.28)"}}>Current plan</div>:
            <form action="/api/billing/checkout" method="POST" style={{marginTop:"auto"}}>
              <input type="hidden" name="offerCode" value={offerCode}/>
              <button className={p.most_popular?"primary-button":"secondary-button"} type="submit" disabled={ctaDisabled} style={{...planButton,opacity:ctaDisabled?.55:1,cursor:ctaDisabled?"not-allowed":"pointer"}}>{ctaLabel}</button>
            </form>}
          </article>;
        })}
      </div>
    </section>

    <section style={{display:"grid",gridTemplateColumns:"repeat(auto-fit,minmax(300px,1fr))",gap:16,marginBottom:24}}>
      <article style={card}>
        <p className="eyebrow">FREE TRIAL</p>
        <h3 style={{margin:"6px 0 10px",fontSize:20}}>Try before paying</h3>
        <p style={muted}>Included automatically for new personal workspaces.</p>
        <ul style={{lineHeight:1.7,paddingLeft:20,marginBottom:0}}><li>≈110K Fast/Luna token-equivalent</li><li>Up to 15 AI requests</li><li>7-day expiry</li><li>Normal mode only</li></ul>
      </article>
      <article style={card}>
        <p className="eyebrow">MANAGE SUBSCRIPTION</p>
        <h3 style={{margin:"6px 0 10px",fontSize:20}}>Billing portal</h3>
        <p style={muted}>Update payment methods, review invoices, or manage cancellation after your first successful checkout.</p>
        <form action="/api/billing/portal" method="POST"><button className="secondary-button" type="submit" disabled={!stripeReady||!account?.provider_customer_id} style={{minHeight:44,borderRadius:10,opacity:(!stripeReady||!account?.provider_customer_id)?.55:1}}>Open billing portal</button></form>
      </article>
    </section>

    {(platformOffers.length>0||recurringAgents>0||payments.length>0)?<details style={{...card,padding:0,overflow:"hidden"}}>
      <summary style={{padding:"18px 22px",cursor:"pointer",fontWeight:800}}>Company billing & payment history</summary>
      <div style={{padding:"0 22px 22px",display:"grid",gap:18}}>
        {recurringAgents>0?<p style={{margin:0}}>AI positions / month: <strong>{money(recurringAgents,organization.default_currency??"EUR")}</strong></p>:null}
        {platformOffers.length?<div><h3>Company subscription</h3><div className="finance-list">{platformOffers.map((o:any)=><div className="finance-row" key={o.offer_code}><div><strong>{o.name}</strong><small>{o.summary}</small></div><div><strong>{o.base_price!=null?money(Number(o.base_price),o.currency??"EUR"):"Custom"}</strong><small>{o.billing_interval}</small></div><form action="/api/billing/checkout" method="POST"><input type="hidden" name="offerCode" value={o.offer_code}/><button type="submit" disabled={!stripeReady||Boolean(activeCompany)}>Subscribe</button></form></div>)}</div></div>:null}
        {payments.length?<div><h3>Recent payments</h3><div className="finance-list">{payments.map((p:any)=><div className="finance-row" key={p.id}><div><strong>{p.status}</strong><small>{p.provider_invoice_id??p.provider_payment_intent_id??"Stripe"}</small></div><div><strong>{money(Number(p.amount),p.currency)}</strong><small>{new Date(p.created_at).toLocaleDateString("en-GB")}</small></div></div>)}</div></div>:null}
      </div>
    </details>:null}
  </main>;
}
