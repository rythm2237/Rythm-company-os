import Link from "next/link";
import {requireOrganizationContext} from "@/lib/auth/organization-context";
import {canCrm} from "@/lib/crm/access";
import {UUID,type SalesOpportunity,type SalesStage} from "@/lib/crm/sales";
import {CrmNav} from "../crm-nav";
import {PipelineBoard} from "./pipeline-board";
export const dynamic="force-dynamic";
export default async function Pipeline({searchParams}:{searchParams:Promise<{page?:string;customer?:string;owner?:string}>}) {
 const q=await searchParams;const {supabase,organizationId}=await requireOrganizationContext();
 const page=Math.max(1,Math.min(10000,Math.trunc(Number(q.page)||1))),customer=UUID.test(q.customer||"")?q.customer!:"",owner=UUID.test(q.owner||"")?q.owner!:"";
 let query=supabase.from("crm_opportunities").select("id,account_id,name,stage_code,value,currency,probability,version,expected_close_date,owner_user_id,lost_reason",{count:"exact"}).eq("organization_id",organizationId);
 if(customer)query=query.eq("account_id",customer);if(owner)query=query.eq("owner_user_id",owner);
 const [deals,stages,customers,members]=await Promise.all([query.order("updated_at",{ascending:false}).order("id").range((page-1)*50,page*50-1),supabase.from("crm_pipeline_stages").select("code,name,probability,is_closed,is_won").eq("organization_id",organizationId).order("sequence_no"),supabase.from("crm_accounts").select("id,name").eq("organization_id",organizationId).order("name").limit(100),supabase.from("organization_members").select("user_id,display_name").eq("organization_id",organizationId).eq("membership_status","active")]);
 const rows=(deals.data??[]) as SalesOpportunity[];
 const permissions=new Map(await Promise.all([...new Set(rows.map(o=>o.account_id))].map(async id=>[id,await canCrm(supabase,organizationId,"finance.update","customer",id)] as const)));
 // Audit only scopes already authorized by RLS, with no amounts or card names.
 const audits=await Promise.all([...new Set(rows.map(o=>o.account_id))].map(cid=>supabase.rpc("crm_log_sensitive_access",{p_organization_id:organizationId,p_domain:"finance",p_resource_type:"customer",p_resource_id:cid})));
 if(audits.some(r=>r.error))return <main className="command-shell"><h1>Sales pipeline unavailable</h1><p>Sensitive access audit could not be recorded. Try again later.</p></main>;
 const url=(n:number)=>`/crm/pipeline?${new URLSearchParams({page:String(n),customer,owner})}`;
 return <main className="command-shell crm-shell"><header className="command-header"><div><h1>Sales pipeline</h1><p className="subtitle">Authorized opportunities across the company.</p></div><Link className="secondary-button" href="/crm">Create an opportunity from a customer</Link></header><CrmNav active="/crm/pipeline"/>{deals.error||stages.error?<p className="form-error" role="alert">Sales pipeline unavailable. Check access and database release status.</p>:null}<section className="panel"><form className="crm-fields"><label>Customer<select name="customer" defaultValue={customer}><option value="">All permitted customers</option>{customers.data?.map(c=><option key={c.id} value={c.id}>{c.name}</option>)}</select></label><label>Salesperson<select name="owner" defaultValue={owner}><option value="">All salespeople</option>{members.data?.map(m=><option key={m.user_id} value={m.user_id}>{m.display_name||m.user_id}</option>)}</select></label><button className="primary-button">Apply filters</button></form><small>Customer selector shows the first 100 names. Only explicitly permitted financial records appear on the board.</small></section><section className="panel"><PipelineBoard stages={(stages.data??[]) as SalesStage[]} opportunities={rows} writableIds={rows.filter(o=>permissions.get(o.account_id)).map(o=>o.id)}/><nav className="crm-toolbar" aria-label="Pipeline pages">{page>1?<Link href={url(page-1)}>Previous</Link>:null}<span>Page {page} · {deals.count??0} permitted opportunities</span>{page*50<(deals.count??0)?<Link href={url(page+1)}>Next</Link>:null}</nav></section></main>;
}
