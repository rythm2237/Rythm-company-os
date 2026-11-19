/** Presentation only: keep stored messages and authority gates unchanged. */
export function readableMeetingMessage(content:string):string {
 let parsed:unknown;try{parsed=JSON.parse(content);}catch{return content;}
 if(!parsed||typeof parsed!=='object'||Array.isArray(parsed))return content;
 const record=parsed as Record<string,unknown>;
 const describe=(value:unknown):string=>{
  if(typeof value==='string')return value;
  if(Array.isArray(value))return value.map(item=>'- '+describe(item)).join('\n');
  if(value&&typeof value==='object'){
   const item=value as Record<string,unknown>;
   const humanFields=['title','description','summary','reason','risk'].flatMap(key=>typeof item[key]==='string'?[String(item[key])]:[]);
   return humanFields.length?humanFields.join(' — '):JSON.stringify(value,null,2);
  }
  return value==null?'':String(value);
 };
 const sections=[['executive_summary','Summary'],['position','Position'],['rationale','Rationale'],['challenge','Challenge'],['consensus','Reported consensus'],['disagreements','Disagreements'],['decision','Proposed decision'],['recommendation','Recommendation'],['risks','Risks'],['action_items','Suggested follow-up work'],['required_approvals','Approval recommendations'],['knowledge_updates','Knowledge notes']];
 const text=sections.flatMap(([key,label])=>{
  const value=record[key];if(value==null||value===''||(Array.isArray(value)&&!value.length))return [];
  return [label+'\n'+describe(value)];
 }).join('\n\n');
 return text||content;
}
