import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { BUSINESS_CONTEXT_CORRECTION_FIELDS, normalizeBusinessCorrection } from "@/lib/projects/project-intelligence";
export const dynamic="force-dynamic";
/** Corrections are explicit human assertions for operational knowledge, never contract/finance access. */
export async function POST(request:Request){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  let body:Record<string,unknown>;
  try{body=await request.json();}catch{return NextResponse.json({ok:false,error:"Invalid correction."},{status:400});}
  const correction=normalizeBusinessCorrection(body);
  if(!correction)return NextResponse.json({ok:false,error:`Choose an operational field (${BUSINESS_CONTEXT_CORRECTION_FIELDS.join(", ")}) and provide a value of 1–2000 characters.`},{status:400});
  const projectId=typeof body.projectId==="string"?body.projectId.trim():"";
  const project=await auth.supabase.from("projects").select("id,customer_id").eq("organization_id",auth.organizationId).eq("id",projectId).maybeSingle();
  if(project.error||!project.data)return NextResponse.json({ok:false,error:"Project not found."},{status:404});
  const recordedAt=new Date().toISOString();
  const saved=await auth.supabase.from("project_context_documents").upsert({
    organization_id:auth.organizationId,project_id:projectId,context_type:"business_context_correction",title:`Approved business context: ${correction.key}`,
    summary:`${correction.key}: ${correction.value}`,source_name:"Human-approved operational correction",confidentiality:"operational",status:"approved",confidence:1,
    evidence:{version:1,key:correction.key,value:correction.value,verification:"confirmed_by_user",confirmed_by_user_id:auth.user.id,recorded_at:recordedAt,customer_id:project.data.customer_id??null,scope:project.data.customer_id&&correction.key!=="business_objective"?"customer":"project",supersedes_inference:true},
  },{onConflict:"project_id,title"}).select("id").single();
  if(saved.error||!saved.data)return NextResponse.json({ok:false,error:"Unable to save correction."},{status:500});
  await auth.supabase.from("project_activity_events").insert({organization_id:auth.organizationId,project_id:projectId,event_type:"project.business_context.corrected",headline:"Business context corrected",detail:`A human approved the operational ${correction.key} assertion. Reanalyze to refresh the diagnosis.`,metadata:{context_document_id:saved.data.id,key:correction.key,confirmed_by_user_id:auth.user.id}});
  return NextResponse.json({ok:true,correction:{...correction,sourceId:`knowledge:${saved.data.id}`,recordedAt},requiresReanalysis:true});
}
