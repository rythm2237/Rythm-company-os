import {randomUUID} from 'node:crypto';
import type {SupabaseClient} from '@supabase/supabase-js';
import {createProjectRoadmapDraft} from '@/lib/projects/project-roadmap';
import {recordObligation} from './service';
/** Uses the existing planner, gateway and scheduler; no independent template engine. */
export async function dispatchCompanyPlanning(db:SupabaseClient){
 const worker=randomUUID();
 const claimed=await db.rpc('claim_company_planning_jobs_v1',{worker_id:worker});
 if(claimed.error)throw new Error(claimed.error.message);
 const results=[];
 for(const job of claimed.data??[]){
  try{
   const company=await db.from('organizations').select('owner_user_id').eq('id',job.organization_id).single();
   if(company.error||!company.data.owner_user_id)throw new Error('Human CEO identity unavailable.');
   const roadmap=await createProjectRoadmapDraft(db,job.organization_id,job.project_id,company.data.owner_user_id);
   const saved=await db.from('company_planning_jobs').update({status:'succeeded',lease_owner:null,lease_expires_at:null,result:{roadmap_id:roadmap?.id}}).eq('id',job.id).eq('lease_owner',worker).select('id').maybeSingle();
   if(saved.error||!saved.data)throw new Error('Planning lease changed.');
   await db.from('project_operating_obligations').update({status:'resolved'}).eq('organization_id',job.organization_id).eq('project_id',job.project_id).eq('obligation_key','planning');
   results.push({projectId:job.project_id,status:'roadmap_review'});
  }catch(error){
   const message=error instanceof Error?error.message:'Planning failed';
   const exhausted=job.attempts>=3;
   await db.from('company_planning_jobs').update({status:exhausted?'failed':'queued',lease_owner:null,lease_expires_at:null,next_attempt_at:new Date(Date.now()+job.attempts*3600000).toISOString(),result:{error:message}}).eq('id',job.id).eq('lease_owner',worker);
   await recordObligation(db,{organizationId:job.organization_id,projectId:job.project_id,key:'planning',action:exhausted?`Resolve planning failure after bounded retries: ${message}`:`Planning retry scheduled: ${message}`,resume:exhausted?'Human CEO resolves provider, input, capacity or budget problem; explicitly requests roadmap planning':'Next scheduled bounded planning attempt'});
   results.push({projectId:job.project_id,status:exhausted?'failed':'retrying'});
  }
 }
 return results;
}
