import {NextResponse} from 'next/server';
import {resolveOwnerApiOrganizationContext} from '@/lib/auth/api-organization-context';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {executeAiRequest} from '@/lib/ai/request-gateway';
import {getRuntimeConfig} from '@/lib/runtime-config';
import {ensureCompanyCore} from '@/lib/company-core/service';
import {EXECUTIVE_INSTRUCTIONS} from '@/lib/company-core/contract';
import {EXECUTIVE_SCENARIOS,scoreExecutiveEvaluation} from '@/lib/company-core/executive-evaluation';
export const runtime='nodejs';export const maxDuration=300;
export async function POST(){
 const auth=await resolveOwnerApiOrganizationContext();if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 const db=createServerSupabaseClient();if(!db)return NextResponse.json({ok:false,error:'Service unavailable.'},{status:503});
 try{
 const owner=await ensureCompanyCore(db,auth.organizationId),config=getRuntimeConfig();if(!config.openAIConfigured||!config.dryRunModel)throw new Error('AI Gateway provider unavailable.');
 const profile=await db.from('agents').select('system_instructions,skills').eq('organization_id',auth.organizationId).eq('id',owner).single();if(profile.error)throw new Error(profile.error.message);
 const results=[];
 for(const scenario of EXECUTIVE_SCENARIOS){
 const response=await executeAiRequest({organizationId:auth.organizationId,actor:{type:'system'},context:{},feature:'internal.unspecified',systemInstructions:EXECUTIVE_INSTRUCTIONS+' Isolated evaluation; synthetic data only. Never perform external actions. Agent profile: '+JSON.stringify(profile.data),prompt:`${scenario.prompt} Return JSON only: {action,owner,next_action,spend_authorized:false,external_action_executed:false}. Possible actions: ${EXECUTIVE_SCENARIOS.map(s=>s.expected).join(', ')}`,mode:'task',maxOutputTokens:500,timeoutMs:config.agentTimeoutMs,telemetryPolicy:'required',legacyFallback:{provider:'openai',model:config.dryRunModel,reason:'compatibility'}});
 const parsed=JSON.parse(response.outputText.replace(/^```json\s*/,'').replace(/```\s*$/,''));results.push({scenario:scenario.key,...scoreExecutiveEvaluation(scenario.key,parsed),output:parsed,correlation_id:response.correlationId});
 }
 const saved=await db.from('company_operating_evaluations').insert({organization_id:auth.organizationId,agent_id:owner,suite_version:'1.0',results,requested_by_user_id:auth.user.id}).select('id').single();if(saved.error)throw new Error(saved.error.message);
 return NextResponse.json({ok:true,id:saved.data.id,results,scope:'Synthetic decision evaluations; this does not establish MBA-equivalent or live execution competence.'});
 }catch(e){return NextResponse.json({ok:false,error:e instanceof Error?e.message:'Evaluation failed.'},{status:409});}
}
