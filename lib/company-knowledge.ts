import type { AgentAttachmentInput } from "@/lib/ai/agent-provider";
import { fetchPublicResource } from "@/lib/security/public-url";
import { loadProfessionalRuntimeContext } from "@/lib/trusted-agent-knowledge";

type KnowledgeAgent = { id:string; role_title:string; department?:string|null; company_knowledge_connected?:boolean|null };
type KnowledgeRow = { id:string; title:string; category:string; source_type:string; content:string|null; source_url:string|null; storage_path:string|null; mime_type:string|null; confidentiality:"public"|"internal"|"confidential"|"restricted"; allowed_departments:string[]|null; allowed_role_keywords:string[]|null; updated_at:string };
type KnowledgeChunkRow = { knowledge_id:string; title:string; category:string; confidentiality:string; chunk_index:number; content:string; rank:number };
type KnowledgeContext = { organizationId:string; organization:{name?:string|null;mission?:string|null;vision?:string|null}; supabase:any };

const CATEGORY_ROLE_HINTS:Record<string,string[]>={
  brand:["design","creative","brand","marketing","product","growth","sales","ceo","founder"],people:["hr","people","talent","operations","manager","ceo","founder","assistant"],contact:["design","brand","marketing","sales","support","operations","assistant","ceo","founder"],finance:["finance","cfo","account","analyst","strategy","ceo","founder"],analytics:["analyst","analytics","data","finance","operations","strategy","ceo","founder"],legal:["legal","counsel","compliance","risk","ceo","founder"],sales:["sales","growth","marketing","commercial","revenue","ceo","founder"],operations:["operations","project","delivery","manager","analyst","ceo","founder"],process:["operations","project","delivery","manager","analyst","ceo","founder"],product:["product","design","engineering","marketing","sales","support","strategy","ceo","founder"],service:["delivery","sales","support","marketing","strategy","operations","ceo","founder"]
};
function normalize(value:string|null|undefined){return String(value??"").toLowerCase();}
function roleCanUse(item:KnowledgeRow,agent:KnowledgeAgent){
  const role=normalize(agent.role_title),department=normalize(agent.department),explicitDepartments=item.allowed_departments??[],explicitRoles=item.allowed_role_keywords??[];
  if(explicitDepartments.length||explicitRoles.length)return explicitDepartments.some((value)=>department.includes(normalize(value)))||explicitRoles.some((value)=>role.includes(normalize(value)));
  const hints=CATEGORY_ROLE_HINTS[item.category];
  if(item.confidentiality==="restricted"||item.confidentiality==="confidential"){if(!hints?.length)return false;return hints.some((hint)=>role.includes(hint)||department.includes(hint));}
  if(!hints?.length)return true;return hints.some((hint)=>role.includes(hint)||department.includes(hint));
}
async function fileFromKnowledge(context:KnowledgeContext,item:KnowledgeRow):Promise<AgentAttachmentInput|null>{
  try{let buffer:Buffer|null=null;let mimeType=item.mime_type||"application/octet-stream";let filename=item.title.replace(/[^a-zA-Z0-9._ -]+/g,"-").slice(0,120)||"company-reference";
    if(item.storage_path){const{data,error}=await context.supabase.storage.from("company-knowledge").download(item.storage_path);if(error||!data)return null;buffer=Buffer.from(await data.arrayBuffer());if(data.type)mimeType=data.type;}
    else if(item.source_url&&item.mime_type&&/^(image\/|application\/pdf)/.test(item.mime_type)){const {response,bytes,finalUrl}=await fetchPublicResource(item.source_url,{timeoutMs:8000,maxBytes:15*1024*1024,maxRedirects:4});if(!response.ok)return null;buffer=Buffer.from(bytes);mimeType=response.headers.get("content-type")?.split(";")[0]||mimeType;filename=finalUrl.pathname.split("/").filter(Boolean).pop()||filename;}
    if(!buffer?.length||buffer.length>15*1024*1024)return null;return{filename,mimeType,base64:buffer.toString("base64")};
  }catch{return null;}
}

export async function loadCompanyKnowledgeForAgent(context:KnowledgeContext,agent:KnowledgeAgent,currentTask=""){
  const professional=await loadProfessionalRuntimeContext(context.supabase,context.organizationId,agent.id,currentTask||agent.role_title);
  let companyKnowledgeConnected=agent.company_knowledge_connected;
  if(typeof companyKnowledgeConnected!=="boolean"){
    const{data:connectionState}=await context.supabase.from("agents").select("company_knowledge_connected").eq("organization_id",context.organizationId).eq("id",agent.id).maybeSingle();
    companyKnowledgeConnected=connectionState?.company_knowledge_connected!==false;
  }
  if(companyKnowledgeConnected===false){
    return{contextText:[professional.contextText,"LIVE COMPANY KNOWLEDGE — DETACHED FOR TRANSFER. No company facts, assets or company-scoped knowledge are available to this Agent until an authorized organization owner reconnects it."].filter(Boolean).join("\n\n--- KNOWLEDGE LAYER BOUNDARY ---\n\n"),attachments:[] as AgentAttachmentInput[],knowledgeCount:0,professionalFoundation:professional.foundationTitle,specializationTitles:professional.specializationTitles,professionalQaRules:professional.qaRules,companyKnowledgeConnected:false};
  }

  const [{data},{data:chunkData,error:chunkError}]=await Promise.all([
    context.supabase.from("company_knowledge").select("id,title,category,source_type,content,source_url,storage_path,mime_type,confidentiality,allowed_departments,allowed_role_keywords,updated_at").eq("organization_id",context.organizationId).eq("status","active").order("updated_at",{ascending:false}).limit(80),
    context.supabase.rpc("search_company_knowledge_for_agent_v1",{target_org_id:context.organizationId,target_agent_id:agent.id,query_text:currentTask||agent.role_title,max_results:10}),
  ]);
  if(chunkError) console.error("company_library_agent_search_failed",{agentId:agent.id,message:chunkError.message});
  const relevant=((data??[]) as KnowledgeRow[]).filter((item)=>roleCanUse(item,agent));
  const retrievedChunks=(chunkData??[]) as KnowledgeChunkRow[];
  const baseline=[`Company: ${context.organization?.name||"Current company"}`,context.organization?.mission?`Mission: ${context.organization.mission}`:"",context.organization?.vision?`Vision: ${context.organization.vision}`:""].filter(Boolean).join("\n");
  const entries=relevant.filter((item)=>item.content?.trim()||item.source_url).map((item)=>{const source=item.source_url?` Source reference retained internally: ${item.title}`:"";const body=item.content?.trim()?item.content.trim().slice(0,5000):"Reference asset available to this Agent.";return`[${item.category.toUpperCase()} · ${item.confidentiality.toUpperCase()}] ${item.title}\n${body}${source}`;});
  const chunkEntries=retrievedChunks.map((item)=>`[COMPANY LIBRARY · ${item.category.toUpperCase()} · ${item.confidentiality.toUpperCase()}] ${item.title} · chunk ${item.chunk_index+1}\n${item.content.slice(0,3600)}`);
  const companyContext=`LIVE COMPANY KNOWLEDGE — authoritative for current company facts. Company-scoped, role-filtered and non-transferable. Never copy confidential company facts into general professional learning.\n${baseline}${chunkEntries.length?`\n\nTASK-RELEVANT COMPANY LIBRARY RETRIEVAL\n${chunkEntries.join("\n\n")}`:""}${entries.length?`\n\nRECENT ROLE-RELEVANT COMPANY KNOWLEDGE\n${entries.join("\n\n")}`:""}`.slice(0,36000);
  const contextText=[professional.contextText,companyContext].filter(Boolean).join("\n\n--- KNOWLEDGE LAYER BOUNDARY ---\n\n").slice(0,56000);
  const attachmentCandidates=relevant.filter((item)=>item.storage_path||(item.source_url&&item.mime_type&&/^(image\/|application\/pdf)/.test(item.mime_type))).slice(0,5);
  const attachments=(await Promise.all(attachmentCandidates.map((item)=>fileFromKnowledge(context,item)))).filter(Boolean) as AgentAttachmentInput[];
  return{contextText,attachments,knowledgeCount:Math.max(relevant.length,new Set(retrievedChunks.map((item)=>item.knowledge_id)).size),professionalFoundation:professional.foundationTitle,specializationTitles:professional.specializationTitles,professionalQaRules:professional.qaRules,companyKnowledgeConnected:true};
}
