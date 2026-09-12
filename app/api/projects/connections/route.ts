import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";

export const dynamic="force-dynamic";

type Body={projectId?:string;integrationId?:string;resourceType?:string;resourceRef?:string;displayName?:string;capabilities?:string[];};
export async function POST(request:Request){
  const auth=await resolveOwnerApiOrganizationContext();if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  let body:Body;try{body=await request.json() as Body;}catch{return NextResponse.json({ok:false,error:"Invalid request."},{status:400});}
  const projectId=String(body.projectId??"").trim(),integrationId=String(body.integrationId??"").trim(),resourceRef=String(body.resourceRef??"").trim();
  if(!projectId||!integrationId||!resourceRef)return NextResponse.json({ok:false,error:"Project, connection and specific resource are required."},{status:400});
  const [project,integration]=await Promise.all([
    auth.supabase.from("projects").select("id").eq("id",projectId).eq("organization_id",auth.organizationId).maybeSingle(),
    auth.supabase.from("organization_integrations").select("id,provider_key,display_name,status").eq("id",integrationId).eq("organization_id",auth.organizationId).maybeSingle()
  ]);
  if(!project.data)return NextResponse.json({ok:false,error:"Project not found."},{status:404});
  if(!integration.data||integration.data.status!=="connected")return NextResponse.json({ok:false,error:"The company connection is not connected."},{status:409});
  const requested=[...new Set((body.capabilities??[]).map(String).filter(Boolean))].slice(0,50);
  if(requested.length){
    const allowed=await auth.supabase.from("integration_capabilities").select("capability_key").eq("provider_key",integration.data.provider_key).in("capability_key",requested);
    const allowedSet=new Set((allowed.data??[]).map(row=>row.capability_key));
    if(requested.some(cap=>!allowedSet.has(cap)))return NextResponse.json({ok:false,error:"One or more requested capabilities are not supported by this integration."},{status:400});
  }
  const displayName=String(body.displayName??resourceRef).trim().slice(0,240);
  const resourceType=String(body.resourceType??integration.data.provider_key).trim();
  const result=await auth.supabase.from("project_connection_bindings").upsert({organization_id:auth.organizationId,project_id:projectId,integration_id:integrationId,resource_type:resourceType,resource_ref:resourceRef,display_name:displayName,permission_scope:{capabilities:requested},access_status:"connected",recommendation_level:"confirmed",confirmed_by_user_id:auth.user.id,confirmed_at:new Date().toISOString(),updated_at:new Date().toISOString()},{onConflict:"project_id,integration_id,resource_ref"}).select("id").single();
  if(result.error)return NextResponse.json({ok:false,error:"Project connection could not be attached."},{status:500});
  // Publish only non-secret connection metadata into shared Project Knowledge so agents can name
  // exact capability keys in proposals instead of inventing permissions or asking repeatedly.
  await auth.supabase.from("project_context_documents").upsert({
    organization_id:auth.organizationId,
    project_id:projectId,
    context_type:"project_connection",
    title:`Project connection · ${result.data.id}`,
    summary:`Confirmed ${integration.data.provider_key} connection for ${displayName}. Resource: ${resourceRef}. Allowed capabilities: ${requested.length?requested.join(", "):"none explicitly granted"}.`,
    source_name:"RYTHM Project Connections",
    evidence:{binding_id:result.data.id,integration_id:integrationId,provider:integration.data.provider_key,resource_type:resourceType,resource_ref:resourceRef,display_name:displayName,capabilities:requested},
    status:"validated",
    confidence:1,
  },{onConflict:"project_id,title"});
  await auth.supabase.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:"project.connection.attached",object_type:"project",object_id:projectId,risk_level:"low",payload:{binding_id:result.data.id,provider:integration.data.provider_key,resource_ref:resourceRef,capabilities:requested}});
  return NextResponse.json({ok:true,bindingId:result.data.id});
}
