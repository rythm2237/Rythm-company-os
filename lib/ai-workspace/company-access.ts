import type { SupabaseClient } from "@supabase/supabase-js";
import { AIWorkspaceError } from "@/lib/ai-workspace/service";

type PersonalContext={wallet:{id:string;currency:string};account:{allowed_modes:string[];allowed_prompt_profiles:string[]}};
export async function resolveRegisteredUsagePayer(client:SupabaseClient,organizationId:string,userId:string,personal:PersonalContext){
  const access=await client.from("aiw_company_member_access").select("role_label,billing_source,allowed_modes,allowed_prompt_profiles,allowed_models,enabled").eq("organization_id",organizationId).eq("user_id",userId).maybeSingle();
  if(access.error)throw new AIWorkspaceError("COMPANY_AI_ACCESS_LOOKUP_FAILED",503);
  if(!access.data?.enabled)return{walletId:personal.wallet.id,currency:personal.wallet.currency,payerType:"personal" as const,roleLabel:null,allowedModes:personal.account.allowed_modes,allowedPromptProfiles:personal.account.allowed_prompt_profiles,allowedModels:[] as string[]};
  const walletLookup=await client.from("usage_wallets").select("id,currency,status").eq("organization_id",organizationId).eq("payer_type","company").maybeSingle();
  if(walletLookup.error)throw new AIWorkspaceError("COMPANY_WALLET_LOOKUP_FAILED",503);
  let wallet=walletLookup.data;
  if(!wallet){const created=await client.from("usage_wallets").insert({organization_id:organizationId,payer_type:"company",currency:"USD",status:"active"}).select("id,currency,status").single();if(created.error){const retry=await client.from("usage_wallets").select("id,currency,status").eq("organization_id",organizationId).eq("payer_type","company").maybeSingle();if(retry.error||!retry.data)throw new AIWorkspaceError("COMPANY_WALLET_CREATE_FAILED",503);wallet=retry.data;}else wallet=created.data;}
  if(wallet.status!=="active")throw new AIWorkspaceError("COMPANY_WALLET_DISABLED",403);
  return{walletId:wallet.id,currency:wallet.currency,payerType:"company" as const,roleLabel:access.data.role_label,allowedModes:access.data.allowed_modes as string[],allowedPromptProfiles:access.data.allowed_prompt_profiles as string[],allowedModels:access.data.allowed_models as string[]};
}
