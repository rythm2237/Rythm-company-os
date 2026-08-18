"use server";

import { randomUUID } from "crypto";
import { redirect } from "next/navigation";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";

type ProposedDepartment = { key: string; name: string; description: string };
type ProposedAgent = {
  role_code: string; name: string; role: string; department_key: string; purpose: string;
  authority_level: number; risk_ceiling: "low" | "medium" | "high"; responsibilities: string[]; skills: string[];
};

function splitList(value: FormDataEntryValue | null) {
  return String(value ?? "").split(/[,\n]/).map((item) => item.trim()).filter(Boolean).slice(0, 20);
}
function normalizeAuthority(value: string) { const parsed=Number(value); return Number.isFinite(parsed)?Math.min(4,Math.max(0,Math.trunc(parsed))):1; }
function clean(value: FormDataEntryValue | null, max=5000) { return String(value ?? "").trim().slice(0,max); }
function safeFilename(value: string) { return value.normalize("NFKC").replace(/[^a-zA-Z0-9._()\- ]+/g,"-").replace(/\s+/g,"-").slice(0,140) || "company-knowledge"; }
function validCategory(value: string) {
  const allowed=["general","brand","people","contact","product","service","process","operations","analytics","finance","sales","legal","website","other"];
  return allowed.includes(value)?value:"general";
}
function validConfidentiality(value: string) {
  return ["public","internal","confidential","restricted"].includes(value)?value:"internal";
}

function createProposal(companyType: string, services: string[], capabilities: string[], authority: number) {
  const departments: ProposedDepartment[] = [
    { key:"strategy", name:"Strategy", description:"Company direction, planning and cross-functional synthesis." },
    { key:"operations", name:"Operations", description:"Internal execution planning, process coordination and action follow-through." },
    { key:"delivery", name:"Customer & Delivery", description:"Requirement intake, service delivery coordination and quality control." },
    { key:"analytics", name:"Analytics", description:"Measurement, evidence review and performance interpretation." },
  ];
  const serviceContext=services.length?services.join(", "):companyType;
  const capabilityContext=capabilities.length?capabilities.join(", "):"general business operations";
  const agents: ProposedAgent[] = [
    { role_code:"STRATEGY_ANALYST", name:"Strategy Analyst", role:"Strategy Analyst", department_key:"strategy", purpose:`Develop governed strategy for ${serviceContext}.`, authority_level:Math.min(authority,2), risk_ceiling:"medium", responsibilities:["Analyze company goals","Develop strategic options","Surface assumptions and trade-offs"], skills:["Strategy","Business analysis","Structured reasoning"] },
    { role_code:"OPERATIONS_ANALYST", name:"Operations Analyst", role:"Operations Analyst", department_key:"operations", purpose:`Translate approved direction into operational plans for ${capabilityContext}.`, authority_level:Math.min(authority,2), risk_ceiling:"medium", responsibilities:["Develop execution plans","Track operational dependencies","Create governed action recommendations"], skills:["Operations planning","Process analysis","Prioritization"] },
    { role_code:"DELIVERY_MANAGER", name:"Delivery Manager", role:"Delivery Manager", department_key:"delivery", purpose:`Structure requirements and coordinate delivery for ${serviceContext}.`, authority_level:Math.min(authority,1), risk_ceiling:"medium", responsibilities:["Structure requirements","Coordinate internal handoffs","Track delivery gaps"], skills:["Requirements analysis","Coordination","Quality control"] },
    { role_code:"ANALYTICS_SPECIALIST", name:"Analytics Specialist", role:"Analytics Specialist", department_key:"analytics", purpose:"Define measurement approaches and interpret available evidence without inventing data.", authority_level:Math.min(authority,1), risk_ceiling:"medium", responsibilities:["Define KPIs","Assess data quality","Interpret performance evidence"], skills:["Analytics","Measurement design","Evidence assessment"] },
  ];
  return { departments, agents };
}

export async function addCompanyKnowledgeText(formData: FormData) {
  const context=await requireActiveOwnerOrganizationContext();
  const title=clean(formData.get("title"),180);
  const content=clean(formData.get("content"),50000);
  if (!title || !content) redirect("/studio/builder?error=Knowledge%20title%20and%20text%20are%20required.");
  const { error }=await context.supabase.from("company_knowledge").insert({
    organization_id:context.organizationId, title, content, source_type:"text",
    category:validCategory(clean(formData.get("category"),30)), confidentiality:validConfidentiality(clean(formData.get("confidentiality"),30)),
    allowed_departments:splitList(formData.get("allowedDepartments")), allowed_role_keywords:splitList(formData.get("allowedRoles")), transferable:false,
  });
  if (error) redirect("/studio/builder?error=Company%20knowledge%20could%20not%20be%20saved.");
  redirect("/studio/builder?message=Company%20knowledge%20saved.%20Relevant%20Agents%20will%20use%20it%20automatically.");
}

function htmlToText(html: string) {
  return html.replace(/<script[\s\S]*?<\/script>/gi," ").replace(/<style[\s\S]*?<\/style>/gi," ").replace(/<[^>]+>/g," ").replace(/&nbsp;/g," ").replace(/&amp;/g,"&").replace(/&#39;/g,"'").replace(/&quot;/g,'"').replace(/\s+/g," ").trim();
}

export async function addCompanyKnowledgeUrl(formData: FormData) {
  const context=await requireActiveOwnerOrganizationContext();
  const urlText=clean(formData.get("url"),2000);
  let url: URL;
  try { url=new URL(urlText); if (!/^https?:$/.test(url.protocol)) throw new Error(); } catch { redirect("/studio/builder?error=Enter%20a%20valid%20http%20or%20https%20URL."); }
  try {
    const response=await fetch(url!.toString(),{redirect:"follow",signal:AbortSignal.timeout(12000),headers:{"user-agent":"RYTHM-Company-Knowledge/1.0"}});
    if (!response.ok) throw new Error("fetch");
    const contentType=response.headers.get("content-type")?.split(";")[0] || "text/html";
    if (contentType.startsWith("image/") || contentType==="application/pdf") {
      const bytes=Buffer.from(await response.arrayBuffer());
      if (bytes.length>15*1024*1024) throw new Error("size");
      const filename=safeFilename(url!.pathname.split("/").filter(Boolean).pop() || "reference");
      const storagePath=`${context.organizationId}/${randomUUID()}-${filename}`;
      const { error: uploadError }=await context.supabase.storage.from("company-knowledge").upload(storagePath,bytes,{contentType,upsert:false});
      if (uploadError) throw uploadError;
      const { error }=await context.supabase.from("company_knowledge").insert({ organization_id:context.organizationId,title:clean(formData.get("title"),180)||filename,category:validCategory(clean(formData.get("category"),30)||"brand"),source_type:"url",source_url:url!.toString(),storage_path:storagePath,mime_type:contentType,content:`Reference asset imported from ${url!.toString()}`,confidentiality:validConfidentiality(clean(formData.get("confidentiality"),30)),allowed_role_keywords:splitList(formData.get("allowedRoles")),allowed_departments:splitList(formData.get("allowedDepartments")),transferable:false });
      if (error) throw error;
    } else {
      const raw=(await response.text()).slice(0,250000);
      const snapshot=htmlToText(raw).slice(0,50000);
      const { error }=await context.supabase.from("company_knowledge").insert({ organization_id:context.organizationId,title:clean(formData.get("title"),180)||url!.hostname,category:validCategory(clean(formData.get("category"),30)||"website"),source_type:"url",source_url:url!.toString(),mime_type:contentType,content:snapshot||`Website reference: ${url!.toString()}`,confidentiality:validConfidentiality(clean(formData.get("confidentiality"),30)),allowed_role_keywords:splitList(formData.get("allowedRoles")),allowed_departments:splitList(formData.get("allowedDepartments")),transferable:false });
      if (error) throw error;
    }
  } catch (error) {
    console.error("company_knowledge_url_failed",{organizationId:context.organizationId,url:urlText,error});
    redirect("/studio/builder?error=The%20URL%20could%20not%20be%20imported.%20You%20can%20add%20the%20same%20information%20as%20text%20or%20file.");
  }
  redirect("/studio/builder?message=Website%20or%20reference%20imported%20into%20Company%20Knowledge.");
}

export async function uploadCompanyKnowledgeFile(formData: FormData) {
  const context=await requireActiveOwnerOrganizationContext();
  const file=formData.get("file");
  if (!(file instanceof File) || file.size<=0) redirect("/studio/builder?error=Choose%20a%20file%20to%20upload.");
  if (file.size>15*1024*1024) redirect("/studio/builder?error=Company%20Knowledge%20files%20must%20be%2015%20MB%20or%20smaller.");
  const filename=safeFilename(file.name);
  const mimeType=file.type||"application/octet-stream";
  const storagePath=`${context.organizationId}/${randomUUID()}-${filename}`;
  const bytes=Buffer.from(await file.arrayBuffer());
  const { error: storageError }=await context.supabase.storage.from("company-knowledge").upload(storagePath,bytes,{contentType:mimeType,upsert:false});
  if (storageError) redirect("/studio/builder?error=Company%20Knowledge%20file%20upload%20failed.");
  let extracted=`Reference file: ${file.name} (${mimeType}, ${file.size} bytes). The original private file is available to authorized Agents.`;
  if (/^(text\/|application\/(json|xml))/.test(mimeType) || /\.(csv|txt|md|json|xml)$/i.test(file.name)) extracted=bytes.toString("utf8").slice(0,50000);
  const { error }=await context.supabase.from("company_knowledge").insert({ organization_id:context.organizationId,title:clean(formData.get("title"),180)||file.name.slice(0,180),category:validCategory(clean(formData.get("category"),30)),source_type:"file",content:extracted,storage_path:storagePath,mime_type:mimeType,confidentiality:validConfidentiality(clean(formData.get("confidentiality"),30)),allowed_role_keywords:splitList(formData.get("allowedRoles")),allowed_departments:splitList(formData.get("allowedDepartments")),transferable:false });
  if (error) { await context.supabase.storage.from("company-knowledge").remove([storagePath]); redirect("/studio/builder?error=Company%20Knowledge%20metadata%20could%20not%20be%20saved."); }
  redirect("/studio/builder?message=File%20added%20to%20Company%20Knowledge.%20Relevant%20Agents%20can%20use%20it%20automatically.");
}

export async function archiveCompanyKnowledge(formData: FormData) {
  const context=await requireActiveOwnerOrganizationContext();
  const id=clean(formData.get("knowledgeId"),80);
  if (id) await context.supabase.from("company_knowledge").update({status:"archived",updated_at:new Date().toISOString()}).eq("id",id).eq("organization_id",context.organizationId);
  redirect("/studio/builder?message=Knowledge%20item%20archived.%20Agents%20will%20stop%20receiving%20it.");
}

export async function createCompanyBuilderDraft(formData: FormData) {
  const context=await requireActiveOwnerOrganizationContext();
  if (!context.entitlement.company_builder_enabled) redirect("/studio/builder?error=Company%20Builder%20is%20not%20enabled%20for%20this%20organization.");
  const companyName=clean(formData.get("companyName"),120), companyType=clean(formData.get("companyType"),180), businessModel=clean(formData.get("businessModel"),300), companySizeIntent=clean(formData.get("companySizeIntent"),50), preferredLanguage=clean(formData.get("preferredLanguage"),80)||"English";
  const authority=normalizeAuthority(clean(formData.get("desiredAiAuthority"),10));
  const primaryServices=splitList(formData.get("primaryServices")), requiredCapabilities=splitList(formData.get("requiredCapabilities"));
  if (companyName.length<2 || companyType.length<2) redirect("/studio/builder?error=Enter%20a%20valid%20company%20name%20and%20company%20type.");
  const proposal=createProposal(companyType,primaryServices,requiredCapabilities,authority);
  const { data,error }=await context.supabase.from("company_builder_drafts").insert({organization_id:context.organizationId,created_by_user_id:context.user.id,company_name:companyName,company_type:companyType,primary_services:primaryServices,business_model:businessModel||"Not specified",company_size_intent:companySizeIntent||"Lean",required_capabilities:requiredCapabilities,desired_ai_authority:authority,preferred_language:preferredLanguage,proposed_structure:proposal,status:"reviewed"}).select("id").single();
  if (error||!data?.id) { console.error("company_builder_draft_create_failed",{organizationId:context.organizationId,error}); redirect("/studio/builder?error=Company%20proposal%20could%20not%20be%20created."); }
  redirect(`/studio/builder?draft=${encodeURIComponent(String(data.id))}&message=Company%20proposal%20created.%20Review%20it%20before%20building.`);
}

export async function buildCompanyFromDraft(formData: FormData) {
  const context=await requireActiveOwnerOrganizationContext();
  const draftId=clean(formData.get("draftId"),80);
  if (!draftId) redirect("/studio/builder?error=Builder%20draft%20is%20required.");
  const { data,error }=await context.supabase.rpc("build_company_from_draft",{target_draft_id:draftId});
  if (error) { console.error("company_builder_build_failed",{organizationId:context.organizationId,draftId,error}); redirect(`/studio/builder?draft=${encodeURIComponent(draftId)}&error=Company%20build%20could%20not%20be%20completed.`); }
  const result=data as {agents_created?:number;departments_created?:number}|null;
  const message=`Company built with ${result?.departments_created??0} departments and ${result?.agents_created??0} AI Agents. Company Knowledge is attached live at runtime; Agents start paused and external actions remain disabled.`;
  redirect(`/command-center?message=${encodeURIComponent(message)}`);
}
