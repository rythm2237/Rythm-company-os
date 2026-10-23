"use server";
import {createHash} from "node:crypto";
import {revalidatePath} from "next/cache";
import {redirect} from "next/navigation";
import {requireOrganizationContext} from "@/lib/auth/organization-context";
import {requireCrm} from "@/lib/crm/access";
import {UUID} from "@/lib/crm/sales";
import {PROFILE_LABELS,suggestContractProfile} from "@/lib/crm/contract-profile";
import {privateContractText} from "@/lib/crm/contract-document";
function finish(customer:string,error?:string):never{revalidatePath("/crm","layout");revalidatePath("/projects");revalidatePath("/finance");redirect(`/crm/${customer}?tab=contracts&${error?new URLSearchParams({error}):"saved=1"}`);}
export async function suggestCustomerProfile(fd:FormData){
 const {supabase,organizationId}=await requireOrganizationContext();const contractId=String(fd.get("contract_id")||""),documentId=String(fd.get("document_id")||"");
 if(!UUID.test(contractId)||!UUID.test(documentId))redirect("/crm?error=Invalid+document");
 await requireCrm(supabase,organizationId,"contract.read","contract",contractId);await requireCrm(supabase,organizationId,"contract.update","contract",contractId);
 const {data:contract}=await supabase.from("project_contracts").select("id,customer_id").eq("organization_id",organizationId).eq("id",contractId).single();
 if(!contract?.customer_id)redirect("/crm?error=Contract+unavailable");
 await requireCrm(supabase,organizationId,"customer.update","customer",contract.customer_id);
 const {data:doc}=await supabase.from("project_documents").select("id,storage_path,mime_type,byte_size").eq("organization_id",organizationId).eq("contract_id",contractId).eq("id",documentId).single();
 if(!doc||Number(doc.byte_size)>10*1024*1024)finish(contract.customer_id,"Select a permitted contract document up to 10 MB.");
 const audit=await supabase.rpc("crm_log_sensitive_access",{p_organization_id:organizationId,p_domain:"contract",p_resource_type:"contract",p_resource_id:contractId});if(audit.error)finish(contract.customer_id,"Contract access audit unavailable.");
 const {createServerSupabaseClient}=await import("@/lib/supabase/server");const service=createServerSupabaseClient();if(!service)finish(contract.customer_id,"Document service unavailable.");
 const {data:file,error}=await service.storage.from("project-files").download(doc.storage_path);if(error||!file||file.size>10*1024*1024)finish(contract.customer_id,"Document unavailable.");
 let fields;const bytes=new Uint8Array(await file.arrayBuffer());
 try{fields=suggestContractProfile(await privateContractText(bytes,doc.mime_type||""));}catch{finish(contract.customer_id,"Document could not be read. Use a text-based PDF, DOCX or UTF-8 TXT (10 MB / 30 PDF pages maximum).");}
 if(!Object.keys(fields).length)finish(contract.customer_id,"No explicitly labelled customer identity fields were found. Use Customer name:, Customer email:, or a Customer details: section. Scanned PDFs require text first.");
 const {error:saveError}=await supabase.from("project_contracts").update({profile_suggestion:{document_id:doc.id,sha256:createHash("sha256").update(bytes).digest("hex"),extractor:"labelled-customer-profile-v1",created_at:new Date().toISOString(),fields}}).eq("organization_id",organizationId).eq("id",contractId);
 finish(contract.customer_id,saveError?"Profile suggestion could not be saved.":undefined);
}
export async function applyCustomerProfile(fd:FormData){
 const {supabase,organizationId}=await requireOrganizationContext();const contractId=String(fd.get("contract_id")||"");if(!UUID.test(contractId))redirect("/crm?error=Invalid+contract");
 await requireCrm(supabase,organizationId,"contract.read","contract",contractId);await requireCrm(supabase,organizationId,"contract.update","contract",contractId);
 const {data:contract}=await supabase.from("project_contracts").select("id,customer_id").eq("organization_id",organizationId).eq("id",contractId).single();if(!contract)redirect("/crm?error=Contract+unavailable");
 await requireCrm(supabase,organizationId,"customer.update","customer",contract.customer_id);
 const fields=fd.getAll("fields").map(String);if(!fields.length||fields.some(k=>!Object.hasOwn(PROFILE_LABELS,k)))finish(contract.customer_id,"Select identity fields to apply.");
 const {error}=await supabase.rpc("crm_apply_contract_profile",{p_contract_id:contractId,p_fields:fields,p_expected_customer_updated_at:String(fd.get("customer_updated_at")||""),p_expected_suggestion_hash:String(fd.get("suggestion_hash")||"")});
 finish(contract.customer_id,error?"Profile not changed. Refresh, review duplicates and confirm your permissions.":undefined);
}
