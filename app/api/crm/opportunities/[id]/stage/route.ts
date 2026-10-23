import {resolveOrganizationContext} from "@/lib/auth/organization-context";
import {UUID} from "@/lib/crm/sales";
import {crmResponse,crmJson} from "@/lib/crm/http";
export const dynamic="force-dynamic";
export async function POST(request:Request,{params}:{params:Promise<{id:string}>}) {
 const c=await resolveOrganizationContext();if(!c)return crmResponse({error:"Authentication required"},401);
 const {id}=await params;if(!UUID.test(id))return crmResponse({error:"Opportunity unavailable"},404);
 let input;try{input=await crmJson(request);if(typeof input.stage!=="string"||!/^[a-z][a-z0-9_]{0,39}$/.test(input.stage)||!Number.isInteger(input.version)||Number(input.version)<1||input.lost_reason!=null&&typeof input.lost_reason!=="string"||String(input.lost_reason||"").length>2000)throw Error();}catch{return crmResponse({error:"Invalid transition or request origin"},400);}
 // Explicit company binding before a caller-bound RLS RPC. No service-role client.
 const {data,error:lookupError}=await c.supabase.from("crm_opportunities").select("id").eq("organization_id",c.organizationId).eq("id",id).maybeSingle();
 if(lookupError||!data)return crmResponse({error:"Opportunity unavailable"},404);
 const {error}=await c.supabase.rpc("crm_move_opportunity",{p_opportunity_id:id,p_stage_code:input.stage,p_version:input.version,p_lost_reason:input.lost_reason||null});
 if(error)return crmResponse({error:"Transition refused. Refresh, check permissions and supply a loss reason for Lost."},409);
 return crmResponse({saved:true});
}
