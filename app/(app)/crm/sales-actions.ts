"use server";
import { redirect } from "next/navigation";
import { revalidatePath } from "next/cache";
import { requireOrganizationContext,requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { requireCrm } from "@/lib/crm/access";
import { leadInput,UUID } from "@/lib/crm/sales";
function finish(path:string,error?:string):never {revalidatePath("/crm","layout");redirect(`${path}?${error?new URLSearchParams({error}):"saved=1"}`);}
export async function saveLead(fd:FormData) {
 const {supabase,organizationId}=await requireOrganizationContext();const id=String(fd.get("id")||"");
 await requireCrm(supabase,organizationId,id?"customer.update":"customer.create");
 let payload;try{payload=leadInput(Object.fromEntries(fd));}catch{finish("/crm/leads","Check the lead fields.");}
 if(id&&!UUID.test(id))finish("/crm/leads","Lead unavailable.");
 const result=id?await supabase.from("crm_leads").update(payload).eq("organization_id",organizationId).eq("id",id).select("id").single():await supabase.from("crm_leads").insert({...payload,organization_id:organizationId}).select("id").single();
 finish("/crm/leads",result.error?"Unable to save lead. Check your access and assignee.":undefined);
}
export async function convertLead(fd:FormData) {
 const {supabase,organizationId}=await requireOrganizationContext();await requireCrm(supabase,organizationId,"customer.update");
 const id=String(fd.get("id")||""),customer=String(fd.get("customer_id")||"");
 if(!UUID.test(id)||customer&&!UUID.test(customer))finish("/crm/leads","Invalid conversion selection.");
 const {data,error}=await supabase.rpc("crm_convert_lead",{p_lead_id:id,p_customer_id:customer||null});
 if(error||!data)finish("/crm/leads","Conversion failed. Qualify the lead and check for an existing customer with the same identity.");
 revalidatePath("/crm","layout");redirect(`/crm/${data}?saved=1`);
}
export async function moveCustomerOpportunity(fd:FormData) {
 const {supabase,organizationId}=await requireOrganizationContext();
 const id=String(fd.get("id")||""),customer=String(fd.get("account_id")||""),version=Number(fd.get("version")),stage=String(fd.get("stage_code")||"");
 if(!UUID.test(id)||!UUID.test(customer)||!Number.isInteger(version)||version<1||!/^[a-z][a-z0-9_]{0,39}$/.test(stage))finish("/crm","Invalid transition.");
 await requireCrm(supabase,organizationId,"finance.update","customer",customer);
 const {data}=await supabase.from("crm_opportunities").select("id").eq("organization_id",organizationId).eq("account_id",customer).eq("id",id).maybeSingle();
 if(!data)finish("/crm","Opportunity unavailable.");
 const {error}=await supabase.rpc("crm_move_opportunity",{p_opportunity_id:id,p_stage_code:stage,p_version:version,p_lost_reason:String(fd.get("lost_reason")||"").slice(0,2000)||null});
 revalidatePath("/crm","layout");redirect(`/crm/${customer}?tab=opportunities&${error?"error=transition":"saved=1"}`);
}
export async function saveCrmSettings(fd:FormData) {
 const {supabase,organizationId}=await requireOwnerOrganizationContext();
 const {error}=await supabase.from("crm_preferences").upsert({organization_id:organizationId,duplicate_name:fd.get("duplicate_name")==="on",duplicate_email:fd.get("duplicate_email")==="on",duplicate_registration:fd.get("duplicate_registration")==="on"});
 finish("/crm/settings",error?"Unable to save duplicate rules.":undefined);
}
export async function saveSalesStage(fd:FormData) {
 const {supabase,organizationId}=await requireOwnerOrganizationContext();
 const code=String(fd.get("code")||""),name=String(fd.get("name")||"").trim(),probability=Number(fd.get("probability")),sequence=Number(fd.get("sequence_no"));
 if(!/^[a-z][a-z0-9_]{0,39}$/.test(code)||!name||name.length>100||!Number.isFinite(probability)||probability<0||probability>100||!Number.isInteger(sequence)||sequence<0||sequence>10000)finish("/crm/settings","Check stage fields.");
 const values={name,probability,sequence_no:sequence};
 const {error}=fd.get("existing")==="1"?await supabase.from("crm_pipeline_stages").update(values).eq("organization_id",organizationId).eq("code",code):await supabase.from("crm_pipeline_stages").insert({...values,organization_id:organizationId,code,is_closed:false,is_won:false});
 finish("/crm/settings",error?"Stage not saved. Codes and order numbers must be unique.":undefined);
}
export async function importCustomers(fd:FormData) {
 const {supabase,organizationId}=await requireOwnerOrganizationContext();
 let rows;try{const raw=String(fd.get("rows")||"");if(raw.length>128000)throw Error();rows=JSON.parse(raw);if(!Array.isArray(rows)||rows.length<1||rows.length>100)throw Error();}catch{finish("/crm/settings","Provide a JSON array with 1–100 customers (maximum 128 KB).");}
 const {error}=await supabase.rpc("crm_import_customers",{p_organization_id:organizationId,p_rows:rows});
 finish("/crm/settings",error?"Import rolled back. Check fields, duplicate identities and your access.":undefined);
}
