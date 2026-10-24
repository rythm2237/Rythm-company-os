import type { SupabaseClient } from "@supabase/supabase-js";
import { normalizeBusinessCorrection, type EvidenceSource } from "@/lib/projects/project-intelligence";
export type ApprovedCustomerCorrection={key:string;value:string;source:EvidenceSource};
/** Must receive the caller's authenticated RLS client, never a service-role client. */
export async function loadReusableCustomerCorrections(caller:SupabaseClient,input:{organizationId:string;customerId:string;projectId:string}):Promise<ApprovedCustomerCorrection[]>{
  // Customer visibility is independently required; project membership alone is insufficient.
  const customer=await caller.from("crm_accounts").select("id").eq("organization_id",input.organizationId).eq("id",input.customerId).maybeSingle();
  if(customer.error||!customer.data)return [];
  const result=await caller.from("project_context_documents").select("id,summary,evidence,created_at,projects!inner(customer_id)").eq("organization_id",input.organizationId).eq("context_type","business_context_correction").eq("confidentiality","operational").eq("status","approved").eq("projects.customer_id",input.customerId).eq("evidence->>customer_id",input.customerId).eq("evidence->>scope","customer").neq("project_id",input.projectId).order("created_at",{ascending:false}).limit(100);
  if(result.error)throw new Error("Approved customer context is temporarily unavailable.");
  const rows=(result.data??[]).map(row=>{const evidence=row.evidence as Record<string,unknown>|null;return {row,evidence,correction:normalizeBusinessCorrection(evidence)};}).filter(item=>item.correction&&item.evidence?.confirmed_by_user_id&&item.correction.key!=="business_objective").sort((a,b)=>String(b.evidence?.recorded_at??b.row.created_at).localeCompare(String(a.evidence?.recorded_at??a.row.created_at)));
  const selected=new Map<string,ApprovedCustomerCorrection>();
  for(const item of rows){const correction=item.correction!;if(selected.has(correction.key))continue;selected.set(correction.key,{...correction,source:{id:`knowledge:${item.row.id}`,kind:"knowledge",summary:`${correction.key}: ${correction.value}`,recordedAt:typeof item.evidence?.recorded_at==="string"?item.evidence.recorded_at:item.row.created_at,verification:"approved"}});}
  return [...selected.values()];
}
