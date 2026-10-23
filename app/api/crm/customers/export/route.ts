import {resolveOrganizationContext} from "@/lib/auth/organization-context";
import {customerCsv} from "@/lib/crm/sales";
import {crmResponse} from "@/lib/crm/http";
export const dynamic="force-dynamic";
export async function GET(request:Request) {
 const c=await resolveOrganizationContext();if(!c)return crmResponse({error:"Authentication required"},401);
 if(c.role!=="owner")return crmResponse({error:"Owner export authorization required"},403);
 const page=Math.max(1,Math.min(10000,Math.trunc(Number(new URL(request.url).searchParams.get("page"))||1)));
 const {data,error,count}=await c.supabase.from("crm_accounts").select("id,name,account_type,customer_status,email,phone,industry,country_code,source",{count:"exact"}).eq("organization_id",c.organizationId).order("id").range((page-1)*500,page*500-1);
 if(error)return crmResponse({error:"Export unavailable"},503);
 return new Response(customerCsv(data??[]),{headers:{"Content-Type":"text/csv; charset=utf-8","Content-Disposition":`attachment; filename="customers-page-${page}.csv"`,"Cache-Control":"private, no-store","X-Content-Type-Options":"nosniff","X-Total-Count":String(count??0),"X-Page-Size":"500"}});
}
