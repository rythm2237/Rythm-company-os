import {NextResponse} from 'next/server';
import {resolveOwnerApiOrganizationContext} from '@/lib/auth/api-organization-context';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {createCustomerForm,customerAnswerMatches} from '@/lib/company-core/customer-forms';
import {canWaive,validateAnswers} from '@/lib/company-core/contract';
import {ensureCompanyCore,recordObligation} from '@/lib/company-core/service';
export const dynamic='force-dynamic';
export async function POST(req:Request){
 const auth=await resolveOwnerApiOrganizationContext();if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 const db=createServerSupabaseClient();if(!db)return NextResponse.json({ok:false,error:'Service unavailable.'},{status:503});
 try{
 const body=await req.json(),projectId=String(body.projectId??'');
 const owned=await db.from('projects').select('id,name').eq('id',projectId).eq('organization_id',auth.organizationId).maybeSingle();if(!owned.data)return NextResponse.json({ok:false,error:'Project not found.'},{status:404});
 await ensureCompanyCore(db,auth.organizationId);
 if(body.action==='refer_customer'){
 const ids=Array.isArray(body.questionIds)?body.questionIds.map(String):[];
 const created=await createCustomerForm(db,auth.organizationId,projectId,ids,String(body.language??'en').slice(0,10),new URL(req.url).origin,body.previousFormId?String(body.previousFormId):undefined);
 const [client,mailbox]=await Promise.all([
 db.from('project_clients').select('email,client_name').eq('organization_id',auth.organizationId).eq('project_id',projectId).maybeSingle(),
 db.from('communication_mailboxes').select('id,address').eq('organization_id',auth.organizationId).eq('is_active',true).limit(1).maybeSingle()]);
 let messageId=null;
 if(client.data?.email&&mailbox.data){
 const thread=await db.from('communication_threads').insert({organization_id:auth.organizationId,project_id:projectId,mailbox_id:mailbox.data.id,subject:`Information needed: ${owned.data.name}`,status:'approval_required'}).select('id').single();if(thread.error)throw new Error(thread.error.message);
 const message=await db.from('communication_messages').insert({organization_id:auth.organizationId,project_id:projectId,thread_id:thread.data.id,mailbox_id:mailbox.data.id,direction:'draft',status:'pending_approval',sender_email:mailbox.data.address,recipients:[client.data.email],subject:`Information needed: ${owned.data.name}`,body_text:`Please complete the project questions using this secure link. You can save a draft and resume. The link expires in seven days.\n\n${created.url}`}).select('id').single();if(message.error)throw new Error(message.error.message);messageId=message.data.id;
 await db.from('project_customer_forms').update({communication_message_id:messageId}).eq('id',created.id);
 }
 await recordObligation(db,{organizationId:auth.organizationId,projectId,key:`form:${created.id}`,action:messageId?'Approve and deliver the customer information email':'Provide project customer email and an active company mailbox',resume:'Customer submits form; manager validates answers'});
 return NextResponse.json({ok:true,formId:created.id,messageId,url:created.url,delivery:'not_sent',nextAction:messageId?'Review email in Inbox before delivery':'Customer email or company mailbox missing'});
 }
 if(body.action==='revoke_form'){
 const r=await db.from('project_customer_forms').update({revoked_at:new Date().toISOString(),status:'revoked'}).eq('organization_id',auth.organizationId).eq('project_id',projectId).eq('id',String(body.formId)).select('id').single();if(r.error)throw new Error(r.error.message);return NextResponse.json({ok:true});
 }
 const gap=await db.from('project_clarification_requests').select('*').eq('organization_id',auth.organizationId).eq('project_id',projectId).eq('id',String(body.questionId)).eq('status','open').single();if(gap.error)throw new Error('Question unavailable.');
 if(body.action==='waive'){
 if(!canWaive(gap.data)||!String(body.reason??'').trim())throw new Error('Only nonessential questions can be waived with a reason.');
 const r=await db.from('project_clarification_requests').update({status:'waived',waiver_reason:String(body.reason),answered_by_user_id:auth.user.id,answered_at:new Date().toISOString()}).eq('id',gap.data.id).eq('status','open').select('id').single();if(r.error)throw new Error(r.error.message);
 }else if(body.action==='answer'){
 if(gap.data.consent_required&&!await customerAnswerMatches(db,auth.organizationId,projectId,gap.data.id,body.answer))throw new Error('Customer consent evidence required.');
 const errors=validateAnswers([gap.data],{[gap.data.id]:body.answer},true);if(errors.length)throw new Error(errors.join(' · '));
 const r=await db.from('project_clarification_requests').update({status:'answered',answer:{value:body.answer},answered_by_user_id:auth.user.id,answered_at:new Date().toISOString()}).eq('id',gap.data.id).eq('status','open').select('id').single();if(r.error)throw new Error(r.error.message);
 }else if(body.action==='explain'){
 return NextResponse.json({ok:true,nextAction:gap.data.reason,details:{stage:gap.data.required_stage,evidence:gap.data.supporting_evidence,assumptions:gap.data.assumptions,omissionPermitted:canWaive(gap.data)}});
 }else throw new Error('Unsupported action.');
 await db.from('project_activity_events').insert({organization_id:auth.organizationId,project_id:projectId,event_type:`project.clarification.${body.action}`,headline:`Clarification ${body.action}`,metadata:{question_id:gap.data.id,user_id:auth.user.id,reason:body.reason??null}});
 return NextResponse.json({ok:true});
 }catch(error){return NextResponse.json({ok:false,error:error instanceof Error?error.message:'Unable to update clarifications.'},{status:409});}
}
export async function GET(req:Request){
 const auth=await resolveOwnerApiOrganizationContext();if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 const db=createServerSupabaseClient();if(!db)return NextResponse.json({ok:false},{status:503});
 const projectId=new URL(req.url).searchParams.get('projectId')??'';
 const owned=await db.from('projects').select('id').eq('id',projectId).eq('organization_id',auth.organizationId).maybeSingle();if(!owned.data)return NextResponse.json({ok:false},{status:404});
 const [gaps,forms]=await Promise.all([db.from('project_clarification_requests').select('*').eq('organization_id',auth.organizationId).eq('project_id',projectId),db.from('project_customer_forms').select('id,status,questions,answers,revision,submitted_at,expires_at,communication_message_id').eq('organization_id',auth.organizationId).eq('project_id',projectId).order('created_at',{ascending:false}).limit(10)]);
 return NextResponse.json({ok:true,questions:gaps.data??[],forms:forms.data??[]},{headers:{'Cache-Control':'no-store'}});
}
