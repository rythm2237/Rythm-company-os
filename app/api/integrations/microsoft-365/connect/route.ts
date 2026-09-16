import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";

const SCOPES=["openid","profile","email","offline_access","User.Read","Mail.Read","Calendars.Read"];
function credentials(){return{clientId:process.env.MICROSOFT_365_CLIENT_ID?.trim()||process.env.MICROSOFT_CLIENT_ID?.trim()||"",clientSecret:process.env.MICROSOFT_365_CLIENT_SECRET?.trim()||process.env.MICROSOFT_CLIENT_SECRET?.trim()||"",tenant:process.env.MICROSOFT_365_TENANT_ID?.trim()||process.env.MICROSOFT_TENANT_ID?.trim()||"common"};}
function back(request:Request,integrationId:string,message:string){const url=new URL(`/integrations/${integrationId}/setup`,request.url);url.searchParams.set("error",message);return NextResponse.redirect(url,303);}
function sign(payload:{integrationId:string;userId:string;nonce:string;issuedAt:number}){const {clientSecret}=credentials();if(!clientSecret)return null;const encoded=Buffer.from(JSON.stringify(payload),"utf8").toString("base64url");const sig=crypto.createHmac("sha256",clientSecret).update(encoded).digest("base64url");return `${encoded}.${sig}`;}

export async function POST(request:Request){
  const context=await resolveOrganizationContext();if(!context)return NextResponse.redirect(new URL("/login",request.url),303);
  const form=await request.formData();const integrationId=String(form.get("integrationId")??"").trim();
  if(context.role!=="owner"||!isOrganizationEntitlementActive(context.entitlement))return back(request,integrationId,"Owner authorization with an active entitlement is required.");
  if(!integrationId)return back(request,"","Connection is required.");
  const {data:integration}=await context.supabase.from("organization_integrations").select("id,provider_key").eq("id",integrationId).eq("organization_id",context.organizationId).maybeSingle();
  if(!integration||integration.provider_key!=="microsoft_365")return back(request,integrationId,"This Microsoft 365 connection is not valid for the active company.");
  const {clientId,clientSecret,tenant}=credentials();if(!clientId||!clientSecret)return back(request,integrationId,"Microsoft 365 OAuth platform credentials are not configured yet.");
  const state=sign({integrationId,userId:context.user.id,nonce:crypto.randomBytes(24).toString("base64url"),issuedAt:Date.now()});if(!state)return back(request,integrationId,"Microsoft OAuth state could not be created.");
  const verifier=crypto.randomBytes(48).toString("base64url");const challenge=crypto.createHash("sha256").update(verifier).digest("base64url");
  const redirectUri=`${new URL(request.url).origin}/api/integrations/microsoft-365/callback`;
  const url=new URL(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`);url.searchParams.set("client_id",clientId);url.searchParams.set("response_type","code");url.searchParams.set("redirect_uri",redirectUri);url.searchParams.set("response_mode","query");url.searchParams.set("scope",SCOPES.join(" "));url.searchParams.set("state",state);url.searchParams.set("prompt","select_account");url.searchParams.set("code_challenge",challenge);url.searchParams.set("code_challenge_method","S256");
  const now=new Date().toISOString();await context.supabase.from("organization_integrations").update({status:"authorizing",authorization_started_at:now,last_error_at:null,last_error_code:null,last_error_message:null,updated_at:now}).eq("id",integrationId).eq("organization_id",context.organizationId);
  await context.supabase.from("audit_events").insert({organization_id:context.organizationId,actor_type:"user",actor_user_id:context.user.id,event_type:"integration.authorization_started",object_type:"organization_integration",object_id:integrationId,risk_level:"low",payload:{provider_key:"microsoft_365"}});
  const response=NextResponse.redirect(url,303);const opts={httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/api/integrations/microsoft-365",maxAge:10*60};response.cookies.set("rythm_m365_state",state,opts);response.cookies.set("rythm_m365_integration",integrationId,opts);response.cookies.set("rythm_m365_user",context.user.id,opts);response.cookies.set("rythm_m365_pkce",verifier,opts);return response;
}
