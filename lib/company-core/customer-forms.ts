import {createHash,randomBytes} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {validateAnswers,type Clarification} from './contract';
export const hashFormToken=(token:string)=>createHash('sha256').update(token).digest('hex');
export async function loadCustomerForm(db:SupabaseClient,token:string){
 if(!/^[a-f0-9]{64}$/.test(token))throw new Error('Form unavailable.');
 const r=await db.from('project_customer_forms').select('*').eq('token_hash',hashFormToken(token)).is('revoked_at',null).gt('expires_at',new Date().toISOString()).maybeSingle();
 if(r.error||!r.data)throw new Error('Form unavailable or expired.');
 return r.data;
}
export function publicForm(f:Record<string,unknown>){return {questions:f.questions,answers:f.answers,revision:f.revision,status:f.status,language:f.language,submittedAt:f.submitted_at};}
export async function createCustomerForm(db:SupabaseClient,org:string,project:string,ids:string[],language:string,origin:string,previousId?:string){
 if(!ids.length||ids.length>50)throw new Error('Select 1–50 questions.');
 const gaps=await db.from('project_clarification_requests').select('*').eq('organization_id',org).eq('project_id',project).eq('status','open').in('id',ids);
 if(gaps.error||gaps.data?.length!==new Set(ids).size)throw new Error('Selected questions unavailable.');
 const token=randomBytes(32).toString('hex');
 // Explicit allowlist: no internal reasons, costs, assumptions or supporting notes leak.
 let questions=(gaps.data??[]).map(q=>({id:q.id,question:q.question,input_type:q.input_type,options:q.options,materiality:q.materiality,condition:q.display_condition&&ids.includes(q.display_condition.questionId)?{questionId:q.display_condition.questionId,equals:q.display_condition.equals}:null}));
 let priorAnswers:Record<string,unknown>={};
 let prior=null;
 if(previousId){const old=await db.from('project_customer_forms').select('id,questions,answers,clarification_version').eq('organization_id',org).eq('project_id',project).eq('id',previousId).single();if(old.error)throw new Error('Previous correction round unavailable.');prior=old.data;priorAnswers=prior.answers;const currentIds=new Set(questions.map(q=>q.id));questions=[...prior.questions.filter((q:Clarification)=>!currentIds.has(q.id)),...questions];}
 const version=Math.max(1,...(gaps.data??[]).map(q=>q.clarification_version),Number(prior?.clarification_version??0)+1);
 const saved=await db.from('project_customer_forms').insert({organization_id:org,project_id:project,token_hash:hashFormToken(token),clarification_version:version,language,questions,answers:priorAnswers,previous_form_id:previousId??null,expires_at:new Date(Date.now()+7*86400000).toISOString()}).select('id').single();
 if(saved.error)throw new Error(saved.error.message);
 return {id:saved.data.id,url:`${origin}/customer-forms/${token}`,version,questions};
}
export async function saveCustomerAnswers(db:SupabaseClient,token:string,revision:number,answers:Record<string,unknown>,submit:boolean){
 const f=await loadCustomerForm(db,token);
 const allowed=new Set((f.questions as Clarification[]).map(q=>q.id));
 if(Object.keys(answers).some(key=>!allowed.has(key)))throw new Error('Unexpected question.');
 const merged={...f.answers,...answers};
 for(const q of f.questions as Clarification[]){if(q.input_type!=='file'||!merged[q.id])continue;const file=merged[q.id] as Record<string,unknown>;if(!file||!String(file.storage_path??'').startsWith(`${f.organization_id}/${f.project_id}/customer/${file.form_id}/`))throw new Error('File scope mismatch.');
 // New uploads belong to this form. Older uploads are accepted only when copied unchanged by the server into this correction round.
 if(file.form_id!==f.id&&JSON.stringify(file)!==JSON.stringify(f.answers[q.id]))throw new Error('File scope mismatch.');
 const path=String(file.storage_path);const folder=path.slice(0,path.lastIndexOf('/'));const name=path.slice(path.lastIndexOf('/')+1);
 const stored=await db.storage.from('project-files').list(folder,{search:name,limit:2});
 if(stored.error||!stored.data.some(item=>item.name===name))throw new Error('Uploaded file unavailable.');}
 const errors=validateAnswers(f.questions,merged,submit);
 // A submitted correction packet returns to the manager even when required answers are unknown.
 const r=await db.rpc('save_project_customer_form_v1',{form_token_hash:hashFormToken(token),expected_revision:revision,new_answers:merged,submit_form:submit,validation_errors:errors});
 if(r.error)throw new Error(r.error.message);
 return {revision:r.data,errors,submitted:submit};
}

export async function customerAnswerMatches(db:SupabaseClient,org:string,project:string,question:string,answer:unknown){
 const r=await db.rpc('customer_answer_matches_v1',{target_org:org,target_project:project,question_id:question,answer_value:answer});
 if(r.error)throw new Error('Customer source evidence unavailable.');return r.data===true;
}
