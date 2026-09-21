import { NextResponse } from "next/server";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { ensurePersonalWorkspace, serviceClient, walletBalance } from "@/lib/ai-workspace/service";
import { resolveRegisteredUsagePayer } from "@/lib/ai-workspace/company-access";
import { resolveOrganizationContext } from "@/lib/auth/organization-context";
export const dynamic="force-dynamic";
const catalog=[["github","GitHub","Development"],["vercel","Vercel","Development"],["supabase","Supabase","Development"],["gmail","Gmail","Productivity"],["google_drive","Google Drive","Productivity"],["google_calendar","Google Calendar","Productivity"],["outlook","Outlook","Productivity"],["slack","Slack","Communication"],["microsoft_teams","Microsoft Teams","Communication"],["notion","Notion","Data / Workspace"],["airtable","Airtable","Data / Workspace"],["stripe","Stripe","Business"],["hubspot","HubSpot","Business"]] as const;
export async function GET(){try{
  const auth=await createAuthServerClient();
  const{data:{user}}=await auth.auth.getUser();
  if(!user)return NextResponse.json({error:"AUTH_REQUIRED"},{status:401});
  const client=serviceClient();
  const personal=await ensurePersonalWorkspace(user.id,client);
  const org=await resolveOrganizationContext();
  const payer=org?await resolveRegisteredUsagePayer(client,org.organizationId,user.id,personal):{walletId:personal.wallet.id,currency:personal.wallet.currency,payerType:"personal" as const,roleLabel:null,allowedModes:personal.account.allowed_modes as string[],allowedPromptProfiles:personal.account.allowed_prompt_profiles as string[],allowedModels:[] as string[]};
  const balance=await walletBalance(payer.walletId,client);
  const region=String(org?.organization.country_code??"").toUpperCase()==="IR"?"IR":"INTL";
  const[conversationsResult,projectsResult,integrationsResult,providersResult,planResult,planCatalogResult,planPricesResult]=await Promise.all([
    client.from("aiw_conversations").select("id,title,project_id,updated_at").eq("workspace_id",personal.workspace.id).eq("archived",false).order("updated_at",{ascending:false}).limit(50),
    client.from("aiw_projects").select("id,name,description").eq("workspace_id",personal.workspace.id).eq("archived",false).order("created_at"),
    org?client.from("organization_integrations").select("provider_key,status,enabled").eq("organization_id",org.organizationId):Promise.resolve({data:[],error:null}),
    client.from("integration_providers").select("provider_key,enabled,setup_availability,kill_switch"),
    client.from("aiw_accounts").select("plan_code,plan_region,plan_status,plan_period_start,plan_period_end,plan_credit_limit_micros,plan_request_limit").eq("id",personal.account.id).maybeSingle(),
    client.from("aiw_plan_catalog").select("plan_code,display_name,allowed_modes,allowed_prompt_profiles,sort_order,most_popular").eq("active",true).order("sort_order"),
    client.from("aiw_plan_prices").select("plan_code,region_code,currency,price_amount,billing_interval,fast_token_equivalent,smart_token_equivalent,payment_provider,checkout_enabled").eq("region_code",region)
  ]);
  const connected=new Map((integrationsResult.data??[]).map((row:{provider_key:string;status:string;enabled:boolean})=>[row.provider_key,row]));
  const providers=new Map((providersResult.data??[]).map((row:{provider_key:string;enabled:boolean;setup_availability:string;kill_switch:boolean})=>[row.provider_key,row]));
  const plugins=catalog.map(([key,name,category])=>{const connection=connected.get(key),provider=providers.get(key);let status:"Connected"|"Available"|"Coming soon"|"Admin setup required"|"Disabled"="Coming soon";if(connection?.enabled&&connection.status==="connected")status="Connected";else if(provider?.kill_switch||provider?.enabled===false)status="Disabled";else if(provider?.enabled&&provider.setup_availability==="available")status="Available";else if(provider?.enabled&&provider.setup_availability==="setup_available")status="Admin setup required";else if(provider?.setup_availability==="coming_later")status="Coming soon";else if(provider)status="Admin setup required";return{key,name,category,status};});
  const prices=new Map((planPricesResult.data??[]).map((row:any)=>[row.plan_code,row]));
  const plans=(planCatalogResult.data??[]).map((row:any)=>{const price=prices.get(row.plan_code) as any;return price?{planCode:row.plan_code,displayName:row.display_name,modes:row.allowed_modes,promptProfiles:row.allowed_prompt_profiles,sortOrder:row.sort_order,mostPopular:row.most_popular,region:price.region_code,currency:price.currency,priceAmount:Number(price.price_amount),billingInterval:price.billing_interval,fastTokens:Number(price.fast_token_equivalent),smartTokens:Number(price.smart_token_equivalent),paymentProvider:price.payment_provider,checkoutEnabled:Boolean(price.checkout_enabled)}:null;}).filter(Boolean);
  return NextResponse.json({user:{id:user.id,email:user.email??null},workspace:personal.workspace,defaultProject:personal.project,projects:projectsResult.data??[],conversations:conversationsResult.data??[],balanceMicros:balance,currency:payer.currency,payerType:payer.payerType,companyRoleLabel:payer.roleLabel,modes:payer.allowedModes,promptProfiles:payer.allowedPromptProfiles,maxRequestMicros:personal.account.max_request_micros,plan:planResult.data??null,pricingRegion:region,plans,organization:org?{id:org.organizationId,name:org.organization.name,role:org.role,countryCode:org.organization.country_code??null}:null,plugins});
}catch(error){console.error("ai_workspace_session_failed",error);return NextResponse.json({error:"AI_WORKSPACE_UNAVAILABLE"},{status:503});}}
