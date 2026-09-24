import "server-only";
import type { ConnectionVerification, DiscoveredResource, ProviderConnectionAdapter } from "../connections/types";

type Json = Record<string, unknown>;

function providerErrorDetail(body: Json) {
  const nested = body.error && typeof body.error === "object" ? body.error as Json : null;
  const code = nested ? text(nested.status) || text(nested.code) : "";
  const message = nested ? text(nested.message) : "";
  const topLevel = text(body.error_description) || (typeof body.error === "string" ? body.error : "");
  return [code, message || topLevel].filter(Boolean).join(": ").slice(0, 320);
}

async function json(url:string, credential:string, init:RequestInit={}){
  const response=await fetch(url,{...init,headers:{Accept:"application/json",Authorization:`Bearer ${credential}`,...init.headers},cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20_000)});
  const body=await response.json().catch(()=>({})) as Json;
  if(!response.ok){
    const detail=providerErrorDetail(body);
    const base=response.status===401?"Provider rejected the OAuth credential":response.status===403?"Provider rejected the requested permission":`Provider verification failed (${response.status})`;
    const error=new Error(detail?`${base}: ${detail}`:`${base}.`) as Error&{status?:number};
    error.status=response.status;
    throw error;
  }
  return body;
}
const list=(value:unknown)=>Array.isArray(value)?value as Json[]:[];
const text=(value:unknown)=>typeof value==="string"?value:"";

function tokenAdapter(providerKey:string, verify:(token:string)=>Promise<ConnectionVerification>):ProviderConnectionAdapter{
  return {providerKey,authorization:"token",verifyCredential:verify,async discoverResources(token){return(await verify(token)).resources;},async healthCheck(token){try{await verify(token);return{healthy:true,code:"verified"};}catch(error){return{healthy:false,code:(error as{status?:number}).status===401?"reauth_required":"provider_error"};}}};
}

const github=tokenAdapter("github",async token=>{const[user,repos]=await Promise.all([json("https://api.github.com/user",token,{headers:{"X-GitHub-Api-Version":"2022-11-28"}}),json("https://api.github.com/user/repos?per_page=100&sort=updated&affiliation=owner,collaborator,organization_member",token,{headers:{"X-GitHub-Api-Version":"2022-11-28"}})]);return{accountRef:text(user.login)||String(user.id??""),grantedScopes:["repository.read"],resources:list(repos).map(repo=>({resourceType:"repository",resourceId:String(repo.id),resourceName:text(repo.full_name)||text(repo.name),metadata:{private:Boolean(repo.private),default_branch:text(repo.default_branch),html_url:text(repo.html_url)}})),detail:{provider_user_id:account.id??null}};});
const vercel=tokenAdapter("vercel",async token=>{const[user,result]=await Promise.all([json("https://api.vercel.com/v2/user",token),json("https://api.vercel.com/v9/projects?limit=100",token)]);const account=(user.user&&typeof user.user==="object"?user.user:{})as Json;return{accountRef:text(account.email)||text(account.username)||String(account.id??""),grantedScopes:["deployment.read"],resources:list(result.projects).map(project=>({resourceType:"project",resourceId:String(project.id),resourceName:text(project.name)||String(project.id),metadata:{framework:text(project.framework),accountId:project.accountId??null}})),detail:{provider_user_id:account.id??null}};});
const supabase=tokenAdapter("supabase",async token=>{const result=await json("https://api.supabase.com/v1/projects",token);const projects=Array.isArray(result)?result as Json[]:list((result as Json).projects);return{accountRef:null,grantedScopes:["project.read"],resources:projects.map(project=>({resourceType:"project",resourceId:text(project.ref)||String(project.id),resourceName:text(project.name)||text(project.ref),metadata:{region:text(project.region),status:text(project.status),organization_id:project.organization_id??null}})),detail:{project_count:projects.length}};});
const cloudflare=tokenAdapter("cloudflare",async token=>{const[verified,zones]=await Promise.all([json("https://api.cloudflare.com/client/v4/user/tokens/verify",token),json("https://api.cloudflare.com/client/v4/zones?per_page=50",token)]);const result=(verified.result&&typeof verified.result==="object"?verified.result:{})as Json;return{accountRef:String(result.id??""),grantedScopes:["zone.read"],resources:list(zones.result).map(zone=>({resourceType:"zone",resourceId:String(zone.id),resourceName:text(zone.name)||String(zone.id),metadata:{status:text(zone.status),account:zone.account??null}})),detail:{token_status:result.status??null}};});
const googleDrive=tokenAdapter("google_drive",async token=>{const about=await json("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,permissionId)",token);const user=(about.user&&typeof about.user==="object"?about.user:{})as Json;const accountRef=text(user.emailAddress)||text(user.permissionId);if(!accountRef)throw new Error("Google Drive verification returned no account identity.");return{accountRef,grantedScopes:["drive.file"],resources:[{resourceType:"google_drive_account",resourceId:text(user.permissionId)||accountRef,resourceName:text(user.displayName)||text(user.emailAddress)||"Google Drive account",metadata:{email_address:text(user.emailAddress)||null,permission_id:text(user.permissionId)||null,access_model:"drive.file"}}],detail:{access_model:"drive.file"}};});

async function googleAdsJson(accessToken:string){
  const token=accessToken.trim();
  if(!token||token.length<20||/\s/.test(token))throw new Error("Google returned an invalid OAuth access token format.");
  const headers=new Headers();
  headers.set("Accept","application/json");
  headers.set("Content-Type","application/json");
  headers.set("Authorization",`Bearer ${token}`);
  const response=await fetch("https://googleads.googleapis.com/v25/customers:listAccessibleCustomers",{method:"GET",headers,cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20_000)});
  const body=await response.json().catch(()=>({})) as Json;
  if(!response.ok){
    const detail=providerErrorDetail(body);
    const base=response.status===401?"Google Ads rejected the OAuth credential":response.status===403?"Google Ads rejected the requested permission":`Google Ads verification failed (${response.status})`;
    const error=new Error(detail?`${base}: ${detail}`:`${base}.`) as Error&{status?:number};
    error.status=response.status;
    throw error;
  }
  return body;
}

const googleAds=tokenAdapter("google_ads",async token=>{const result=await googleAdsJson(token);const names=Array.isArray(result.resourceNames)?result.resourceNames.filter((value):value is string=>typeof value==="string"):[];return{accountRef:names[0]??null,grantedScopes:["adwords"],resources:names.map(name=>{const id=name.replace(/^customers\//,"");return{resourceType:"google_ads_customer",resourceId:id,resourceName:`Google Ads ${id}`,metadata:{resource_name:name,api_version:"v25"}};}),detail:{customer_count:names.length,verification_endpoint:"customers:listAccessibleCustomers",api_version:"v25"}};});
const ahrefs=tokenAdapter("ahrefs",async token=>{
  const result=await json("https://api.ahrefs.com/v3/subscription-info/limits-and-usage",token);
  const info=(result.limits_and_usage&&typeof result.limits_and_usage==="object"?result.limits_and_usage:{})as Json;
  if(!Object.keys(info).length)throw new Error("Ahrefs verification returned no subscription information.");
  return{
    accountRef:null,
    grantedScopes:[],
    resources:[],
    detail:{
      subscription:text(info.subscription)||null,
      api_key_expiration_date:text(info.api_key_expiration_date)||null,
      units_limit_api_key:info.units_limit_api_key??null,
      units_limit_workspace:info.units_limit_workspace??null,
      units_usage_api_key:info.units_usage_api_key??null,
      units_usage_workspace:info.units_usage_workspace??null,
      usage_reset_date:text(info.usage_reset_date)||null,
      verification_endpoint:"subscription-info/limits-and-usage",
    },
  };
});

export const TOKEN_CONNECTION_ADAPTERS:Record<string,ProviderConnectionAdapter>={github,vercel,supabase,cloudflare,google_drive:googleDrive,google_ads:googleAds,ahrefs};
export function getTokenConnectionAdapter(providerKey:string){return TOKEN_CONNECTION_ADAPTERS[providerKey]??null;}

export async function exchangeGoogleOAuthCode(input:{code:string;clientId:string;clientSecret:string;redirectUri:string;codeVerifier:string}){
  const response=await fetch("https://oauth2.googleapis.com/token",{method:"POST",headers:{"Content-Type":"application/x-www-form-urlencoded"},body:new URLSearchParams({code:input.code,client_id:input.clientId,client_secret:input.clientSecret,redirect_uri:input.redirectUri,grant_type:"authorization_code",code_verifier:input.codeVerifier}),cache:"no-store",redirect:"error",signal:AbortSignal.timeout(20_000)});
  const tokens=await response.json().catch(()=>({})) as {access_token?:string;refresh_token?:string;expires_in?:number;scope?:string;token_type?:string;error?:string;error_description?:string};
  if(!response.ok||!tokens.access_token)throw new Error(`Google token exchange failed${tokens.error_description?`: ${tokens.error_description}`:tokens.error?`: ${tokens.error}`:"."}`);
  if(!tokens.refresh_token)throw new Error("Google did not return an offline refresh token. Reconnect and approve access again.");
  return tokens;
}

export async function verifyGoogleDriveAccess(accessToken:string){
  const about=await json("https://www.googleapis.com/drive/v3/about?fields=user(displayName,emailAddress,permissionId)",accessToken);
  const user=(about.user&&typeof about.user==="object"?about.user:{})as Json;
  const accountRef=text(user.emailAddress)||text(user.permissionId);
  if(!accountRef)throw new Error("Google Drive verification returned no account identity.");
  return{accountRef,user:{displayName:text(user.displayName)||null,emailAddress:text(user.emailAddress)||null,permissionId:text(user.permissionId)||null}};
}

export async function verifyGoogleAdsAccess(accessToken:string){return googleAds.verifyCredential(accessToken);}

export async function discoverGoogleResources(providerKey:string,accessToken:string):Promise<DiscoveredResource[]>{
  if(providerKey==="google_search_console"){const result=await json("https://www.googleapis.com/webmasters/v3/sites",accessToken);return list(result.siteEntry).map(site=>({resourceType:"search_console_property",resourceId:text(site.siteUrl),resourceName:text(site.siteUrl),metadata:{permission_level:text(site.permissionLevel)}}));}
  if(providerKey==="google_analytics"){
    const summaries=await json("https://analyticsadmin.googleapis.com/v1beta/accountSummaries?pageSize=200",accessToken);
    const output:DiscoveredResource[]=[];
    for(const summary of list(summaries.accountSummaries)){
      const account=text(summary.account);
      for(const property of list(summary.propertySummaries)){
        const propertyId=text(property.property);
        if(!propertyId)continue;
        output.push({resourceType:"ga4_property",resourceId:propertyId,resourceName:text(property.displayName)||propertyId,metadata:{account,account_name:text(summary.displayName),property_type:text(property.propertyType)}});
      }
    }
    if(output.length)return output;
    const accounts=await json("https://analyticsadmin.googleapis.com/v1beta/accounts?pageSize=200",accessToken);
    for(const account of list(accounts.accounts).slice(0,50)){
      const name=text(account.name);if(!name)continue;
      const properties=await json(`https://analyticsadmin.googleapis.com/v1beta/properties?filter=${encodeURIComponent(`parent:${name}`)}&pageSize=200`,accessToken);
      for(const property of list(properties.properties))output.push({resourceType:"ga4_property",resourceId:text(property.name),resourceName:text(property.displayName)||text(property.name),metadata:{account:name,property_type:text(property.propertyType),time_zone:text(property.timeZone)}});
    }
    return output;
  }
  return[];
}

export async function googleProfile(accessToken:string){return json("https://www.googleapis.com/oauth2/v2/userinfo",accessToken);}
export async function verifyMicrosoftProfile(accessToken:string){return json("https://graph.microsoft.com/v1.0/me?$select=id",accessToken);}
