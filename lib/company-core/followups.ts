import type {SupabaseClient} from '@supabase/supabase-js';
export async function persistFollowups(db:SupabaseClient,task:{id:string;lease_owner:string;assigned_agent_id:string;input?:Record<string,unknown>},raw:unknown){
 const depth=Number(task.input?.followup_depth??0);
 if(depth>=2)return;
 for(const item of (Array.isArray(raw)?raw:[]).slice(0,8)){
  if(!item||typeof item!=='object')continue;
  const f=item as Record<string,unknown>,key=String(f.key??'').replace(/[^a-zA-Z0-9_-]/g,'').slice(0,50);
  if(!key||typeof f.title!=='string'||typeof f.description!=='string')continue;
  const r=await db.rpc('reserve_company_followup_v1',{source_task:task.id,source_lease:task.lease_owner,followup_key:key,followup_title:f.title.slice(0,240),followup_description:f.description.slice(0,6000),followup_owner:typeof f.agent_id==='string'?f.agent_id:task.assigned_agent_id});
  if(r.error)throw new Error(`Follow-up reservation failed: ${r.error.message}`);
 }
}
