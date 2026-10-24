import type { SupabaseClient } from "@supabase/supabase-js";
import { websiteTargetFromSources, type EvidenceSource } from "@/lib/projects/project-intelligence";

type ResourceTask={id:string;organization_id:string;project_id:string;execution_id:string;assigned_agent_id?:string|null;title:string;input?:unknown;attempt_count?:number};
const object=(value:unknown):Record<string,unknown>=>value&&typeof value==="object"&&!Array.isArray(value)?value as Record<string,unknown>:{};
/** Only target-dependent inspection is held; planning/checklist preparation remains useful independent work. */
export function taskNeedsWebsiteTarget(title:string,input:unknown){
  const row=object(input);const taskText=`${title} ${typeof row.description==="string"?row.description:""}`;
  if(/^(?:prepare|define|draft|create|develop)\b.*\b(?:plan|framework|checklist|criteria|questions)\b/i.test(title))return false;
  return /\b(website|web site|pages?|navigation|usability|interface|ui|ux)\b/i.test(taskText)&&/\b(audit|review|inspect|evaluate|assess|analyze|analyse|test|redesign)\b/i.test(taskText);
}
export async function loadProjectWebsiteTarget(supabase:SupabaseClient,organizationId:string,projectId:string){
  const [project,resources,answers,documents]=await Promise.all([
    supabase.from("projects").select("description,objective").eq("organization_id",organizationId).eq("id",projectId).maybeSingle(),
    supabase.from("project_resources").select("id,resource_type,url").eq("organization_id",organizationId).eq("project_id",projectId).not("url","is",null),
    supabase.from("project_clarification_requests").select("question_key,answer").eq("organization_id",organizationId).eq("project_id",projectId).eq("status","answered").eq("question_key","website_url"),
    supabase.from("project_documents").select("id,file_name,mime_type,extracted_summary,extraction_status").eq("organization_id",organizationId).eq("project_id",projectId).eq("confidentiality","operational").eq("extraction_status","completed"),
  ]);
  for(const result of [project,resources,answers,documents])if(result.error)throw new Error(`Resource readiness unavailable: ${result.error.message}`);
  if(!project.data)throw new Error("Project resource context unavailable.");
  const sources:EvidenceSource[]=[{id:"brief",kind:"brief",summary:`${project.data.description??""} ${project.data.objective??""}`,recordedAt:null,verification:"submitted"},...(resources.data??[]).map(row=>({id:`resource:${row.id}`,kind:"resource" as const,summary:JSON.stringify({type:row.resource_type,url:row.url}),recordedAt:null,verification:"submitted" as const})),...(answers.data??[]).map(row=>({id:`answer:${row.question_key}`,kind:"answer" as const,summary:JSON.stringify(row.answer),recordedAt:null,verification:"recorded" as const}))];
  return {target:websiteTargetFromSources(sources),evidence:websiteEvidenceDocuments(documents.data??[])};
}
export async function holdTaskForMissingResources(supabase:SupabaseClient,task:ResourceTask){
  if(!taskNeedsWebsiteTarget(task.title,task.input))return false;
  const readiness=await loadProjectWebsiteTarget(supabase,task.organization_id,task.project_id);
  if(readiness.evidence.length){
    task.input={...object(task.input),resource_evidence_scope:"supplied_documents_only",resource_evidence_ids:readiness.evidence.map(doc=>doc.id)};
    return false;
  }
  // The structured worker has no autonomous browser. A URL by itself is not page evidence.
  const key=readiness.target?"website_evidence":"website_url";
  const reason=readiness.target?"The website URL is submitted but its page content has not been inspected. Supply page screenshots/content through Files, or provide results from an authorized retrieval before page-specific investigation.":"The website target and page evidence are missing. Provide its public URL and page screenshots/content through Files; independent preparation can continue.";
  const held=await supabase.from("project_task_runs").update({status:"waiting_for_data",error_class:"missing_project_resource",error_message:reason,input:{...object(task.input),resource_wait:{key,reason,verification:"missing"}},attempt_count:Math.max(0,Number(task.attempt_count??1)-1),lease_owner:null,lease_expires_at:null,next_attempt_at:null,updated_at:new Date().toISOString()}).eq("organization_id",task.organization_id).eq("project_id",task.project_id).eq("id",task.id).eq("status","running");
  if(held.error)throw new Error(`Unable to hold resource-dependent task: ${held.error.message}`);
  const event=await supabase.from("project_activity_events").insert({organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,agent_id:task.assigned_agent_id??null,event_type:"task.waiting_for_resource",headline:`Page evidence needed: ${task.title}`,detail:reason,importance:"attention",metadata:{task_run_id:task.id,resource_key:key}});
  if(event.error)throw new Error(event.error.message);
  return true;
}
/** Resume only this explicit resource wait; do not disturb approval, connector or other data holds. */
export async function resumeProjectResourceWaits(supabase:SupabaseClient){
  const waiting=await supabase.from("project_task_runs").select("id,organization_id,project_id,execution_id,assigned_agent_id,title,input,project_executions!inner(status)").eq("status","waiting_for_data").eq("error_class","missing_project_resource").in("project_executions.status",["queued","running"]).order("updated_at").limit(30);
  if(waiting.error)throw new Error(waiting.error.message);
  for(const task of waiting.data??[]){
    const readiness=await loadProjectWebsiteTarget(supabase,task.organization_id,task.project_id);
    if(!readiness.evidence.length)continue;
    const resumed=await supabase.from("project_task_runs").update({status:"queued",error_class:null,error_message:null,input:{...object(task.input),resource_evidence_scope:"supplied_documents_only",resource_evidence_ids:readiness.evidence.map(doc=>doc.id),resource_wait:{key:"website_evidence",verification:"extracted_supplied_document",resumed_at:new Date().toISOString()}},next_attempt_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("organization_id",task.organization_id).eq("project_id",task.project_id).eq("id",task.id).eq("status","waiting_for_data").eq("error_class","missing_project_resource").select("id").maybeSingle();
    if(resumed.error)throw new Error(resumed.error.message);
    if(resumed.data)await supabase.from("project_activity_events").insert({organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,event_type:"task.resource_supplied",headline:`Resource supplied: ${task.title}`,detail:"Extracted operational page evidence is now available. Findings must be limited to the supplied source pages; no full-site browsing is implied.",importance:"normal",metadata:{task_run_id:task.id,resource_key:"website_evidence",verification:"extracted_supplied_document"}});
  }
}


type WebsiteEvidenceDocument={id:string;file_name?:string;mime_type?:string;extracted_summary?:string;extraction_status?:string};
/** Only operational, completed extraction rows reach this classifier; a URL or a project brief is insufficient. */
export function websiteEvidenceDocuments(documents:WebsiteEvidenceDocument[]){
  return documents.filter(doc=>{
    if(doc.extraction_status!=="completed"||!doc.extracted_summary)return false;
    const image=(doc.mime_type??"").startsWith("image/");const html=/\.html?$/i.test(doc.file_name??"");
    const describesPage=/\b(website|webpage|web page|navigation|user interface|landing page|screen ?shot|ui|ux)\b/i.test(doc.extracted_summary);
    const screenshotDocument=/\b(screen ?shot|captured page|page capture)\b/i.test(doc.extracted_summary);
    return describesPage&&(image||html||screenshotDocument);
  });
}

/** Deferred questions become visible only when an approved task explicitly depends on their keys. */
export async function holdTaskForDeferredClarifications(supabase:SupabaseClient,task:ResourceTask){
  const keys=Array.isArray(object(task.input).required_input_keys)?(object(task.input).required_input_keys as unknown[]).filter((key):key is string=>typeof key==="string").slice(0,10):[];
  if(!keys.length)return false;
  const roadmapId=object(task.input).roadmap_id;
  const roadmap=typeof roadmapId==="string"?await supabase.from("project_roadmaps").select("generated_from").eq("organization_id",task.organization_id).eq("project_id",task.project_id).eq("id",roadmapId).maybeSingle():{data:null,error:null};
  if(roadmap.error)throw new Error("Unable to read task clarification baseline.");
  const assessmentId=object(roadmap.data?.generated_from).readiness_assessment_id;
  let assessmentQuery=supabase.from("project_readiness_assessments").select("missing_inputs,evidence").eq("organization_id",task.organization_id).eq("project_id",task.project_id);
  if(typeof assessmentId==="string")assessmentQuery=assessmentQuery.eq("id",assessmentId);
  const [answers,assessment]=await Promise.all([
    supabase.from("project_clarification_requests").select("question_key,status").eq("organization_id",task.organization_id).eq("project_id",task.project_id).in("question_key",keys),
    assessmentQuery.order("created_at",{ascending:false}).limit(1).maybeSingle(),
  ]);
  if(answers.error||assessment.error)throw new Error("Unable to check task clarification dependencies.");
  const answered=new Set((answers.data??[]).filter(row=>row.status==="answered").map(row=>row.question_key));
  const pending=keys.filter(key=>!answered.has(key));if(!pending.length)return false;
  const evidence=object(assessment.data?.evidence);
  const candidates=[...(Array.isArray(assessment.data?.missing_inputs)?assessment.data.missing_inputs:[]),...(Array.isArray(evidence.deferred_questions)?evidence.deferred_questions:[])].map(object);
  for(const key of pending){
    if((answers.data??[]).some(row=>row.question_key===key&&row.status==="open"))continue;
    const candidate=candidates.find(row=>row.key===key);
    if(!candidate||typeof candidate.question!=="string")throw new Error(`Missing declared clarification contract: ${key}`);
    const inserted=await supabase.from("project_clarification_requests").upsert({organization_id:task.organization_id,project_id:task.project_id,question_key:key,question:candidate.question,reason:typeof candidate.reason==="string"?candidate.reason:"Required by the current project task.",input_type:typeof candidate.input_type==="string"?candidate.input_type:"text",options:Array.isArray(candidate.options)?candidate.options:[],materiality:"required",status:"open"},{onConflict:"project_id,question_key,status",ignoreDuplicates:true});
    if(inserted.error)throw new Error(inserted.error.message);
  }
  const held=await supabase.from("project_task_runs").update({status:"waiting_for_data",error_class:"missing_clarification",error_message:"Answer the task's required project questions before this work can run.",attempt_count:Math.max(0,Number(task.attempt_count??1)-1),lease_owner:null,lease_expires_at:null,next_attempt_at:null,updated_at:new Date().toISOString()}).eq("organization_id",task.organization_id).eq("project_id",task.project_id).eq("id",task.id).eq("status","running");
  if(held.error)throw new Error(held.error.message);
  await supabase.from("project_activity_events").insert({organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,event_type:"task.waiting_for_clarification",headline:`Input needed: ${task.title}`,detail:"A previously deferred question is now a dependency of the current task. Independent work remains runnable.",importance:"attention",metadata:{task_run_id:task.id,question_keys:pending}});
  return true;
}
export async function resumeProjectClarificationWaits(supabase:SupabaseClient){
  const waiting=await supabase.from("project_task_runs").select("id,organization_id,project_id,execution_id,title,input,project_executions!inner(status)").eq("status","waiting_for_data").eq("error_class","missing_clarification").in("project_executions.status",["queued","running"]).order("updated_at").limit(30);
  if(waiting.error)throw new Error(waiting.error.message);
  for(const task of waiting.data??[]){
    const keys=object(task.input).required_input_keys;
    if(!Array.isArray(keys)||!keys.length)continue;
    const answers=await supabase.from("project_clarification_requests").select("question_key").eq("organization_id",task.organization_id).eq("project_id",task.project_id).eq("status","answered").in("question_key",keys);
    if(answers.error)throw new Error(answers.error.message);
    const answered=new Set((answers.data??[]).map(row=>row.question_key));if(!keys.every(key=>answered.has(key)))continue;
    const resumed=await supabase.from("project_task_runs").update({status:"queued",error_class:null,error_message:null,next_attempt_at:new Date().toISOString(),updated_at:new Date().toISOString()}).eq("organization_id",task.organization_id).eq("project_id",task.project_id).eq("id",task.id).eq("status","waiting_for_data").eq("error_class","missing_clarification").select("id").maybeSingle();
    if(resumed.error)throw new Error(resumed.error.message);
    if(resumed.data)await supabase.from("project_activity_events").insert({organization_id:task.organization_id,project_id:task.project_id,execution_id:task.execution_id,event_type:"task.clarifications_supplied",headline:`Input supplied: ${task.title}`,detail:"Required task clarification keys have been answered; other approvals and resource gates still apply.",importance:"normal",metadata:{task_run_id:task.id,question_keys:keys}});
  }
}
