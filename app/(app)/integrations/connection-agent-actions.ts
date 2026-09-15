"use server";

import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";
import { controlConnectionSetupSession, dispatchConnectionSetupSessions, explainConnectionSetupQuestion, startConnectionSetupAgent } from "@/lib/integrations/connection-setup-agent";
import { getCanonicalSetupPlan } from "@/lib/integrations/connections/setup-plans";

const COOKIE_PREFIX = "rythm_connection_resume_";
function text(value: FormDataEntryValue | null) { return String(value ?? "").trim(); }
function setupUrl(id:string,projectId:string,key:"message"|"error"|"agentAnswer",message:string){const query=new URLSearchParams({[key]:message});if(projectId)query.set("project",projectId);return `/integrations/${encodeURIComponent(id)}/setup?${query.toString()}`;}
function cookieName(sessionId:string){return `${COOKIE_PREFIX}${sessionId.replace(/[^a-zA-Z0-9_-]/g,"")}`;}

export async function startCustomerConnectionAgent(formData:FormData){
  const context=await requireActiveOwnerOrganizationContext();
  const integrationId=text(formData.get("integrationId"));const projectId=text(formData.get("projectId"));
  if(!integrationId)redirect("/integrations?error=Connection%20is%20required.");
  const connection=await context.supabase.from("organization_integrations").select("id").eq("id",integrationId).eq("organization_id",context.organizationId).maybeSingle();
  if(!connection.data)redirect(setupUrl(integrationId,projectId,"error","Connection not found."));
  try{
    const service=createExecutionServiceClient();
    const started=await startConnectionSetupAgent(service,{organizationId:context.organizationId,projectId:projectId||null,connectionId:integrationId,userId:context.user.id});
    const jar=await cookies();
    jar.set(cookieName(started.sessionId),started.resumeToken,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:`/integrations/${integrationId}/setup`,maxAge:10*60});
    await dispatchConnectionSetupSessions(service,{limit:1});
    revalidatePath(`/integrations/${integrationId}/setup`);
    redirect(setupUrl(integrationId,projectId,"message",started.resumed?"AI setup session resumed.":"AI setup started."));
  }catch(error){redirect(setupUrl(integrationId,projectId,"error",error instanceof Error?error.message:"AI setup could not be started."));}
}

export async function controlCustomerConnectionAgent(formData:FormData){
  const context=await requireActiveOwnerOrganizationContext();
  const integrationId=text(formData.get("integrationId"));const projectId=text(formData.get("projectId"));const sessionId=text(formData.get("sessionId"));
  const command=text(formData.get("command")) as "take_control"|"return_control"|"pause"|"resume"|"stop";
  if(!integrationId||!sessionId||!["take_control","return_control","pause","resume","stop"].includes(command))redirect(setupUrl(integrationId,projectId,"error","Invalid Connection Agent command."));
  try{
    const service=createExecutionServiceClient();const jar=await cookies();const resumeToken=jar.get(cookieName(sessionId))?.value;
    await controlConnectionSetupSession(service,{organizationId:context.organizationId,userId:context.user.id,sessionId,command,resumeToken});
    if(command==="return_control"||command==="resume")await dispatchConnectionSetupSessions(service,{limit:1});
    if(command==="stop")jar.delete(cookieName(sessionId));
    revalidatePath(`/integrations/${integrationId}/setup`);
    redirect(setupUrl(integrationId,projectId,"message",command==="take_control"?"You have control.":command==="return_control"?"AI resumed.":command==="pause"?"AI setup paused.":command==="resume"?"AI setup resumed.":"AI setup stopped."));
  }catch(error){redirect(setupUrl(integrationId,projectId,"error",error instanceof Error?error.message:"Connection Agent command failed."));}
}

export async function askCustomerConnectionAgent(formData:FormData){
  const context=await requireActiveOwnerOrganizationContext();
  const integrationId=text(formData.get("integrationId"));const projectId=text(formData.get("projectId"));const question=text(formData.get("question"));const sessionId=text(formData.get("sessionId"));
  if(!question)redirect(setupUrl(integrationId,projectId,"error","Ask a connection setup question first."));
  const service=createExecutionServiceClient();
  const connection=await service.from("organization_integrations").select("provider_key").eq("id",integrationId).eq("organization_id",context.organizationId).maybeSingle();
  if(!connection.data)redirect(setupUrl(integrationId,projectId,"error","Connection not found."));
  const session=sessionId?await service.from("integration_setup_sessions").select("current_step").eq("id",sessionId).eq("organization_id",context.organizationId).maybeSingle():{data:null};
  const plan=getCanonicalSetupPlan(connection.data.provider_key);const currentStep=plan&&session.data?plan.steps[Number(session.data.current_step)]??null:null;
  const answer=explainConnectionSetupQuestion({question,providerKey:connection.data.provider_key,currentStep,projectReason:projectId?"the resource bound to this RYTHM project":null});
  redirect(setupUrl(integrationId,projectId,"agentAnswer",answer));
}
