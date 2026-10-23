import {resolveOrganizationContext} from "@/lib/auth/organization-context";
import {canCrm} from "@/lib/crm/access";
import {LEAD_FIELDS,leadInput} from "@/lib/crm/sales";
import {crmResponse,crmJson} from "@/lib/crm/http";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
 const c=await resolveOrganizationContext();if(!c)return crmResponse({error:"Authentication required"},401);
 const page=Math.max(1,Math.min(10000,Math.trunc(Number(new URL(request.url).searchParams.get("page"))||1)));
 const {data,error,count}=await c.supabase.from("crm_leads").select(LEAD_FIELDS,{count:"exact"}).eq("organization_id",c.organizationId).order("created_at",{ascending:false}).range((page-1)*20,page*20-1);
 return error?crmResponse({error:"Leads unavailable"},503):crmResponse({data,page,count});
}
export async function POST(request:Request) {
 const c=await resolveOrganizationContext();if(!c)return crmResponse({error:"Authentication required"},401);
 if(!await canCrm(c.supabase,c.organizationId,"customer.create"))return crmResponse({error:"Lead creation forbidden"},403);
 let input;try{input=leadInput(await crmJson(request));}catch{return crmResponse({error:"Invalid lead or request origin"},400);}
 const {data,error}=await c.supabase.from("crm_leads").insert({...input,organization_id:c.organizationId}).select("id").single();
 return error?crmResponse({error:"Lead could not be created"},400):crmResponse({data},201);
}
