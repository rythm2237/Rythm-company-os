import { createHash, randomUUID } from "node:crypto";
import { NextResponse } from "next/server";
import { resolveOwnerApiOrganizationContext } from "@/lib/auth/api-organization-context";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic="force-dynamic";
export const runtime="nodejs";
export const maxDuration=300;

const allowedMimeTypes=new Set([
  "application/pdf","application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet","application/vnd.ms-excel",
  "text/csv","text/plain","application/vnd.openxmlformats-officedocument.presentationml.presentation",
  "image/png","image/jpeg","image/webp"
]);
const legalCategories=new Set(["contract","amendment","nda","statement_of_work"]);
const safeName=(value:string)=>value.normalize("NFKC").replace(/[^a-zA-Z0-9._-]+/g,"-").replace(/-+/g,"-").slice(-160)||"file";

export async function POST(request:Request){
  const auth=await resolveOwnerApiOrganizationContext();
  if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
  const form=await request.formData();
  const projectId=String(form.get("projectId")??"").trim();
  const category=String(form.get("category")??"other").trim().toLowerCase().replace(/\s+/g,"_");
  const files=form.getAll("files").filter((item):item is File=>item instanceof File);
  if(!projectId||!files.length)return NextResponse.json({ok:false,error:"projectId and at least one file are required."},{status:400});
  if(files.length>20)return NextResponse.json({ok:false,error:"Upload at most 20 files per request."},{status:400});
  const owned=await auth.supabase.from("projects").select("id").eq("id",projectId).eq("organization_id",auth.organizationId).maybeSingle();
  if(!owned.data)return NextResponse.json({ok:false,error:"Project not found."},{status:404});
  const service=createServerSupabaseClient();
  if(!service)return NextResponse.json({ok:false,error:"Project file service is unavailable."},{status:503});
  const uploaded:Array<{id:string;fileName:string;category:string}>=[];
  for(const file of files){
    if(file.size<=0||file.size>50*1024*1024)return NextResponse.json({ok:false,error:`${file.name}: file size is outside the 50 MB limit.`},{status:400});
    if(!allowedMimeTypes.has(file.type))return NextResponse.json({ok:false,error:`${file.name}: unsupported file type.`},{status:400});
    const bytes=Buffer.from(await file.arrayBuffer());
    const checksum=createHash("sha256").update(bytes).digest("hex");
    const storagePath=`${auth.organizationId}/${projectId}/${randomUUID()}-${safeName(file.name)}`;
    const stored=await service.storage.from("project-files").upload(storagePath,bytes,{contentType:file.type,upsert:false});
    if(stored.error)return NextResponse.json({ok:false,error:`${file.name}: upload failed.`},{status:500});
    const row=await service.from("project_documents").insert({organization_id:auth.organizationId,project_id:projectId,category,file_name:file.name,storage_path:storagePath,mime_type:file.type,byte_size:file.size,checksum,legal_document:legalCategories.has(category),uploaded_by_user_id:auth.user.id}).select("id").single();
    if(row.error){await service.storage.from("project-files").remove([storagePath]);return NextResponse.json({ok:false,error:`${file.name}: metadata could not be persisted.`},{status:500});}
    uploaded.push({id:row.data.id,fileName:file.name,category});
  }
  await service.from("project_activity_events").insert({organization_id:auth.organizationId,project_id:projectId,event_type:"project.files.added",headline:`${uploaded.length} project file${uploaded.length===1?"":"s"} added`,importance:"normal",metadata:{document_ids:uploaded.map(f=>f.id),category}});
  await service.from("audit_events").insert({organization_id:auth.organizationId,actor_type:"user",actor_user_id:auth.user.id,event_type:"project.files.uploaded",object_type:"project",object_id:projectId,risk_level:"low",payload:{count:uploaded.length,category}});
  return NextResponse.json({ok:true,files:uploaded});
}
