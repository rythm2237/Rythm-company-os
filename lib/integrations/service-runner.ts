import { createClient } from "@supabase/supabase-js";
import { executeProviderCapability } from "@/lib/integrations/provider-executors";

function serviceClient() {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) throw new Error("Integration executor service credentials are not configured.");
  return createClient(url, key, { auth: { persistSession: false, autoRefreshToken: false } });
}

function safeResult(value: any) {
  if (value == null) return {};
  if (Array.isArray(value)) return { items: value.slice(0, 20).map((item) => safeObject(item)) };
  return safeObject(value);
}
function safeObject(value: any) {
  if (!value || typeof value !== "object") return { value: String(value).slice(0, 1500) };
  const blocked = /token|secret|password|authorization|credential|private[_-]?key|access[_-]?key/i;
  return Object.fromEntries(Object.entries(value).filter(([key]) => !blocked.test(key)).slice(0, 60).map(([key,val]) => [key, typeof val === "string" ? val.slice(0, 2000) : typeof val === "object" && val ? (Array.isArray(val) ? val.slice(0,10) : safeObject(val)) : val]));
}

export async function executeApprovedToolRequest(executionRequestId: string) {
  const supabase = serviceClient();
  const { data: request, error } = await supabase.from("tool_execution_requests").select("id,organization_id,agent_id,integration_id,capability_key,operation,target_ref,input,risk_level,approval_mode,approval_request_id,status,created_at").eq("id",executionRequestId).maybeSingle();
  if (error || !request) throw new Error("Tool execution request not found.");
  if (!["approved"].includes(request.status)) throw new Error(`Tool execution is not approved for execution (status: ${request.status}).`);
  if (request.approval_mode === "human_only" || request.risk_level === "restricted") throw new Error("Human-only or restricted operations cannot be executed by the Agent runner.");
  if (request.approval_mode === "approval_required") {
    if (!request.approval_request_id) throw new Error("Approval link is missing.");
    const { data: approval } = await supabase.from("approval_requests").select("status").eq("id",request.approval_request_id).eq("organization_id",request.organization_id).maybeSingle();
    if (approval?.status !== "approved") throw new Error("Human approval has not been granted.");
  }
  const { data: integration } = await supabase.from("organization_integrations").select("id,organization_id,provider_key,account_ref,base_url,status").eq("id",request.integration_id).eq("organization_id",request.organization_id).maybeSingle();
  if (!integration || integration.status !== "connected") throw new Error("Connected provider is unavailable.");
  const { data: secret, error: secretError } = await supabase.rpc("get_organization_integration_secret_service_v1", { target_integration_id: integration.id });
  if (secretError || !secret) throw new Error("Provider credential is unavailable to the service executor.");

  const started=Date.now();
  await supabase.from("tool_execution_requests").update({status:"running",started_at:new Date().toISOString(),error_code:null}).eq("id",request.id);
  await supabase.from("tool_execution_events").insert({organization_id:request.organization_id,execution_request_id:request.id,event_type:"execution_started",status:"running",safe_detail:{provider:integration.provider_key,capability:request.capability_key}});
  try {
    const result = await executeProviderCapability({ providerKey:integration.provider_key, capabilityKey:request.capability_key, credential:String(secret), accountRef:integration.account_ref, baseUrl:integration.base_url, input:(request.input??{}) as Record<string,any> });
    const latency=Date.now()-started; const safe=safeResult(result);
    await supabase.from("tool_execution_requests").update({status:"succeeded",safe_result:safe,latency_ms:latency,completed_at:new Date().toISOString()}).eq("id",request.id);
    await supabase.from("tool_execution_events").insert({organization_id:request.organization_id,execution_request_id:request.id,event_type:"execution_succeeded",status:"succeeded",safe_detail:{latency_ms:latency}});
    return { ok:true as const, result:safe, latencyMs:latency };
  } catch (executionError) {
    const latency=Date.now()-started; const message=executionError instanceof Error?executionError.message:"Provider execution failed"; const code=message.match(/\((\d{3})\)/)?.[1]||"PROVIDER_EXECUTION_FAILED";
    await supabase.from("tool_execution_requests").update({status:"failed",error_code:code,safe_result:{message:message.slice(0,1000)},latency_ms:latency,completed_at:new Date().toISOString()}).eq("id",request.id);
    await supabase.from("tool_execution_events").insert({organization_id:request.organization_id,execution_request_id:request.id,event_type:"execution_failed",status:"failed",safe_detail:{error_code:code,latency_ms:latency}});
    throw executionError;
  }
}
