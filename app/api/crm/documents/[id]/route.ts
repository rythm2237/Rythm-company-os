import { NextResponse } from "next/server";
import { resolveOrganizationContext } from "@/lib/auth/organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";
export const dynamic="force-dynamic";
export async function GET(_request:Request,{params}:{params:Promise<{id:string}>}) {
 const context=await resolveOrganizationContext();if(!context)return NextResponse.json({error:"Authentication required"},{status:401});
 const {id}=await params;if(!/^[a-f0-9-]{36}$/i.test(id))return NextResponse.json({error:"Document unavailable"},{status:404});
 // Caller-bound RLS before any privileged object download, including metadata.
 const {data:doc,error}=await context.supabase.from("project_documents").select("id,file_name,mime_type,storage_path,confidentiality,contract_id,project_id").eq("organization_id",context.organizationId).eq("id",id).maybeSingle();
 if(error||!doc)return NextResponse.json({error:"Document unavailable"},{status:404,headers:{"Cache-Control":"no-store"}});
 if(doc.confidentiality!=="operational"){
  const {error:auditError}=await context.supabase.rpc("crm_log_sensitive_access",{p_organization_id:context.organizationId,p_domain:doc.confidentiality,p_resource_type:doc.contract_id?"contract":"project",p_resource_id:doc.contract_id||doc.project_id});
  if(auditError)return NextResponse.json({error:"Document unavailable"},{status:503,headers:{"Cache-Control":"no-store"}});
 }
 const service=createServerSupabaseClient();if(!service)return NextResponse.json({error:"Document service unavailable"},{status:503});
 const {data:file,error:downloadError}=await service.storage.from("project-files").download(doc.storage_path);
 if(downloadError||!file)return NextResponse.json({error:"Document unavailable"},{status:404});
 return new Response(file.stream(),{headers:{"Content-Type":doc.mime_type||"application/octet-stream","Content-Disposition":`attachment; filename*=UTF-8''${encodeURIComponent(doc.file_name)}`,"Cache-Control":"private, no-store, max-age=0","X-Content-Type-Options":"nosniff"}});
}
