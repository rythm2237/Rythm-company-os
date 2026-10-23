"use server";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireOrganizationContext, requireOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { requireCrm, CRM_CAPABILITIES } from "@/lib/crm/access";
import { customProperties } from "@/lib/crm/sales";
const text = (fd: FormData, key: string, max = 4000) => String(fd.get(key) ?? "").trim().slice(0, max);
const uuid = (v: string) => /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(v);
function done(path: string, failed: boolean):never { revalidatePath("/crm", "layout"); revalidatePath("/projects"); revalidatePath("/projects/operating"); revalidatePath("/finance"); redirect(`${path}?${failed ? "error=Unable+to+save.+Check+your+access+and+the+required+fields." : "saved=1"}`); }

export async function saveCustomer(fd: FormData) {
 const { supabase, organizationId, user } = await requireOrganizationContext();
 const id = text(fd,"id",36), name = text(fd,"name",240);
 await requireCrm(supabase,organizationId,id ? "customer.update" : "customer.create","customer",id || organizationId);
 if (!name || id && !uuid(id)) done("/crm",true);
 const payload = { name, account_type: text(fd,"account_type",30) || "company", customer_status: text(fd,"customer_status",30) || "lead", legal_name:text(fd,"legal_name",240)||null,registration_number:text(fd,"registration_number",100)||null,vat_number:text(fd,"vat_number",100)||null,address:text(fd,"address",1000)||null,preferred_language:text(fd,"preferred_language",50)||null,tags:text(fd,"tags",500).split(",").map(t=>t.trim()).filter(Boolean).slice(0,20),industry:text(fd,"industry",160)||null,country_code:text(fd,"country_code",2).toUpperCase()||null,website_url:text(fd,"website_url",1000)||null,phone:text(fd,"phone",100)||null,owner_user_id:text(fd,"owner_user_id",36)||null,source:text(fd,"source",100)||"manual",notes:text(fd,"notes",8000)||null,updated_at:new Date().toISOString() };
 let properties;try{properties=customProperties(text(fd,"custom_fields",8193));}catch{done("/crm",true);}
 const extended={...payload,email:text(fd,"email",320)||null,billing_address:text(fd,"billing_address",1000)||null,region:text(fd,"region",160)||null,custom_fields:properties};
 const result = id ? await supabase.from("crm_accounts").update(extended).eq("id",id).eq("organization_id",organizationId).select("id").single() : await supabase.from("crm_accounts").insert({...extended,organization_id:organizationId,created_by_user_id:user.id}).select("id").single();
 if(result.error?.code==="23505"){revalidatePath("/crm");redirect("/crm?error=duplicate");}
 done(result.data ? `/crm/${result.data.id}` : "/crm",!!result.error);
}
export async function saveContact(fd:FormData) {
 const {supabase,organizationId,user}=await requireOrganizationContext(); const accountId=text(fd,"account_id",36),id=text(fd,"id",36);
 await requireCrm(supabase,organizationId,"customer.update","customer",accountId);
 if(!uuid(accountId)||!text(fd,"first_name",100))done("/crm",true);
 const payload={account_id:accountId,first_name:text(fd,"first_name",100),last_name:text(fd,"last_name",100)||null,job_title:text(fd,"job_title",160)||null,email:text(fd,"email",320)||null,phone:text(fd,"phone",100)||null,contact_role:text(fd,"contact_role",160)||null,communication_method:text(fd,"communication_method",80)||null,notes:text(fd,"notes",2000)||null,is_primary:fd.get("is_primary")==="on",updated_at:new Date().toISOString()};
 const result=id?await supabase.from("crm_contacts").update(payload).eq("organization_id",organizationId).eq("account_id",accountId).eq("id",id).select("id").single():await supabase.from("crm_contacts").insert({...payload,organization_id:organizationId,created_by_user_id:user.id});
 done(`/crm/${accountId}`,!!result.error);
}
export async function saveContract(fd:FormData) {
 const {supabase,organizationId}=await requireOrganizationContext(); const customerId=text(fd,"customer_id",36),id=text(fd,"id",36);
 await requireCrm(supabase,organizationId,id?"contract.update":"contract.create",id?"contract":"customer",id||customerId);
 const {data:customer}=await supabase.from("crm_accounts").select("id").eq("organization_id",organizationId).eq("id",customerId).maybeSingle();
 if(!customer||!text(fd,"contract_number",160))done("/crm",true);
 const status=text(fd,"contract_status",40)||"draft";
 const payload={customer_id:customerId,contract_number:text(fd,"contract_number",160),contract_status:status,contract_start_date:text(fd,"contract_start_date",10)||null,contract_end_date:text(fd,"contract_end_date",10)||null,renewal_date:text(fd,"renewal_date",10)||null,scope_description:text(fd,"scope_description",8000)||null,amendment_of:text(fd,"amendment_of",36)||null,updated_at:new Date().toISOString()};
 const result=id?await supabase.from("project_contracts").update(payload).eq("organization_id",organizationId).eq("id",id).eq("customer_id",customerId).select("id").single():await supabase.from("project_contracts").insert({...payload,organization_id:organizationId}).select("id").single();
 done(`/crm/${customerId}`,!!result.error);
}
export async function logCustomerActivity(fd:FormData) {
 const {supabase,organizationId,user}=await requireOrganizationContext();const customerId=text(fd,"account_id",36);
 await requireCrm(supabase,organizationId,"customer.update","customer",customerId);
 const {error}=await supabase.from("crm_activities").insert({organization_id:organizationId,account_id:customerId,subject:text(fd,"subject",240),body:text(fd,"body",4000)||null,activity_type:"note",visibility:"operational",created_by_user_id:user.id});
 done(`/crm/${customerId}`,!!error);
}
export async function grantAccess(fd:FormData) {
 const {supabase,organizationId,user}=await requireOwnerOrganizationContext();const capability=text(fd,"capability",80),resourceType=text(fd,"resource_type",30)||"company",resourceId=text(fd,"resource_id",36)||organizationId;
 if(!CRM_CAPABILITIES.includes(capability as typeof CRM_CAPABILITIES[number])||!uuid(resourceId))done("/crm/access",true);
 const {error}=await supabase.from("crm_access_grants").upsert({organization_id:organizationId,principal_type:text(fd,"principal_type",10),principal_id:text(fd,"principal_id",36),capability,resource_type:resourceType,resource_id:resourceId,granted_by:user.id,revoked_at:null},{onConflict:"organization_id,principal_type,principal_id,capability,resource_type,resource_id"});
 done("/crm/access",!!error);
}
export async function revokeAccess(fd:FormData) {
 const {supabase,organizationId}=await requireOwnerOrganizationContext();
 const {error}=await supabase.from("crm_access_grants").update({revoked_at:new Date().toISOString()}).eq("organization_id",organizationId).eq("id",text(fd,"id",36)).select("id").single();done("/crm/access",!!error);
}
export async function assignManager(fd:FormData) {
 const {supabase,organizationId}=await requireOrganizationContext();const projectId=text(fd,"project_id",36);
 await requireCrm(supabase,organizationId,"project.assign_manager","project",projectId);
 const {error}=fd.get("reconcile")==="1"?await supabase.rpc("crm_reconcile_project",{p_project_id:projectId,p_manager_id:text(fd,"manager_id",36),p_reason:text(fd,"reason",1000)||null,p_engagement_type:text(fd,"engagement_type",20),p_customer_id:text(fd,"customer_id",36)||null}):await supabase.rpc("crm_assign_project_manager",{p_project_id:projectId,p_manager_id:text(fd,"manager_id",36),p_reason:text(fd,"reason",1000)||null});
 revalidatePath("/projects/operating");done("/crm/access",!!error);
}
export async function saveOpportunity(fd:FormData) {
 const {supabase,organizationId,user}=await requireOrganizationContext();const customerId=text(fd,"account_id",36),id=text(fd,"id",36);
 await requireCrm(supabase,organizationId,id?"finance.update":"finance.create","customer",customerId);
 const stage=text(fd,"stage_code",40)||"lead", value=Number(fd.get("value")),probability=Number(fd.get("probability"));
 if(!Number.isFinite(value)||value<0||!Number.isFinite(probability)||probability<0||probability>100||!text(fd,"name",240))done(`/crm/${customerId}`,true);
 const payload={account_id:customerId,name:text(fd,"name",240),stage_code:stage,status:stage==="won"?"won":stage==="lost"?"lost":"open",value,currency:/^[A-Z]{3}$/.test(text(fd,"currency",3))?text(fd,"currency",3):"EUR",probability,expected_close_date:text(fd,"expected_close_date",10)||null,next_step:text(fd,"next_step",2000)||null,lost_reason:text(fd,"lost_reason",2000)||null,owner_user_id:text(fd,"owner_user_id",36)||null,updated_at:new Date().toISOString()};
 const result=id?await supabase.from("crm_opportunities").update(payload).eq("organization_id",organizationId).eq("id",id).eq("account_id",customerId).select("id").single():await supabase.from("crm_opportunities").insert({...payload,organization_id:organizationId,created_by_user_id:user.id});
 done(`/crm/${customerId}`,!!result.error);
}

export async function uploadContractDocument(fd:FormData) {
 const {supabase,organizationId,user}=await requireOrganizationContext();const contractId=text(fd,"contract_id",36);
 await requireCrm(supabase,organizationId,"contract.update","contract",contractId);
 const {data:contract}=await supabase.from("project_contracts").select("id,customer_id").eq("organization_id",organizationId).eq("id",contractId).single();
 if(!contract)done("/crm",true);
 const file=fd.get("document");
 if(!(file instanceof File)||file.size<=0||file.size>20*1024*1024||!["application/pdf","text/plain","application/vnd.openxmlformats-officedocument.wordprocessingml.document"].includes(file.type))done(`/crm/${contract.customer_id}`,true);
 const {createServerSupabaseClient}=await import("@/lib/supabase/server");const service=createServerSupabaseClient();if(!service)done(`/crm/${contract.customer_id}`,true);
 const path=`${organizationId}/contracts/${contractId}/${crypto.randomUUID()}`;
 const uploaded=await service.storage.from("project-files").upload(path,file,{contentType:file.type,upsert:false});
 if(uploaded.error)done(`/crm/${contract.customer_id}`,true);
 const {error}=await service.from("project_documents").insert({organization_id:organizationId,contract_id:contractId,customer_id:contract.customer_id,category:"contract",confidentiality:"contract",legal_document:true,file_name:file.name.slice(0,240),storage_path:path,mime_type:file.type,byte_size:file.size,uploaded_by_user_id:user.id,extraction_status:"failed",last_ingestion_error:"Confidential documents are excluded from shared Project Knowledge."});
 if(error)await service.storage.from("project-files").remove([path]);
 done(`/crm/${contract.customer_id}`,!!error);
}
