import crypto from "node:crypto";
import { NextResponse } from "next/server";
import { isOrganizationEntitlementActive, resolveOrganizationContext } from "@/lib/auth/organization-context";

const GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";

function googleCredentials(){
  const clientId=process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim()||process.env.GOOGLE_CLIENT_ID?.trim()||"";
  const clientSecret=process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim()||process.env.GOOGLE_CLIENT_SECRET?.trim()||"";
  return {clientId,clientSecret};
}

function back(request:Request,integrationId:string,message:string){
  const url=new URL(`/integrations/${integrationId}/setup`,request.url);url.searchParams.set("error",message);return NextResponse.redirect(url,303);
}

function sign(payload:{integrationId:string;userId:string;nonce:string;issuedAt:number}){
  const {clientSecret}=googleCredentials();if(!clientSecret)return null;
  const encoded=Buffer.from(JSON.stringify(payload),"utf8").toString("base64url");
  const signature=crypto.createHmac("sha256",clientSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export async function POST(request:Request){
  const context=await resolveOrganizationContext();
  if(!context)return NextResponse.redirect(new URL("/login",request.url),303);
  if(context.role!=="owner"||!isOrganizationEntitlementActive(context.entitlement))return back(request,"","Owner authorization with an active entitlement is required.");
  const form=await request.formData();const integrationId=String(form.get("integrationId")??"").trim();
  if(!integrationId)return back(request,"","Connection is required.");
  const {data:integration}=await context.supabase.from("organization_integrations").select("id,provider_key").eq("id",integrationId).eq("organization_id",context.organizationId).maybeSingle();
  if(!integration||integration.provider_key!=="google_search_console")return back(request,integrationId,"This Google Search Console connection is not valid for the active company.");
  const {clientId,clientSecret}=googleCredentials();if(!clientId||!clientSecret)return back(request,integrationId,"Google OAuth platform credentials are not configured.");
  const state=sign({integrationId,userId:context.user.id,nonce:crypto.randomBytes(24).toString("base64url"),issuedAt:Date.now()});
  if(!state)return back(request,integrationId,"Google OAuth state could not be created.");
  const redirectUri=`${new URL(request.url).origin}/api/integrations/google-search-console/callback`;
  const url=new URL("https://accounts.google.com/o/oauth2/v2/auth");
  url.searchParams.set("client_id",clientId);url.searchParams.set("redirect_uri",redirectUri);url.searchParams.set("response_type","code");
  url.searchParams.set("scope",["openid","email",GSC_SCOPE].join(" "));url.searchParams.set("access_type","offline");url.searchParams.set("prompt","consent");url.searchParams.set("include_granted_scopes","true");url.searchParams.set("state",state);
  const response=NextResponse.redirect(url,303);const opts={httpOnly:true,secure:process.env.NODE_ENV==="production",sameSite:"lax" as const,path:"/api/integrations/google-search-console",maxAge:10*60};
  response.cookies.set("rythm_gsc_customer_state",state,opts);response.cookies.set("rythm_gsc_customer_integration",integrationId,opts);response.cookies.set("rythm_gsc_customer_user",context.user.id,opts);
  return response;
}
