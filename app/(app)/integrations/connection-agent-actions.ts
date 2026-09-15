"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";
import { controlConnectionSetupSession, dispatchConnectionSetupSessions, explainConnectionSetupQuestion, startConnectionSetupAgent } from "@/lib/integrations/connection-setup-agent";
import { getCanonicalSetupPlan } from "@/lib/integrations/connections/setup-plans";

const COOKIE_PREFIX = "rythm_connection_resume_";
function text(value: FormDataEntryValue | null) { return String(value ?? "").trim(); }
function setupUrl(id:string,projectId:string,key:"message"|"error"|"agentAnswer",message:string,live=false){const query=new URLSearchParams({[key]:message});if(projectId)query.set("project",projectId);if(live)query.set("live","1");return `/integrations/${encodeURIComponent(id)}/setup?${query.toString()}`;}
function cookieName(sessionId:string){return `${COOKIE_PREFIX}${sessionId.replace(/[^a-zA-Z0-9_-]/g,"")}`;}
function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
function secureEqual(left:string,right:string){const a=Buffer.from(left);const b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);}

export async function startCustomerConnectionAgent(formData:FormData){
  const context=await requireActiveOwnerOrganizationContext();
  const integrationId=text(formData.get("integrationId"));const projectId=text(formData.get("projectId"));
  if(!integrationId)redirect("/integrations?error=Connection%20is%20required.");
  const connection=await context.supabase.from("organization_integrations").select("id").eq("id",integrationId).eq("organization_id",context.organizationId).maybeSingle();
  if(!connection.data)redirect(setupUrl(integrationId,projectId,"error","Connection not found."));
  let message="AI setup started.";
  try{
    const service=createExecutionServiceClient();
    const started=await startConnectionSetupAgent(service,{organizationId:context.organizationId,projectId:projectId||null,connectionId:integrationId,userId:context.user.id});
    const jar=await cookies();
    jar.set(cookieName(started.sessionId),started.resumeToken,{httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"strict",path:`/integrations/${integrationId}/setup`,maxAge:10*60});
    await dispatchConnectionSetupSessions(service,{limit:2});
    revalidatePath(`/integrations/${integrationId}/setup`);
    message=started.resumed?"AI setup session resumed.":"AI setup started.";
  }catch(error){
    redirect(setupUrl(integrationId,projectId,"error",error instanceof Error?error.message:"AI setup could not be started."));
  }
  redirect(setupUrl(integrationId,projectId,"message",message,true));
}

export async function controlCustomerConnectionAgent(formData:FormData){
  const context=await requireActiveOwnerOrganizationContext();
  const integrationId=text(formData.get("integrationId"));const projectId=text(formData.get("projectId"));const sessionId=text(formData.get("sessionId"));
  const command=text(formData.get("command")) as "take_control"|"return_control"|"pause"|"resume"|"stop";
  if(!integrationId||!sessionId||!["take_control","return_control","pause","resume","stop"].includes(command))redirect(setupUrl(integrationId,projectId,"error","Invalid Connection Agent command.",true));
  let message="Connection Agent updated.";
  try{
    const service=createExecutionServiceClient();const jar=await cookies();const resumeToken=jar.get(cookieName(sessionId))?.value;
    if(command==="take_control"||command==="return_control"){
      if(!resumeToken)throw new Error("A valid short-lived resume token is required for browser control transfer.");
      const stored=await context.supabase.from("integration_setup_sessions").select("resume_token_hash").eq("id",sessionId).eq("organization_id",context.organizationId).maybeSingle();
      const expected=String(stored.data?.resume_token_hash??"");
      const presented=hashToken(resumeToken);
      if(!expected||!secureEqual(expected,presented))throw new Error("The browser control resume token is no longer valid for this setup session.");
    }
    await controlConnectionSetupSession(service,{organizationId:context.organizationId,userId:context.user.id,sessionId,command,resumeToken});
    if(command==="return_control"||command==="resume")await dispatchConnectionSetupSessions(service,{limit:2});
    if(command==="stop")jar.delete(cookieName(sessionId));
    revalidatePath(`/integrations/${integrationId}/setup`);
    message=command==="take_control"?"You have control.":command==="return_control"?"AI resumed.":command==="pause"?"AI setup paused.":command==="resume"?"AI setup resumed.":"AI setup stopped.";
  }catch(error){
    redirect(setupUrl(integrationId,projectId,"error",error instanceof Error?error.message:"Connection Agent command failed.",true));
  }
  redirect(setupUrl(integrationId,projectId,"message",message,command!=="stop"));
}

export async function askCustomerConnectionAgent(formData:FormData){
  const context=await requireActiveOwnerOrganizationContext();
  const integrationId=text(formData.get("integrationId"));const projectId=text(formData.get("projectId"));const question=text(formData.get("question"));const sessionId=text(formData.get("sessionId"));
  if(!question)redirect(setupUrl(integrationId,projectId,"error","Ask a connection setup question first.",true));
  const service=createExecutionServiceClient();
  const connection=await service.from("organization_integrations").select("provider_key").eq("id",integrationId).eq("organization_id",context.organizationId).maybeSingle();
  if(!connection.data)redirect(setupUrl(integrationId,projectId,"error","Connection not found.",true));
  const session=sessionId?await service.from("integration_setup_sessions").select("current_step").eq("id",sessionId).eq("organization_id",context.organizationId).maybeSingle():{data:null};
  const plan=getCanonicalSetupPlan(connection.data.provider_key);const currentStep=plan&&session.data?plan.steps[Number(session.data.current_step)]??null:null;
  const answer=explainConnectionSetupQuestion({question,providerKey:connection.data.provider_key,currentStep,projectReason:projectId?"the resource bound to this RYTHM project":null});
  redirect(setupUrl(integrationId,projectId,"agentAnswer",answer,true));
}
