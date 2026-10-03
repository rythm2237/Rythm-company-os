import {NextResponse} from 'next/server';
import {resolveOwnerApiOrganizationContext} from '@/lib/auth/api-organization-context';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {ensureCompanyCore} from '@/lib/company-core/service';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const auth=await resolveOwnerApiOrganizationContext();if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 const db=createServerSupabaseClient();if(!db)return NextResponse.json({ok:false},{status:503});
 const projectId=new URL(req.url).searchParams.get('projectId')??'';
 const p=await db.from('projects').select('id,name,status,stage,accountable_agent_id,implementation_progress,verification_progress,acceptance_progress,closeout_progress,next_required_action').eq('organization_id',auth.organizationId).eq('id',projectId).maybeSingle();if(!p.data)return NextResponse.json({ok:false},{status:404});
 const [team,budgets,obligations,reservations,proposals]=await Promise.all([
 db.from('agents').select('id,name,role_title,agent_status,enabled,reports_to_agent_id,department_id').eq('organization_id',auth.organizationId).neq('agent_status','archived'),
 db.from('project_budget_accounts').select('*').eq('organization_id',auth.organizationId).eq('project_id',projectId),
 db.from('project_operating_obligations').select('*').eq('organization_id',auth.organizationId).eq('project_id',projectId).not('status','in','(resolved,cancelled)'),
 db.from('project_budget_reservations').select('id,account_id,amount,actual_amount,status,evidence').eq('organization_id',auth.organizationId),
 db.from('project_proposals').select('id,title,external_action_required,execution_result').eq('organization_id',auth.organizationId).eq('project_id',projectId).eq('status','approved')]);
 if([team,budgets,obligations,reservations,proposals].some(r=>r.error))return NextResponse.json({ok:false,error:'Operating state unavailable.'},{status:503});
 const accounts=(budgets.data??[]).map(b=>{const costs=(reservations.data??[]).filter(r=>r.account_id===b.id);const committed=costs.filter(r=>['reserved','uncertain'].includes(r.status)).reduce((n,r)=>n+Number(r.amount),0);const actual=costs.filter(r=>r.status==='charged').reduce((n,r)=>n+Number(r.actual_amount),0);return {...b,committed,actual,remaining:Number(b.authorized_ceiling)-committed-actual,reservations:costs};});
 return NextResponse.json({ok:true,project:p.data,team:team.data??[],budgets:accounts,obligations:obligations.data??[],proposals:proposals.data??[]},{headers:{'Cache-Control':'no-store'}});
}
export async function POST(req:Request){
 const auth=await resolveOwnerApiOrganizationContext();if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 const db=createServerSupabaseClient();if(!db)return NextResponse.json({ok:false},{status:503});
 try{
 const body=await req.json(),projectId=String(body.projectId??'');
 const p=await db.from('projects').select('id').eq('organization_id',auth.organizationId).eq('id',projectId).maybeSingle();if(!p.data)return NextResponse.json({ok:false},{status:404});
 await ensureCompanyCore(db,auth.organizationId);
 if(body.action==='review_execution'){
 if(typeof body.externalRequired!=='boolean'||body.noReplayConfirmed!==true||!String(body.evidence??'').trim())throw new Error('Record execution intent and evidence; check completed external references before continuing.');
 const proposal=await db.from('project_proposals').select('id,execution_result,bridge_lease_expires_at').eq('organization_id',auth.organizationId).eq('project_id',projectId).eq('id',String(body.proposalId)).eq('status','approved').single();if(!proposal.data)throw new Error('Approved proposal unavailable.');
 if(proposal.data.bridge_lease_expires_at&&new Date(proposal.data.bridge_lease_expires_at).valueOf()>Date.now())throw new Error('Execution planning is in progress. Review after its lease ends.');
 const prior=proposal.data.execution_result??{};
 if(['dispatched','completed'].includes(prior.bridge_status))throw new Error('Dispatched actions must be reconciled rather than replayed.');
 const history=Array.isArray(prior.bridge_review_history)?prior.bridge_review_history:[];
 const changed=await db.from('project_proposals').update({external_action_required:body.externalRequired,execution_result:{...prior,bridge_status:body.externalRequired?'pending':'no_external_action',bridge_attempts:0,bridge_next_attempt_at:null,bridge_review_history:[...history,{actor:auth.user.id,evidence:body.evidence,external_required:body.externalRequired,prior_status:prior.bridge_status,recorded_at:new Date().toISOString()}]}}).eq('id',proposal.data.id).eq('organization_id',auth.organizationId).eq('status','approved').or(`bridge_lease_expires_at.is.null,bridge_lease_expires_at.lt.${new Date().toISOString()}`).select('id').maybeSingle();if(changed.error||!changed.data)throw new Error(changed.error?.message??'Execution lease changed; reload before reviewing.');
 await db.from('project_operating_obligations').update({status:'resolved'}).eq('organization_id',auth.organizationId).eq('project_id',projectId).in('obligation_key',[`proposal:${proposal.data.id}:legacy-review`,`proposal:${proposal.data.id}:execution`]);
 return NextResponse.json({ok:true,nextAction:body.externalRequired?'Scoped execution continuation recorded; missing capabilities and connections remain governed':'Internal-only intent recorded with evidence'});
 }
 if(body.action==='budget'){
 if(!['media','service_fees','third_party','internal'].includes(body.category)||!/^\d{4}-\d{2}-\d{2}$/.test(body.periodStart)||!/^\d{4}-\d{2}-\d{2}$/.test(body.periodEnd)||!/^[A-Z]{3}$/.test(body.currency))throw new Error('Valid budget category, currency and period required.');
 const ceiling=Number(body.authorizedCeiling??0);if(!Number.isFinite(ceiling)||ceiling<0)throw new Error('Invalid spending ceiling.');
 if(ceiling>0&&(!body.authorize||!String(body.authorizationReference??'').trim()))throw new Error('Explicit manager authorization and source reference are required.');
 const r=await db.from('project_budget_accounts').insert({organization_id:auth.organizationId,project_id:projectId,category:body.category,currency:body.currency,period_start:body.periodStart,period_end:body.periodEnd,approximate_min:body.approximateMin??null,approximate_max:body.approximateMax??null,authorized_ceiling:ceiling,authorized_by_user_id:ceiling>0?auth.user.id:null,authorization_evidence:ceiling>0?{reference:body.authorizationReference,actor:auth.user.id,recorded_at:new Date().toISOString()}: {},includes_media:body.includesMedia===true,includes_service_fees:body.includesServiceFees===true,approval_threshold:body.approvalThreshold??null}).select('id').single();if(r.error)throw new Error(r.error.message);
 return NextResponse.json({ok:true,id:r.data.id});
 }
 if(body.action==='satisfy_conditions'){
 if(!String(body.evidence??'').trim())throw new Error('Evidence for satisfied conditions required.');
 const gate=await db.from('approval_requests').select('id,status,decision_kind,subject_type,subject_id').eq('organization_id',auth.organizationId).eq('project_id',projectId).eq('id',String(body.approvalId)).single();
 if(!gate.data||gate.data.status!=='approved'||gate.data.decision_kind!=='conditional')throw new Error('Conditional approval unavailable.');
 const validated=await db.from('approval_requests').update({conditions_satisfied:true}).eq('id',gate.data.id).eq('organization_id',auth.organizationId);if(validated.error)throw new Error(validated.error.message);
 const resumed=await db.from('project_task_runs').update({status:'queued',next_attempt_at:new Date().toISOString()}).eq('project_id',projectId).eq('organization_id',auth.organizationId).eq('status','waiting_for_data').contains('input',{conditional_approval_id:gate.data.id});if(resumed.error)throw new Error(resumed.error.message);
 await db.from('project_operating_obligations').update({status:'resolved',evidence:{approval_id:gate.data.id,validation:body.evidence,actor:auth.user.id}}).eq('organization_id',auth.organizationId).eq('project_id',projectId).eq('obligation_key',`approval:${gate.data.id}`);
 return NextResponse.json({ok:true});
 }
 if(body.action==='cost_receipt'){
 const r=await db.from('project_budget_reservations').select('id,account_id').eq('organization_id',auth.organizationId).eq('id',String(body.reservationId)).single();if(!r.data)throw new Error('Reservation unavailable.');
 const a=await db.from('project_budget_accounts').select('id').eq('organization_id',auth.organizationId).eq('project_id',projectId).eq('id',r.data.account_id).single();if(!a.data)throw new Error('Reservation belongs to another project.');
 if(!String(body.receipt??'').trim())throw new Error('Provider receipt reference required.');
 const result=await db.rpc('reconcile_project_budget_v1',{target_org:auth.organizationId,target_reservation:r.data.id,new_status:'charged',actual_cost:Number(body.actualCost),cost_evidence:{receipt:body.receipt,actor:auth.user.id}});if(result.error)throw new Error(result.error.message);return NextResponse.json({ok:true});
 }
 throw new Error('Unsupported operating action.');
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Request failed.'},{status:409});}
}
