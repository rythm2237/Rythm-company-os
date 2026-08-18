"use server";

import OpenAI from "openai";
import { randomUUID } from "crypto";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { runAgent, type AgentAttachmentInput } from "@/lib/ai/agent-provider";
import { loadCompanyKnowledgeForAgent } from "@/lib/company-knowledge";
import { getRuntimeConfig } from "@/lib/runtime-config";
import type { AgentProvider } from "@/lib/agent-builder";

type ConsoleMessage = { role: "user" | "assistant"; content: string };
export type OutputPreference = "auto" | "text" | "image" | "mockup" | "line-chart" | "bar-chart" | "report";
export type ChartSpec = { type: "line" | "bar"; title: string; xLabel?: string; yLabel?: string; points: Array<{ label: string; value: number }>; insight?: string };
export type UploadedAttachment = { id: string; filename: string; mimeType: string; sizeBytes: number };

type RunConsoleInput = { agentId: string; prompt: string; mode: "chat" | "task"; outputPreference?: OutputPreference; messages?: ConsoleMessage[]; attachmentIds?: string[] };
type AgentRuntimeRow = {
  id:string; name:string; role_title:string; department:string|null; agent_status:string; external_actions_allowed:boolean;
  system_instructions:string|null; runtime_provider:string|null; runtime_model:string|null;
};
type AttachmentRow = { id:string; filename:string; mime_type:string; size_bytes:number; storage_path:string };

const MAX_FILE_BYTES=12*1024*1024;
const MAX_FILES_PER_MESSAGE=4;

function safeMessage(error: unknown) {
  const message=error instanceof Error?error.message:"Agent execution failed.";
  if (/not configured|empty Agent response|request failed|timed out|timeout|not available|image generation|file|attachment|provider|knowledge/i.test(message)) return message;
  return "Agent execution failed. Refresh and try again.";
}
function transcript(messages: ConsoleMessage[] = []) { return messages.slice(-10).map((m)=>`${m.role==="user"?"User":"Agent"}: ${m.content.slice(0,6000)}`).join("\n\n").slice(0,30000); }
function containsAny(value:string,terms:string[]){const lower=value.toLowerCase();return terms.some((term)=>lower.includes(term.toLowerCase()));}
function inferOutputPreference(prompt:string,roleTitle:string,mode:"chat"|"task",attachments:AgentAttachmentInput[]):OutputPreference {
  if(mode==="chat") return "text";
  const p=prompt.toLowerCase(), role=roleTitle.toLowerCase();
  const designerRole=containsAny(role,["design","designer","creative","brand","ui","ux","art","graphic","طراح","گرافیک"]);
  const analystRole=containsAny(role,["analyst","analytics","finance","cfo","data","business intelligence","تحلیل","آنالیز"]);
  const hasImageAttachment=attachments.some((file)=>file.mimeType.startsWith("image/"));
  const hasSpreadsheet=attachments.some((file)=>/\.(xlsx|xls|xlsm|csv)$/i.test(file.filename));
  const visualAction=containsAny(p,["design ","design a","design me","create a design","make a design","show me the design","actual design","generate an image","create an image","make an image","show me an image","generate a visual","render","mockup","mock-up","طراحی کن","طرح بزن","طرح بده","طرح بساز","عکس بساز","تصویر بساز","تصویر بده","رندر کن","موکاپ","یه طرح","یک طرح"]);
  const uiContext=containsAny(p,["landing page","landing-page","hero","website","web page","homepage","app screen","dashboard","interface","ui ","ux ","لندینگ","هیرو","وبسایت","وب سایت","صفحه اصلی","رابط کاربری","داشبورد","business card","کارت ویزیت"]);
  const imageContext=containsAny(p,["image","photo","picture","poster","illustration","visual","artwork","banner","cover","thumbnail","business card","عکس","تصویر","پوستر","بنر","کاور","تصویرسازی","کارت ویزیت"]);
  const referenceLanguage=containsAny(p,["inspired by","based on this","use this reference","reference image","similar to this","با الهام","از این تصویر","از این عکس","نمونه","رفرنس"]);
  const explicitLineChart=containsAny(p,["line chart","line graph","نمودار خطی","چارت خطی"]), explicitBarChart=containsAny(p,["bar chart","bar graph","نمودار میله","چارت میله"]);
  const chartIntent=containsAny(p,["chart","graph","visualize","visualise","trend","over time","growth","نمودار","چارت","روند","رشد"]), reportIntent=containsAny(p,["report","memo","brief","executive summary","گزارش","خلاصه اجرایی"]);
  if(explicitBarChart)return "bar-chart"; if(explicitLineChart)return "line-chart";
  if(designerRole&&visualAction&&uiContext)return "mockup";
  if(designerRole&&visualAction&&(imageContext||hasImageAttachment||referenceLanguage))return "image";
  if(designerRole&&visualAction)return uiContext?"mockup":"image";
  if(visualAction&&uiContext)return "mockup"; if(visualAction||imageContext)return "image";
  if(chartIntent)return "line-chart";
  if(analystRole&&hasSpreadsheet&&containsAny(p,["analyze","analyse","trend","growth","compare","sales","revenue","forecast","kpi","تحلیل","روند","رشد","مقایسه","فروش","درآمد","پیش بینی","پیش‌بینی"]))return "line-chart";
  if(analystRole&&containsAny(p,["sales","revenue","margin","forecast","kpi","month","week","quarter","فروش","درآمد","حاشیه","پیش بینی","پیش‌بینی","ماه","هفته"]))return "line-chart";
  if(reportIntent)return "report"; return "text";
}
function extractJsonObject(value:string){const fenced=value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];const candidate=fenced??value.slice(value.indexOf("{"),value.lastIndexOf("}")+1);return candidate.trim();}
function safeFilename(name:string){const clean=name.normalize("NFKC").replace(/[^a-zA-Z0-9._()\- ]+/g,"-").replace(/\s+/g,"-").slice(0,140);return clean||"attachment";}

async function getAgent(agentId:string){
  const context=await requireActiveOwnerOrganizationContext();
  const {data,error}=await context.supabase.from("agents").select("id,name,role_title,department,agent_status,external_actions_allowed,system_instructions,runtime_provider,runtime_model").eq("id",agentId).eq("organization_id",context.organizationId).maybeSingle();
  if(error||!data)throw new Error("Agent not found in this organization.");
  return {context,agent:data as AgentRuntimeRow};
}

export async function uploadAgentAttachment(formData:FormData){
  try{
    const agentId=String(formData.get("agentId")??""); const file=formData.get("file");
    if(!agentId||!(file instanceof File))return{ok:false as const,error:"Choose a file first."};
    if(file.size<=0)return{ok:false as const,error:"This file is empty."};
    if(file.size>MAX_FILE_BYTES)return{ok:false as const,error:"Each file must be 12 MB or smaller."};
    const {context}=await getAgent(agentId); const filename=safeFilename(file.name); const mimeType=file.type||"application/octet-stream"; const storagePath=`${context.organizationId}/${agentId}/${randomUUID()}-${filename}`; const bytes=Buffer.from(await file.arrayBuffer());
    const {error:storageError}=await context.supabase.storage.from("agent-attachments").upload(storagePath,bytes,{contentType:mimeType,upsert:false}); if(storageError)throw new Error(`File upload failed: ${storageError.message}`);
    const {data,error}=await context.supabase.from("agent_attachments").insert({organization_id:context.organizationId,agent_id:agentId,filename:file.name.slice(0,240),mime_type:mimeType,size_bytes:file.size,storage_path:storagePath,source_company_id:context.organizationId,transferable:false}).select("id,filename,mime_type,size_bytes").single();
    if(error||!data){await context.supabase.storage.from("agent-attachments").remove([storagePath]);throw new Error("File metadata could not be saved.");}
    await context.supabase.from("agent_memories").insert({organization_id:context.organizationId,agent_id:agentId,source_attachment_id:data.id,memory_type:"file",title:`Reference file: ${data.filename}`,content:`A user supplied ${data.filename} (${data.mime_type}, ${data.size_bytes} bytes) as a reference for this Agent. The original file remains available in the Agent attachment library.`,source_company_id:context.organizationId,confidentiality_level:"internal",transferable:false});
    return{ok:true as const,attachment:{id:data.id,filename:data.filename,mimeType:data.mime_type,sizeBytes:data.size_bytes} satisfies UploadedAttachment};
  }catch(error){return{ok:false as const,error:safeMessage(error)};}
}

async function loadAttachments(context:Awaited<ReturnType<typeof requireActiveOwnerOrganizationContext>>,agentId:string,ids:string[]){
  const uniqueIds=Array.from(new Set(ids.filter(Boolean))).slice(0,MAX_FILES_PER_MESSAGE); if(!uniqueIds.length)return[] as AgentAttachmentInput[];
  const {data,error}=await context.supabase.from("agent_attachments").select("id,filename,mime_type,size_bytes,storage_path").eq("organization_id",context.organizationId).eq("agent_id",agentId).eq("status","active").in("id",uniqueIds); if(error)throw new Error("Attached files could not be loaded.");
  const files:AgentAttachmentInput[]=[]; for(const row of (data??[]) as AttachmentRow[]){const {data:blob,error:downloadError}=await context.supabase.storage.from("agent-attachments").download(row.storage_path);if(downloadError||!blob)throw new Error(`Could not read ${row.filename}.`);const buffer=Buffer.from(await blob.arrayBuffer());files.push({filename:row.filename,mimeType:row.mime_type,base64:buffer.toString("base64")});} return files;
}
async function loadMemoryContext(context:Awaited<ReturnType<typeof requireActiveOwnerOrganizationContext>>,agentId:string){const {data}=await context.supabase.from("agent_memories").select("title,content,created_at").eq("organization_id",context.organizationId).eq("agent_id",agentId).order("created_at",{ascending:false}).limit(12);if(!data?.length)return"";return`Agent memory from prior work:\n${data.map((item)=>`- ${item.title}: ${String(item.content).slice(0,900)}`).join("\n")}`.slice(0,10000);}
async function rememberExperience(context:Awaited<ReturnType<typeof requireActiveOwnerOrganizationContext>>,agentId:string,prompt:string,response:string,outputType:string,attachmentIds:string[]){const content=`User request: ${prompt.slice(0,1800)}\nOutput type: ${outputType}\nAgent result: ${response.slice(0,2200)}${attachmentIds.length?`\nReferenced attachment IDs: ${attachmentIds.join(", ")}`:""}`;await context.supabase.from("agent_memories").insert({organization_id:context.organizationId,agent_id:agentId,memory_type:"experience",title:`Work experience — ${outputType}`,content,source_company_id:context.organizationId,confidentiality_level:"internal",transferable:false});}
async function generateImage(prompt:string,agent:AgentRuntimeRow,style:"image"|"mockup"){
  const apiKey=process.env.OPENAI_API_KEY;if(!apiKey)throw new Error("OpenAI image generation is not configured.");const client=new OpenAI({apiKey});
  const visualInstruction=style==="mockup"?"Create a polished high-fidelity product/UI or brand mockup as the final visual deliverable. Make all supplied company identity details, brand assets, names, and contact facts accurate. Never invent missing company facts; omit optional fields if unknown.":"Create the requested final visual/image deliverable. Use supplied company knowledge and reference assets faithfully. Never invent names, contact data, URLs, addresses, or brand details.";
  const response=await client.images.generate({model:process.env.RYTHM_IMAGE_MODEL||"gpt-image-1",size:"1536x1024",quality:"high",prompt:`${visualInstruction}\n\nYou are producing work for ${agent.name}, ${agent.role_title}.\n\nVisual brief:\n${prompt.slice(0,18000)}`});const encoded=response.data?.[0]?.b64_json;if(!encoded)throw new Error("Image generation returned no image.");return`data:image/png;base64,${encoded}`;
}
async function generateChart(provider:AgentProvider,model:string,agent:AgentRuntimeRow,prompt:string,conversation:string,chartType:"line"|"bar",attachments:AgentAttachmentInput[]){
  const chartPrompt=`Create the actual data visualization requested by the user as a structured chart specification.\nRead all attached files and Company Knowledge before deciding what data is available. Do not invent numeric values.\nIf there is not enough numeric data to create a truthful chart, return JSON with {"needsData":true,"message":"..."}.\nOtherwise return ONLY valid JSON: {"type":"${chartType}","title":"...","xLabel":"...","yLabel":"...","points":[{"label":"...","value":123}],"insight":"one concise analytical takeaway"}. Use 2-24 points.\n\n${conversation?`Context:\n${conversation}\n\n`:""}Latest user request:\n${prompt}`;
  const raw=await runAgent({provider,model,systemInstructions:agent.system_instructions||"",prompt:chartPrompt,attachments,mode:"task",timeoutMs:getRuntimeConfig().agentTimeoutMs});const parsed=JSON.parse(extractJsonObject(raw)) as Partial<ChartSpec>&{needsData?:boolean;message?:string};
  if(parsed.needsData)return{needsData:true as const,message:parsed.message||"Please provide the numeric data for this chart."}; if(!Array.isArray(parsed.points)||parsed.points.length<2)throw new Error("Agent returned an invalid chart specification.");
  const points=parsed.points.slice(0,24).map((point)=>({label:String(point.label??""),value:Number(point.value)})).filter((point)=>point.label&&Number.isFinite(point.value));if(points.length<2)throw new Error("Agent returned an invalid chart specification.");
  return{needsData:false as const,spec:{type:chartType,title:String(parsed.title||"Analysis"),xLabel:parsed.xLabel?String(parsed.xLabel):undefined,yLabel:parsed.yLabel?String(parsed.yLabel):undefined,insight:parsed.insight?String(parsed.insight):undefined,points} satisfies ChartSpec};
}

export async function runAgentConsole(input:RunConsoleInput){
  const prompt=String(input.prompt??"").trim().slice(0,12000);if(!prompt)return{ok:false as const,error:"Enter a message or task first."};
  try{
    const {context,agent}=await getAgent(input.agentId);if(agent.agent_status==="archived")return{ok:false as const,error:"Archived Agents cannot be run."};if(!agent.system_instructions?.trim())return{ok:false as const,error:"This Agent has no generated system instruction yet."};if(!agent.runtime_model)return{ok:false as const,error:"This Agent has no runtime model configured."};
    const provider=(agent.runtime_provider??"openai") as AgentProvider;if(!(["openai","anthropic","gemini"] as string[]).includes(provider))return{ok:false as const,error:"This Agent uses an unsupported runtime provider."};
    const started=Date.now(), history=transcript(input.messages), attachmentIds=(input.attachmentIds??[]).slice(0,MAX_FILES_PER_MESSAGE);
    const userAttachments=await loadAttachments(context,agent.id,attachmentIds);
    const companyKnowledge=await loadCompanyKnowledgeForAgent(context,agent);
    const attachments=[...companyKnowledge.attachments,...userAttachments].slice(0,9);
    const requested=input.outputPreference??"auto",resolvedOutput=requested==="auto"?inferOutputPreference(prompt,agent.role_title,input.mode,attachments):requested;
    const memory=await loadMemoryContext(context,agent.id);
    const conversationContext=[companyKnowledge.contextText,memory,history].filter(Boolean).join("\n\n");
    if(provider!=="openai"&&attachments.some((file)=>/\.(xlsx|xls|xlsm)$/i.test(file.filename)))return{ok:false as const,error:"Excel workbook reading is currently enabled for OpenAI Agents. Choose an OpenAI Agent for this workbook while Claude/Gemini workbook ingestion is being added."};

    if(resolvedOutput==="image"||resolvedOutput==="mockup"){
      const visualBrief=await runAgent({provider,model:agent.runtime_model,systemInstructions:agent.system_instructions,prompt:`Create a precise image-generation brief for the requested deliverable. Use Current Company Knowledge as authoritative: company name, people, website, contact facts, brand rules, colors and attached logo/assets. Inspect every attached company/user reference. Never invent missing company details. Do not return SVG, HTML, CSS or code.\n\nUser request:\n${prompt}`,conversation:conversationContext,attachments,mode:"task",timeoutMs:getRuntimeConfig().agentTimeoutMs});
      const imageDataUrl=await generateImage(`${companyKnowledge.contextText}\n\n${visualBrief}`,agent,resolvedOutput);const responseText=resolvedOutput==="mockup"?"High-fidelity visual mockup generated using the current Company Knowledge and references.":"Visual generated using the current Company Knowledge and references.";await rememberExperience(context,agent.id,prompt,responseText,resolvedOutput,attachmentIds);
      return{ok:true as const,responseType:"image" as const,response:responseText,imageDataUrl,resolvedOutput,provider:"openai-image",model:process.env.RYTHM_IMAGE_MODEL||"gpt-image-1",latencyMs:Date.now()-started,agentName:agent.name,roleTitle:agent.role_title,status:agent.agent_status,externalActions:false,knowledgeCount:companyKnowledge.knowledgeCount};
    }
    if(resolvedOutput==="line-chart"||resolvedOutput==="bar-chart"){
      const chart=await generateChart(provider,agent.runtime_model,agent,prompt,conversationContext,resolvedOutput==="line-chart"?"line":"bar",attachments);if(chart.needsData){await rememberExperience(context,agent.id,prompt,chart.message,resolvedOutput,attachmentIds);return{ok:true as const,responseType:"text" as const,response:chart.message,resolvedOutput,provider,model:agent.runtime_model,latencyMs:Date.now()-started,agentName:agent.name,roleTitle:agent.role_title,status:agent.agent_status,externalActions:false,knowledgeCount:companyKnowledge.knowledgeCount};}
      const responseText=chart.spec.insight||"Chart generated from the supplied data.";await rememberExperience(context,agent.id,prompt,responseText,resolvedOutput,attachmentIds);return{ok:true as const,responseType:"chart" as const,response:responseText,chartSpec:chart.spec,resolvedOutput,provider,model:agent.runtime_model,latencyMs:Date.now()-started,agentName:agent.name,roleTitle:agent.role_title,status:agent.agent_status,externalActions:false,knowledgeCount:companyKnowledge.knowledgeCount};
    }
    const chatGuard=input.mode==="chat"?"Respond as a professional colleague in a normal conversation. Use Company Knowledge when relevant. Do not output SVG, HTML, CSS, JSX, source code, wireframe code, or pseudo-code unless the user explicitly asks for code.\n\n":"";
    const reportGuard=resolvedOutput==="report"?"Produce a concise professional report as the actual deliverable. Use current Company Knowledge and read relevant attached files before analyzing.\n\n":"";
    const response=await runAgent({provider,model:agent.runtime_model,systemInstructions:agent.system_instructions,prompt:`${chatGuard}${reportGuard}${prompt}`,conversation:conversationContext,attachments,mode:input.mode==="task"?"task":"chat",timeoutMs:getRuntimeConfig().agentTimeoutMs});await rememberExperience(context,agent.id,prompt,response,resolvedOutput,attachmentIds);
    return{ok:true as const,responseType:"text" as const,response,resolvedOutput,provider,model:agent.runtime_model,latencyMs:Date.now()-started,agentName:agent.name,roleTitle:agent.role_title,status:agent.agent_status,externalActions:false,knowledgeCount:companyKnowledge.knowledgeCount};
  }catch(executionError){return{ok:false as const,error:safeMessage(executionError)};}
}
