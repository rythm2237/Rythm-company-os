import Link from "next/link";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOwnerOrganizationContext } from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

type FinanceTransaction = {
  id:string; transaction_type:"revenue"|"expense"; status:string; category:string; description:string;
  amount:number; currency:string; occurred_on:string; counterparty_name:string|null; source_type:string|null; source_id:string|null;
};
type FinanceInvoice = {
  id:string; internal_reference:string; official_invoice_number:string|null; direction:string; status:string; customer_name:string|null;
  customer_email:string|null; currency:string; subtotal:number; tax_total:number; total:number; amount_paid:number;
  issued_at:string|null; due_at:string|null; paid_at:string|null; nav_submission_status:string; created_at:string;
};
type FinanceBudget = { id:string; name:string; category:string; period_start:string; period_end:string; amount:number; currency:string; status:string };
type AgentCost = { id:string; monthly_company_cost:number; sale_price_monthly:number; cost_currency:string; enabled:boolean; agent_status:string };
type Props={searchParams:Promise<{message?:string;error?:string;invoice?:string}>};

const money=(value:number,currency:string)=>new Intl.NumberFormat("en-IE",{style:"currency",currency:currency||"EUR",minimumFractionDigits:2,maximumFractionDigits:2}).format(Number.isFinite(value)?value:0);
const fmtDate=(value:string|null)=>value?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium"}).format(new Date(value)):"—";
const safeCurrency=(value:string)=>/^[A-Z]{3}$/.test(value)?value:"EUR";
const round2=(value:number)=>Math.round(value*100)/100;

async function createTransaction(formData:FormData){
  "use server";
  const {supabase,user,organizationId,organization}=await requireOwnerOrganizationContext();
  const transactionType=String(formData.get("transactionType")??"");
  const description=String(formData.get("description")??"").trim();
  const category=String(formData.get("category")??"other").trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_").slice(0,80)||"other";
  const amount=Number(formData.get("amount")??0);
  const currency=safeCurrency(String(formData.get("currency")??organization.default_currency??"EUR").toUpperCase());
  const occurredOn=String(formData.get("occurredOn")??new Date().toISOString().slice(0,10));
  const counterparty=String(formData.get("counterparty")??"").trim()||null;
  if(!["revenue","expense"].includes(transactionType)||!description||!Number.isFinite(amount)||amount<=0){redirect("/finance?error=Enter%20a%20valid%20finance%20transaction.");}
  const {data,error}=await supabase.from("finance_transactions").insert({organization_id:organizationId,transaction_type:transactionType,status:"posted",category,description,amount:round2(amount),currency,occurred_on:occurredOn,counterparty_name:counterparty,source_type:"manual",created_by_user_id:user.id}).select("id").single();
  if(error||!data)redirect(`/finance?error=${encodeURIComponent(error?.message??"Transaction could not be saved.")}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"finance.transaction_created",object_type:"finance_transaction",object_id:data.id,risk_level:"medium",payload:{transaction_type:transactionType,amount:round2(amount),currency,category,source:"manual"}});
  revalidatePath("/finance"); redirect("/finance?message=Finance%20transaction%20posted.");
}

async function createInvoiceDraft(formData:FormData){
  "use server";
  const {supabase,user,organizationId,organization}=await requireOwnerOrganizationContext();
  const customerName=String(formData.get("customerName")??"").trim();
  const customerEmail=String(formData.get("customerEmail")??"").trim().toLowerCase()||null;
  const lineDescription=String(formData.get("lineDescription")??"").trim();
  const quantity=Number(formData.get("quantity")??1);
  const unitPrice=Number(formData.get("unitPrice")??0);
  const taxRate=Number(formData.get("taxRate")??0);
  const currency=safeCurrency(String(formData.get("currency")??organization.default_currency??"EUR").toUpperCase());
  if(!customerName||!lineDescription||!Number.isFinite(quantity)||quantity<=0||!Number.isFinite(unitPrice)||unitPrice<0||!Number.isFinite(taxRate)||taxRate<0){redirect("/finance?error=Enter%20valid%20invoice%20draft%20values.");}
  const subtotal=round2(quantity*unitPrice); const taxTotal=round2(subtotal*(taxRate/100)); const total=round2(subtotal+taxTotal);
  const internalReference=`RF-${new Date().toISOString().slice(0,10).replaceAll("-","")}-${crypto.randomUUID().slice(0,8).toUpperCase()}`;
  const {data:invoice,error:invoiceError}=await supabase.from("finance_invoices").insert({organization_id:organizationId,internal_reference:internalReference,direction:"receivable",status:"draft",customer_name:customerName,customer_email:customerEmail,currency,subtotal,tax_total:taxTotal,total,created_by_user_id:user.id,source_type:"manual"}).select("id").single();
  if(invoiceError||!invoice)redirect(`/finance?error=${encodeURIComponent(invoiceError?.message??"Invoice draft could not be created.")}`);
  const {error:lineError}=await supabase.from("finance_invoice_lines").insert({organization_id:organizationId,invoice_id:invoice.id,description:lineDescription,quantity,unit_price:round2(unitPrice),tax_rate:taxRate,line_subtotal:subtotal,line_tax:taxTotal,line_total:total,source_type:"manual"});
  if(lineError){await supabase.from("finance_invoices").delete().eq("organization_id",organizationId).eq("id",invoice.id);redirect(`/finance?error=${encodeURIComponent(lineError.message)}`);}
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"finance.invoice_draft_created",object_type:"finance_invoice",object_id:invoice.id,risk_level:"medium",payload:{internal_reference:internalReference,total,currency,tax_rate:taxRate,statutory_invoice_created:false}});
  revalidatePath("/finance"); redirect(`/finance?invoice=${invoice.id}&message=Internal%20invoice%20draft%20created.%20No%20statutory%20invoice%20was%20issued.`);
}

async function registerIssuedInvoice(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await requireOwnerOrganizationContext();
  const invoiceId=String(formData.get("invoiceId")??"");
  const officialNumber=String(formData.get("officialInvoiceNumber")??"").trim();
  const dueAt=String(formData.get("dueAt")??"").trim();
  if(!invoiceId||!officialNumber)redirect("/finance?error=Official%20invoice%20number%20is%20required%20to%20mark%20an%20invoice%20issued.");
  const {data:invoice}=await supabase.from("finance_invoices").select("id,status,internal_reference").eq("organization_id",organizationId).eq("id",invoiceId).maybeSingle();
  if(!invoice||!["draft","failed"].includes(invoice.status))redirect(`/finance?invoice=${invoiceId}&error=Only%20a%20draft%20or%20failed%20invoice%20can%20be%20registered%20as%20issued.`);
  const now=new Date().toISOString();
  const {error}=await supabase.from("finance_invoices").update({official_invoice_number:officialNumber,status:"issued",issued_at:now,due_at:dueAt?new Date(`${dueAt}T23:59:59`).toISOString():null,external_provider:"manual_accounting_provider",updated_at:now}).eq("organization_id",organizationId).eq("id",invoiceId);
  if(error)redirect(`/finance?invoice=${invoiceId}&error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"finance.invoice_registered_issued",object_type:"finance_invoice",object_id:invoiceId,risk_level:"high",payload:{official_invoice_number:officialNumber,source:"manual_accounting_provider",nav_submission_status:"not_connected"}});
  revalidatePath("/finance"); redirect(`/finance?invoice=${invoiceId}&message=Official%20invoice%20reference%20registered.`);
}

async function markInvoicePaid(formData:FormData){
  "use server";
  const {supabase,user,organizationId}=await requireOwnerOrganizationContext();
  const invoiceId=String(formData.get("invoiceId")??"");
  const {data:invoice}=await supabase.from("finance_invoices").select("id,status,total,currency,customer_name,official_invoice_number,internal_reference").eq("organization_id",organizationId).eq("id",invoiceId).maybeSingle();
  if(!invoice||!["issued","overdue"].includes(invoice.status))redirect(`/finance?invoice=${invoiceId}&error=Only%20an%20issued%20or%20overdue%20invoice%20can%20be%20marked%20paid.`);
  const {data:existing}=await supabase.from("finance_transactions").select("id").eq("organization_id",organizationId).eq("source_type","invoice").eq("source_id",invoiceId).eq("transaction_type","revenue").neq("status","void").maybeSingle();
  if(existing)redirect(`/finance?invoice=${invoiceId}&error=Revenue%20for%20this%20invoice%20is%20already%20recorded.`);
  const now=new Date().toISOString();
  const {error:txError}=await supabase.from("finance_transactions").insert({organization_id:organizationId,transaction_type:"revenue",status:"posted",category:"invoice",description:`Invoice ${invoice.official_invoice_number??invoice.internal_reference}`,amount:invoice.total,currency:invoice.currency,occurred_on:now.slice(0,10),counterparty_name:invoice.customer_name,source_type:"invoice",source_id:invoiceId,created_by_user_id:user.id});
  if(txError)redirect(`/finance?invoice=${invoiceId}&error=${encodeURIComponent(txError.message)}`);
  const {error}=await supabase.from("finance_invoices").update({status:"paid",amount_paid:invoice.total,paid_at:now,updated_at:now}).eq("organization_id",organizationId).eq("id",invoiceId);
  if(error)redirect(`/finance?invoice=${invoiceId}&error=${encodeURIComponent(error.message)}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"finance.invoice_paid",object_type:"finance_invoice",object_id:invoiceId,risk_level:"high",payload:{amount:invoice.total,currency:invoice.currency,revenue_recorded:true,payment_processor:"manual"}});
  revalidatePath("/finance"); redirect(`/finance?invoice=${invoiceId}&message=Invoice%20marked%20paid%20and%20revenue%20posted.`);
}

async function createBudget(formData:FormData){
  "use server";
  const {supabase,user,organizationId,organization}=await requireOwnerOrganizationContext();
  const name=String(formData.get("name")??"").trim(); const category=String(formData.get("category")??"general").trim().toLowerCase().replace(/[^a-z0-9_-]/g,"_")||"general";
  const amount=Number(formData.get("amount")??0); const start=String(formData.get("periodStart")??""); const end=String(formData.get("periodEnd")??"");
  const currency=safeCurrency(String(formData.get("currency")??organization.default_currency??"EUR").toUpperCase());
  if(!name||!start||!end||end<start||!Number.isFinite(amount)||amount<0)redirect("/finance?error=Enter%20a%20valid%20budget.");
  const {data,error}=await supabase.from("finance_budgets").insert({organization_id:organizationId,name,category,period_start:start,period_end:end,amount:round2(amount),currency,status:"active",created_by_user_id:user.id}).select("id").single();
  if(error||!data)redirect(`/finance?error=${encodeURIComponent(error?.message??"Budget could not be created.")}`);
  await supabase.from("audit_events").insert({organization_id:organizationId,actor_type:"user",actor_user_id:user.id,event_type:"finance.budget_created",object_type:"finance_budget",object_id:data.id,risk_level:"medium",payload:{name,category,amount:round2(amount),currency,period_start:start,period_end:end}});
  revalidatePath("/finance"); redirect("/finance?message=Budget%20created.");
}

export default async function FinanceCenter({searchParams}:Props){
  const params=await searchParams; const {supabase,organizationId,organization}=await requireOwnerOrganizationContext();
  const currency=safeCurrency(organization.default_currency??"EUR");
  const [txResult,invoiceResult,budgetResult,agentResult]=await Promise.all([
    supabase.from("finance_transactions").select("id,transaction_type,status,category,description,amount,currency,occurred_on,counterparty_name,source_type,source_id").eq("organization_id",organizationId).order("occurred_on",{ascending:false}).limit(100),
    supabase.from("finance_invoices").select("id,internal_reference,official_invoice_number,direction,status,customer_name,customer_email,currency,subtotal,tax_total,total,amount_paid,issued_at,due_at,paid_at,nav_submission_status,created_at").eq("organization_id",organizationId).order("created_at",{ascending:false}).limit(50),
    supabase.from("finance_budgets").select("id,name,category,period_start,period_end,amount,currency,status").eq("organization_id",organizationId).order("period_start",{ascending:false}).limit(30),
    supabase.from("agents").select("id,monthly_company_cost,sale_price_monthly,cost_currency,enabled,agent_status").eq("organization_id",organizationId).neq("agent_status","archived")
  ]);
  const schemaError=txResult.error||invoiceResult.error||budgetResult.error;
  const transactions=(txResult.data??[]) as FinanceTransaction[]; const invoices=(invoiceResult.data??[]) as FinanceInvoice[]; const budgets=(budgetResult.data??[]) as FinanceBudget[]; const agents=(agentResult.data??[]) as AgentCost[];
  const today=new Date(); const monthStart=new Date(Date.UTC(today.getUTCFullYear(),today.getUTCMonth(),1)).toISOString().slice(0,10); const yearStart=`${today.getUTCFullYear()}-01-01`;
  const posted=transactions.filter(t=>t.status==="posted"&&t.currency===currency); const revenueMTD=posted.filter(t=>t.transaction_type==="revenue"&&t.occurred_on>=monthStart).reduce((s,t)=>s+Number(t.amount),0); const expenseMTD=posted.filter(t=>t.transaction_type==="expense"&&t.occurred_on>=monthStart).reduce((s,t)=>s+Number(t.amount),0);
  const revenueYTD=posted.filter(t=>t.transaction_type==="revenue"&&t.occurred_on>=yearStart).reduce((s,t)=>s+Number(t.amount),0); const expenseYTD=posted.filter(t=>t.transaction_type==="expense"&&t.occurred_on>=yearStart).reduce((s,t)=>s+Number(t.amount),0); const netCashYTD=revenueYTD-expenseYTD;
  const outstanding=invoices.filter(i=>i.currency===currency&&["issued","overdue","failed"].includes(i.status)).reduce((s,i)=>s+Math.max(0,Number(i.total)-Number(i.amount_paid)),0);
  const workforceMonthly=agents.filter(a=>a.enabled&&a.agent_status!=="archived"&&a.cost_currency===currency).reduce((s,a)=>s+Number(a.monthly_company_cost??0),0); const positionRevenueMonthly=agents.filter(a=>a.enabled&&a.agent_status!=="archived"&&a.cost_currency===currency).reduce((s,a)=>s+Number(a.sale_price_monthly??0),0); const workforceMargin=positionRevenueMonthly-workforceMonthly;
  const selected=params.invoice?invoices.find(i=>i.id===params.invoice)??null:invoices[0]??null;
  return <main className="command-shell finance-shell">
    <header className="command-header"><div><p className="eyebrow">RYTHM FINANCE CENTER</p><h1>Company finance</h1><p className="subtitle">Operational revenue, expenses, invoices, cash flow and budgets. Statutory accounting remains provider-controlled until Accounting/NAV integration is connected.</p></div><div className="finance-header-actions"><Link className="secondary-button" href="/company">Company Profile</Link><Link className="secondary-button" href="/meetings/economics">Meeting Economics</Link></div></header>
    <section className="organization-banner"><div><span>Organization</span><strong>{organization.legal_name||organization.name}</strong></div><div><span>Base currency</span><strong>{currency}</strong></div><div><span>Accounting mode</span><strong>Operational ledger · provider-ready</strong></div></section>
    {schemaError?<p className="form-error">Finance Center schema is not available yet: {schemaError.message}</p>:null}{params.message?<p className="form-success">{params.message}</p>:null}{params.error?<p className="form-error">{params.error}</p>:null}
    <section className="finance-kpis"><article><span>Revenue MTD</span><strong>{money(revenueMTD,currency)}</strong><small>Posted transactions</small></article><article><span>Expenses MTD</span><strong>{money(expenseMTD,currency)}</strong><small>Posted transactions</small></article><article><span>Net cash YTD</span><strong>{money(netCashYTD,currency)}</strong><small>{money(revenueYTD,currency)} in · {money(expenseYTD,currency)} out</small></article><article><span>Receivables</span><strong>{money(outstanding,currency)}</strong><small>Issued / overdue / failed</small></article><article><span>AI workforce cost</span><strong>{money(workforceMonthly,currency)}</strong><small>Current monthly estimate</small></article><article><span>Position margin</span><strong>{money(workforceMargin,currency)}</strong><small>{money(positionRevenueMonthly,currency)} monthly sale value</small></article></section>
    <section className="finance-grid">
      <article className="panel"><div className="panel-heading"><div><p className="label">Cash register</p><h2>Revenue & expenses</h2></div><span className="pill">{transactions.length} records</span></div><div className="finance-list">{transactions.length?transactions.slice(0,14).map(t=><div key={t.id} className="finance-row"><div><strong>{t.description}</strong><span>{t.category} · {fmtDate(t.occurred_on)}{t.counterparty_name?` · ${t.counterparty_name}`:""}</span></div><b className={t.transaction_type==="revenue"?"finance-positive":"finance-negative"}>{t.transaction_type==="revenue"?"+":"−"}{money(Number(t.amount),t.currency)}</b></div>):<p className="empty-state">No financial transactions yet.</p>}</div><details className="finance-details"><summary>Post revenue or expense</summary><form action={createTransaction} className="auth-form"><label>Type<select name="transactionType" defaultValue="expense"><option value="expense">Expense</option><option value="revenue">Revenue</option></select></label><label>Description<input name="description" required maxLength={200}/></label><div className="finance-form-grid"><label>Category<input name="category" placeholder="provider_cost" required/></label><label>Amount<input name="amount" type="number" min="0.01" step="0.01" required/></label><label>Currency<input name="currency" defaultValue={currency} maxLength={3} required/></label><label>Date<input name="occurredOn" type="date" defaultValue={new Date().toISOString().slice(0,10)} required/></label></div><label>Counterparty<input name="counterparty" placeholder="Optional"/></label><button type="submit">Post transaction</button></form></details></article>
      <article className="panel"><div className="panel-heading"><div><p className="label">Invoices</p><h2>Receivables register</h2></div><span className="pill">{invoices.length} invoices</span></div><div className="finance-list">{invoices.length?invoices.slice(0,12).map(i=><Link key={i.id} href={`/finance?invoice=${i.id}`} className={`finance-row finance-row-link${selected?.id===i.id?" is-selected":""}`}><div><strong>{i.official_invoice_number||i.internal_reference}</strong><span>{i.customer_name||"Customer pending"} · {i.status}</span></div><b>{money(Number(i.total),i.currency)}</b></Link>):<p className="empty-state">No invoices yet.</p>}</div><details className="finance-details"><summary>Create internal invoice draft</summary><form action={createInvoiceDraft} className="auth-form"><label>Customer name<input name="customerName" required/></label><label>Customer email<input name="customerEmail" type="email"/></label><label>Line description<input name="lineDescription" required/></label><div className="finance-form-grid"><label>Quantity<input name="quantity" type="number" min="0.0001" step="0.0001" defaultValue="1" required/></label><label>Unit price<input name="unitPrice" type="number" min="0" step="0.01" required/></label><label>Tax rate %<input name="taxRate" type="number" min="0" step="0.01" defaultValue="0" required/></label><label>Currency<input name="currency" defaultValue={currency} maxLength={3} required/></label></div><button type="submit">Create internal draft</button><p className="security-note">This does not issue a statutory invoice or submit anything to NAV.</p></form></details></article>
      <article className="panel finance-invoice-detail"><div className="panel-heading"><div><p className="label">Invoice detail</p><h2>{selected?.official_invoice_number||selected?.internal_reference||"Select an invoice"}</h2></div>{selected?<span className={`finance-status finance-status-${selected.status}`}>{selected.status}</span>:null}</div>{selected?<><div className="compact-list"><div><strong>Customer</strong><span>{selected.customer_name||"—"}{selected.customer_email?` · ${selected.customer_email}`:""}</span></div><div><strong>Subtotal</strong><span>{money(Number(selected.subtotal),selected.currency)}</span></div><div><strong>Tax</strong><span>{money(Number(selected.tax_total),selected.currency)}</span></div><div><strong>Total</strong><span>{money(Number(selected.total),selected.currency)}</span></div><div><strong>Official invoice</strong><span>{selected.official_invoice_number||"Not issued by accounting provider"}</span></div><div><strong>NAV status</strong><span>{selected.nav_submission_status.replaceAll("_"," ")}</span></div><div><strong>Issued / Due / Paid</strong><span>{fmtDate(selected.issued_at)} / {fmtDate(selected.due_at)} / {fmtDate(selected.paid_at)}</span></div></div>{["draft","failed"].includes(selected.status)?<form action={registerIssuedInvoice} className="auth-form finance-inline-form"><input type="hidden" name="invoiceId" value={selected.id}/><label>Official invoice number<input name="officialInvoiceNumber" required placeholder="From compliant accounting provider"/></label><label>Due date<input name="dueAt" type="date"/></label><button type="submit">Register provider-issued invoice</button></form>:null}{["issued","overdue"].includes(selected.status)?<form action={markInvoicePaid}><input type="hidden" name="invoiceId" value={selected.id}/><button className="primary-link finance-action-button" type="submit">Mark paid & post revenue</button></form>:null}</>:<p className="empty-state">Select an invoice from the register.</p>}</article>
      <article className="panel"><div className="panel-heading"><div><p className="label">Budgets</p><h2>Operating budgets</h2></div><span className="pill">{budgets.length} budgets</span></div><div className="finance-list">{budgets.length?budgets.slice(0,10).map(b=><div className="finance-row" key={b.id}><div><strong>{b.name}</strong><span>{b.category} · {fmtDate(b.period_start)} → {fmtDate(b.period_end)}</span></div><b>{money(Number(b.amount),b.currency)}</b></div>):<p className="empty-state">No budgets defined.</p>}</div><details className="finance-details"><summary>Create budget</summary><form action={createBudget} className="auth-form"><label>Name<input name="name" required/></label><div className="finance-form-grid"><label>Category<input name="category" defaultValue="general" required/></label><label>Amount<input name="amount" type="number" min="0" step="0.01" required/></label><label>Start<input name="periodStart" type="date" required/></label><label>End<input name="periodEnd" type="date" required/></label></div><label>Currency<input name="currency" defaultValue={currency} maxLength={3} required/></label><button type="submit">Create budget</button></form></details></article>
    </section>
    <section className="finance-boundary"><strong>Finance boundary</strong><p>RYTHM currently records operational finance evidence and internal invoice drafts. Statutory bookkeeping, official invoice numbering, VAT determination, NAV Online Számla submission and bank reconciliation remain external-provider responsibilities until their integrations are explicitly enabled.</p></section>
  </main>;
}
