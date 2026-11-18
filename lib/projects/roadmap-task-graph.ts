import type {RoadmapPhase} from './project-roadmap';

// These exact legacy phrases refer only to the current roadmap's baseline gate.
// They never satisfy a client, spending, contract or task-specific approval.
const baselineGates=new Set([
 'roadmap approval','human ceo approval of roadmap','human ceo approval of the roadmap',
 'ceo approval of roadmap','ceo approval of the roadmap','human_ceo_roadmap_approval','roadmap_approval',
]);

export function compileRoadmapTasks(phases:RoadmapPhase[]){
 const tasks=phases.flatMap(phase=>{
  if(!phase.id)throw new Error(`Roadmap phase ${phase.key} has no persisted identity.`);
  return phase.tasks.map(task=>({...task,key:`${phase.key}:${task.key}`.slice(0,180),rawTaskKey:task.key,phaseId:phase.id!,phaseKey:phase.key}));
 });
 if(!tasks.length)throw new Error('The roadmap has no executable tasks. Request a revised roadmap.');
 const keys=new Set<string>();const byRaw=new Map<string,string[]>();
 for(const task of tasks){
  if(keys.has(task.key))throw new Error(`Duplicate roadmap task key: ${task.key}`);
  keys.add(task.key);byRaw.set(task.rawTaskKey,[...(byRaw.get(task.rawTaskKey)??[]),task.key]);
 }
 const compiled=tasks.map(task=>{
  let roadmapApprovalDependency=false;
  const dependencies=task.dependencies.flatMap(value=>{
   const dependency=String(value).trim();
   if(!dependency)throw new Error(`Roadmap task ${task.key} contains an empty dependency.`);
   if(keys.has(dependency))return [dependency];
   const samePhase=`${task.phaseKey}:${dependency}`;
   if(keys.has(samePhase))return [samePhase];
   const matches=byRaw.get(dependency)??[];
   if(matches.length===1)return matches;
   if(matches.length>1)throw new Error(`Roadmap dependency ${dependency} is ambiguous. Use a phase:task key.`);
   if(baselineGates.has(dependency.toLowerCase().replace(/\s+/g,' '))){roadmapApprovalDependency=true;return [];}
   throw new Error(`Roadmap dependency ${dependency} for ${task.key} does not exist. Request changes before approval.`);
  });
  return {...task,dependencies:[...new Set(dependencies)],roadmapApprovalDependency};
 });
 const graph=new Map(compiled.map(task=>[task.key,task.dependencies]));const done=new Set<string>();const visiting=new Set<string>();
 const visit=(key:string)=>{
  if(visiting.has(key))throw new Error(`Roadmap dependencies contain a cycle at ${key}. Request changes before approval.`);
  if(done.has(key))return;
  visiting.add(key);for(const dependency of graph.get(key)??[])visit(dependency);visiting.delete(key);done.add(key);
 };
 for(const task of compiled)visit(task.key);
 return compiled;
}
