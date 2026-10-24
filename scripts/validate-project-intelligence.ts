import assert from "node:assert/strict";
import { buildBusinessContext, normalizeProjectDiagnosis, prioritizeProjectQuestions, normalizeBusinessCorrection, essentialResourceQuestions, type EvidenceSource } from "../lib/projects/project-intelligence";
import { approveProjectRoadmap, validateRoadmapDependencies, type RoadmapPhase } from "../lib/projects/project-roadmap";
const sources:EvidenceSource[]=[{id:"brief",kind:"brief",summary:"Vegan restaurant acquisition",recordedAt:null,verification:"submitted"}];
const restaurant=buildBusinessContext({description:"A vegan restaurant needs more customer acquisition",sources});
assert(restaurant.domainProfiles.includes("hospitality"));
assert(restaurant.claims.some(c=>c.key==="potential_customer_segments"&&c.status==="hypothesis"&&c.value.includes("flexitarians")));
assert(restaurant.claims.every(c=>c.status!=="recorded"));
const crm=buildBusinessContext({description:"Internal report",customer:{id:"customer",name:"Example",industry:"Logistics"},sources:[...sources,{id:"crm:customer",kind:"crm",summary:"Example",recordedAt:null,verification:"recorded"}]});
assert.equal(crm.claims.find(c=>c.key==="name")?.status,"recorded");
const question=(key:string,extra={})=>({key,question:`What is ${key}?`,reason:"Blocks the decision",materiality:"required",human_required:true,decision_impact:3,execution_dependency:true,...extra});
const questions=prioritizeProjectQuestions([question("answered"),question("known",{obtainable_from_sources:true}),question("reversible",{safe_reversible_assumption:true}),...Array.from({length:7},(_,i)=>question(`new-${i}`))],new Set(["answered"]));
assert.equal(questions.selected.length,3);assert.equal(questions.deferred.length,4);
assert(!questions.selected.some(q=>["answered","known","reversible"].includes(q.key)));
assert.equal(prioritizeProjectQuestions([{key:"x",question:"Missing field",materiality:"required"}],new Set()).selected.length,0);
assert.equal(prioritizeProjectQuestions(Array.from({length:4},(_,i)=>question(`${i}`,{mandatory:true})),new Set()).selected.length,4);
const diagnosis=normalizeProjectDiagnosis({depth:"deep",plan_kind:"delivery",findings:[{key:"invented",value:"Proven cause",source_ids:["imaginary"]}],hypotheses:[{explanation:"Weak retention",supporting_source_ids:["brief","imaginary"],test:"Review repeat-visit evidence"}]},{description:"Restaurant empty",objective:"Sustainable growth",sources,questionCount:0});
assert.equal(diagnosis.planKind,"discovery");assert.equal(diagnosis.findings[0].status,"hypothesis");assert.deepEqual(diagnosis.hypotheses[0].supportingSourceIds,["brief"]);assert.equal(diagnosis.hypotheses[0].status,"hypothesis");assert.equal(diagnosis.problemDefinitionGate.scopeChangeAuthorized,false);
assert.equal(normalizeProjectDiagnosis({depth:"lightweight",uncertainties:[]},{description:"Create an internal report",objective:"Monthly summary",sources,questionCount:0}).planKind,"delivery");
const phase:RoadmapPhase={key:"research",order:1,title:"Research",description:"",milestone:"",weight:100,estimatedDuration:"",deliverables:[],dependencies:[],ownerAgentIds:["agent"],requiredConnections:[],requiredApprovals:[],successCriteria:[],tasks:[{key:"a",title:"Evidence",description:"",priority:1,dependencies:[],agentId:"agent",risk:"low",requiresApproval:false,workWeight:1},{key:"b",title:"Review",description:"",priority:1,dependencies:["a"],agentId:"agent",risk:"low",requiresApproval:false,workWeight:1}]};
assert.doesNotThrow(()=>validateRoadmapDependencies([phase],new Set(["agent"])));
assert.throws(()=>validateRoadmapDependencies([phase],new Set(["other"])),/unauthorized/);
assert.throws(()=>validateRoadmapDependencies([{...phase,tasks:phase.tasks.map(t=>({...t,dependencies:["missing"]}))}],new Set(["agent"])),/dependency/);
assert.throws(()=>validateRoadmapDependencies([{...phase,tasks:phase.tasks.map(t=>({...t,dependencies:[t.key==="a"?"b":"a"]}))}],new Set(["agent"])),/cycle/);
assert.throws(()=>validateRoadmapDependencies([phase,phase],new Set(["agent"])),/Duplicate/);
console.log("Universal project intelligence: business provenance, question budget, diagnosis uncertainty, roadmap isolation and dependency graph passed.");

assert.equal(essentialResourceQuestions("Review the website UI",[{id:"brief",kind:"brief",summary:"Review the website UI",recordedAt:null,verification:"submitted"}])[0]?.key,"website_url");
assert.equal(essentialResourceQuestions("Review the website UI",[{id:"brief",kind:"brief",summary:"Review https://example.org UI",recordedAt:null,verification:"submitted"}]).length,0);
assert.equal(normalizeBusinessCorrection({key:"contract_value",value:"secret"}),null);
assert.equal(normalizeBusinessCorrection({key:"industry",value:"x".repeat(2001)}),null);
assert.deepEqual(normalizeBusinessCorrection({key:"industry",value:" Hospitality "}),{key:"industry",value:"Hospitality"});
async function checkApprovalGuards(){
  const writes:string[]=[];
  function db(status:string,latestId="roadmap"){
    return {from(table:string){const chain:Record<string,unknown>={};for(const method of ["select","eq","order","limit","neq"])chain[method]=()=>chain;chain.update=()=>{writes.push(table);return chain;};chain.insert=()=>{writes.push(table);return chain;};chain.maybeSingle=chain.single=()=>Promise.resolve({data:table==="project_roadmaps"?{id:latestId,version:2,status,is_baseline:status==="approved",title:"Existing",summary:"",generated_from:{}}:null,error:null});chain.then=(resolve:(value:unknown)=>void)=>resolve({data:table==="project_roadmap_phases"?[]:null,error:null});return chain;}} as unknown as Parameters<typeof approveProjectRoadmap>[0];
  }
  await assert.rejects(()=>approveProjectRoadmap(db("rejected"),"org","project","roadmap","user"),/current roadmap/);
  await assert.rejects(()=>approveProjectRoadmap(db("in_review","newer"),"org","project","roadmap","user"),/latest roadmap/);
  const existing=await approveProjectRoadmap(db("approved"),"org","project","roadmap","user");
  assert.equal(existing?.id,"roadmap");assert.deepEqual(writes,[]);
}
checkApprovalGuards().then(()=>console.log("Correction allowlist, missing website resource and stale/repeated roadmap approval guards passed."));

import { taskNeedsWebsiteTarget, holdTaskForMissingResources, websiteEvidenceDocuments, holdTaskForDeferredClarifications } from "../lib/projects/project-resource-readiness";
import { websiteTargetFromSources } from "../lib/projects/project-intelligence";
assert.equal(taskNeedsWebsiteTarget("Inspect website pages",{}),true);
assert.equal(taskNeedsWebsiteTarget("Prepare audit checklist",{}),false);
assert.equal(taskNeedsWebsiteTarget("Define website review criteria",{}),false);
assert.equal(taskNeedsWebsiteTarget("Analyze customer acquisition",{}),false);
assert.equal(websiteTargetFromSources([{id:"resource:1",kind:"resource",summary:JSON.stringify({type:"github",url:"https://github.com/example/repo"}),recordedAt:null,verification:"submitted"}]),null);
assert.equal(websiteTargetFromSources([{id:"brief",kind:"brief",summary:"Review http://127.0.0.1/admin",recordedAt:null,verification:"submitted"}]),null);
async function checkTaskResourceHold(){
  const changes:Record<string,unknown>[]=[];const events:Record<string,unknown>[]=[];
  const db={from(table:string){const chain:Record<string,unknown>={};for(const method of ["select","eq","not"])chain[method]=()=>chain;chain.update=(row:Record<string,unknown>)=>{changes.push(row);return chain;};chain.insert=(row:Record<string,unknown>)=>{events.push(row);return chain;};chain.maybeSingle=()=>Promise.resolve({data:table==="projects"?{description:"Website review",objective:"Improve usability"}:null,error:null});chain.then=(resolve:(value:unknown)=>void)=>resolve({data:[],error:null});return chain;}} as unknown as Parameters<typeof holdTaskForMissingResources>[0];
  assert.equal(await holdTaskForMissingResources(db,{id:"task",organization_id:"org",project_id:"project",execution_id:"execution",title:"Inspect website pages",attempt_count:1}),true);
  assert.equal(changes[0].status,"waiting_for_data");assert.equal(changes[0].attempt_count,0);assert.equal(events[0].event_type,"task.waiting_for_resource");
  const before=changes.length;
  assert.equal(await holdTaskForMissingResources(db,{id:"prep",organization_id:"org",project_id:"project",execution_id:"execution",title:"Prepare audit checklist"}),false);
  assert.equal(changes.length,before);
}
checkTaskResourceHold().then(()=>console.log("Missing website task held without consuming a retry; independent preparation remains runnable."));

assert.equal(websiteEvidenceDocuments([{id:"url",file_name:"brief.pdf",mime_type:"application/pdf",extraction_status:"completed",extracted_summary:"Customer requests a website redesign"}]).length,0);
assert.equal(websiteEvidenceDocuments([{id:"page",file_name:"home.png",mime_type:"image/png",extraction_status:"completed",extracted_summary:"A website screenshot shows the navigation and a clipped CTA."}]).length,1);
assert.equal(websiteEvidenceDocuments([{id:"logo",file_name:"brand.png",mime_type:"image/png",extraction_status:"completed",extracted_summary:"A company logo on white background."}]).length,0);
async function checkDeferredQuestionGate(){
  const writes:Array<{table:string;row:Record<string,unknown>}>=[];
  const db={from(table:string){const chain:Record<string,unknown>={};for(const method of ["select","eq","in","order","limit"])chain[method]=()=>chain;chain.update=chain.upsert=(row:Record<string,unknown>)=>{writes.push({table,row});return chain;};chain.insert=(row:Record<string,unknown>)=>{writes.push({table,row});return chain;};chain.maybeSingle=()=>Promise.resolve({data:table==="project_readiness_assessments"?{missing_inputs:[],evidence:{deferred_questions:[question("success_target")]}}:null,error:null});chain.then=(resolve:(value:unknown)=>void)=>resolve({data:[],error:null});return chain;}} as unknown as Parameters<typeof holdTaskForDeferredClarifications>[0];
  assert.equal(await holdTaskForDeferredClarifications(db,{id:"task",organization_id:"org",project_id:"project",execution_id:"execution",title:"Measure results",input:{required_input_keys:["success_target"]},attempt_count:1}),true);
  assert.equal(writes.find(write=>write.table==="project_clarification_requests")?.row.question_key,"success_target");
  assert.equal(writes.find(write=>write.table==="project_task_runs")?.row.status,"waiting_for_data");
  assert.equal(writes.find(write=>write.table==="project_task_runs")?.row.attempt_count,0);
}
checkDeferredQuestionGate().then(()=>console.log("Deferred material question opens at task dependency, holds only that task and preserves retries."));

import { loadReusableCustomerCorrections } from "../lib/projects/project-customer-context";
async function checkCustomerCorrectionIsolation(){
  const queried:string[]=[];const filters:Array<{column:string;value:unknown}>=[];
  function caller(allowed:boolean){return {from(table:string){queried.push(table);const chain:Record<string,unknown>={};for(const method of ["select","order","limit","neq"])chain[method]=()=>chain;chain.eq=(column:string,value:unknown)=>{filters.push({column,value});return chain;};chain.maybeSingle=()=>Promise.resolve({data:allowed?{id:"customer"}:null,error:null});chain.then=(resolve:(value:unknown)=>void)=>resolve({data:[{id:"older",summary:"",created_at:"2026-01-01",evidence:{key:"industry",value:"Retail",confirmed_by_user_id:"user",recorded_at:"2026-01-01",scope:"customer",customer_id:"customer"}},{id:"newer",summary:"",created_at:"2026-02-01",evidence:{key:"industry",value:"Hospitality",confirmed_by_user_id:"user",recorded_at:"2026-02-01",scope:"customer",customer_id:"customer"}},{id:"secret",summary:"",created_at:"2026-03-01",evidence:{key:"contract_value",value:"secret",confirmed_by_user_id:"user",recorded_at:"2026-03-01",scope:"customer",customer_id:"customer"}}],error:null});return chain;}} as unknown as Parameters<typeof loadReusableCustomerCorrections>[0];}
  const denied=await loadReusableCustomerCorrections(caller(false),{organizationId:"org",customerId:"customer",projectId:"project"});
  assert.deepEqual(denied,[]);assert.deepEqual(queried,["crm_accounts"]);queried.length=0;
  const allowed=await loadReusableCustomerCorrections(caller(true),{organizationId:"org",customerId:"customer",projectId:"project"});
  assert.equal(allowed.length,1);assert.equal(allowed[0].value,"Hospitality");assert.equal(allowed[0].source.id,"knowledge:newer");
  assert(filters.some(filter=>filter.column==="organization_id"&&filter.value==="org"));
  assert(filters.some(filter=>filter.column==="projects.customer_id"&&filter.value==="customer"));
  assert(filters.some(filter=>filter.column==="evidence->>scope"&&filter.value==="customer"));
}
checkCustomerCorrectionIsolation().then(()=>console.log("Reusable customer corrections require caller customer visibility, same-customer scope and operational allowlist; newest approved correction wins."));
