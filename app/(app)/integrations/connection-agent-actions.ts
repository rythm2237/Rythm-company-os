"use server";

import { createHash, timingSafeEqual } from "node:crypto";
import { cookies } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";
import { controlConnectionSetupSession, dispatchConnectionSetupSessions, explainConnectionSetupQuestion, getConnectionSetupBrowserView, startConnectionSetupAgent } from "@/lib/integrations/connection-setup-agent";
import { getComputerUseRuntime } from "@/lib/integrations/computer-use/runtime";
import { getCanonicalSetupPlan } from "@/lib/integrations/connections/setup-plans";

const COOKIE_PREFIX = "rythm_connection_resume_";
function text(value: FormDataEntryValue | null) { return String(value ?? "").trim(); }
function setupUrl(id:string,projectId:string,key:"message"|"error"|"agentAnswer",message:string,live=false){const query=new URLSearchParams({[key]:message});if(projectId)query.set("project",projectId);if(live)query.set("live","1");return `/integrations/${encodeURIComponent(id)}/setup?${query.toString()}`;}
function cookieName(sessionId:string){return `${COOKIE_PREFIX}${sessionId.replace(/[^a-zA-Z0-9_-]/g,"")}`;}
function hashToken(token:string){return createHash("sha256").update(token).digest("hex");}
function secureEqual(left:string,right:string){const a=Buffer.from(left);const b=Buffer.from(right);return a.length===b.length&&timingSafeEqual(a,b);}
function providerAuthorizationError(rawUrl:string|null|undefined){
  if(!rawUrl)return null;
  try{
    const url=new URL(rawUrl);
    if(url.hostname.endsWith("google.com")&&(url.pathname.includes("/signin/oauth/error")||url.pathname.includes("/oauth/error")))return "Google rejected this authorization request. Update the Google Auth Platform audience/verification settings, then restart the connection.";
    if(url.hostname.endsWith("microsoftonline.com")&&(/error/i.test(url.pathname)||url.searchParams.has("error")))return "Microsoft rejected this authorization request. Update the Microsoft application consent configuration, then restart the connection.";
  }catch{/* ignore malformed provider URL */}
  return null;
}

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
    if(command==="return_control"){
      const browser=await getConnectionSetupBrowserView(service,{organizationId:context.organizationId,sessionId});
      const providerError=providerAuthorizationError(browser?.currentUrl);
      if(providerError){
        const session=await service.from("integration_setup_sessions").select("provider_key,connection_id,project_id,correlation_id,browser_session_id").eq("id",sessionId).eq("organization_id",context.organizationId).maybeSingle();
        const timestamp=new Date().toISOString();
        const runtime=getComputerUseRuntime();
        if(session.data?.browser_session_id&&runtime.available)await runtime.closeSession(String(session.data.browser_session_id)).catch(()=>undefined);
        await service.from("integration_setup_sessions").update({session_status:"failed",step_status:"failed",failed_at:timestamp,failure_reason:providerError,control_mode:"paused",requires_user_action:false,user_action_required:false,user_action_type:null,human_takeover_reason:null,last_heartbeat_at:timestamp,updated_at:timestamp}).eq("id",sessionId).eq("organization_id",context.organizationId);
        await service.from("organization_integrations").update({status:"setup_required",last_error_at:timestamp,last_error_code:"provider_authorization_rejected",last_error_message:providerError,updated_at:timestamp}).eq("id",integrationId).eq("organization_id",context.organizationId);
        if(session.data){
          await service.from("connection_setup_session_events").insert({organization_id:context.organizationId,project_id:session.data.project_id??null,connection_id:integrationId,session_id:sessionId,provider_key:session.data.provider_key,event_type:"provider.authorization.rejected",actor_type:"provider",status:"failed",safe_message:providerError,result_code:"provider_authorization_rejected",correlation_id:session.data.correlation_id,metadata:{}});
          await service.from("audit_events").insert({organization_id:context.organizationId,actor_type:"system",event_type:"provider.authorization.rejected",object_type:"connection_setup_session",object_id:sessionId,risk_level:"low",payload:{agent_key:"connection_setup_agent",connection_id:integrationId,provider_key:session.data.provider_key,project_id:session.data.project_id??null,correlation_id:session.data.correlation_id,result_code:"provider_authorization_rejected"}});
        }
        jar.delete(cookieName(sessionId));
        revalidatePath(`/integrations/${integrationId}/setup`);
        throw new Error(providerError);
      }
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
