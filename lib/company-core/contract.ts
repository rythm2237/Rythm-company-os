/** Shared deterministic contract; template policy is data, never a second engine. */
export const COMPANY_CORE_VERSION = '1.0';
export const EXECUTIVE_INSTRUCTIONS = `Own every project from intake to accepted closeout. Coordinate department managers; specialists report through their managers. Use strategy, operations, finance, marketing, project management, negotiation and risk reasoning. Every unresolved obligation needs an owner, next action, deadline, resume condition and escalation. Clarify material gaps with the Human CEO before asking customers. Respect rejected branches, pauses, capacity and spending ceilings. Propose genuinely changed alternatives after rejection. Never claim implementation, verification, delivery, acceptance or MBA competence without evidence. Deterministic services enforce authority, queues, costs and transitions.`;
export const SHARED_RUNTIME_INSTRUCTIONS = 'Complete assigned obligations under your department manager and Executive Director. Preserve predecessor outputs and evidence. Respect manager-first clarification, budget authority, pauses, rejected branches and scoped tools. Report blockers with a concrete next action. Generated outputs are not external execution or verification evidence.';
export const runtimeInstructions = (role:string) => /executive|chief.*staff|COO|chief operating/i.test(role)?EXECUTIVE_INSTRUCTIONS:SHARED_RUNTIME_INSTRUCTIONS;
export type AgentAvailability = {id:string;enabled:boolean;agent_status:string;organization_id?:string;skills?:unknown;role_title?:string};
export const isAgentAvailable = (a:AgentAvailability) => a.enabled && a.agent_status === 'enabled';
export type GraphTask = {key:string;dependencies:string[];agentId?:string|null};
export function validateDelegation(tasks:GraphTask[], availableIds:Set<string>) {
  const graph = new Map(tasks.map(t=>[t.key,t]));
  if(graph.size!==tasks.length)throw new Error('Duplicate task key.');
  const visiting=new Set<string>(), done=new Set<string>();
  function visit(key:string){
    if(visiting.has(key))throw new Error(`Dependency cycle at ${key}.`);
    if(done.has(key))return;
    const task=graph.get(key);if(!task)throw new Error(`Missing dependency ${key}.`);
    if(!task.agentId||!availableIds.has(task.agentId))throw new Error(`Task ${key} needs an available company agent.`);
    visiting.add(key);for(const dep of task.dependencies)visit(dep);visiting.delete(key);done.add(key);
  }
  for(const task of tasks)visit(task.key);
}
export type Clarification = {id:string;question:string;reason:string;question_key?:string;input_type:string;options:unknown;materiality:string;status?:string;answer?:unknown;required_stage?:string;omission_permitted?:boolean;consent_required?:boolean;condition?:{questionId:string;equals:unknown}|null};
export function canWaive(q:Clarification){return q.omission_permitted===true && !q.consent_required && q.materiality!=='required';}
export function validateAnswers(questions:Clarification[], answers:Record<string,unknown>, submit:boolean){
  const errors:string[]=[];
  for(const q of questions){
    if(q.condition && answers[q.condition.questionId]!==q.condition.equals)continue;
    const value=answers[q.id];
    const absent=value===undefined||value===null||value===''||(Array.isArray(value)&&!value.length);
    if(absent){if(submit&&q.materiality==='required')errors.push(`${q.question}: required`);continue;}
    if(value==='unknown'||value==='provide_later'){if(submit&&q.materiality==='required')errors.push(`${q.question}: manager clarification required`);continue;}
    if(q.input_type==='multi_choice'&&!Array.isArray(value))errors.push(`${q.question}: select one or more options`);
    if(['select','single_choice','multi_choice'].includes(q.input_type)&&Array.isArray(q.options)){
      for(const choice of Array.isArray(value)?value:[value])if(!q.options.includes(choice))errors.push(`${q.question}: invalid choice`);
    }
    if(JSON.stringify(value).length>10000)errors.push(`${q.question}: answer too long`);
  }
  return errors;
}
export type RejectionKind='explanation'|'revision'|'cost'|'approach'|'evidence'|'definitive'|'pause'|'cancel';
export function revisionAllowed(kind:RejectionKind,reopened=false){return reopened||!['definitive','pause','cancel'].includes(kind);}
export function executionDisposition(required:boolean, connections:number, capabilities:number, actions:number, missingInputs:number){
  if(!required)return 'no_external_action';
  if(!connections)return 'needs_connection';
  if(!capabilities)return 'capability_unavailable';
  if(missingInputs)return 'needs_data';
  if(!actions)return 'needs_execution_review';
  return 'dispatched';
}

/** Consent can be validated, but a manager cannot rewrite a customer response. */
export function hasMatchingCustomerAnswer(evidence: unknown, answer: unknown) {
 if (!Array.isArray(evidence)) return false;
 const latest = [...evidence].reverse().find((item) => item && item.source === "customer_form");
 return !!latest && JSON.stringify(latest.answer) === JSON.stringify(answer);
}
