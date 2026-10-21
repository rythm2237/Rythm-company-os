import {NextResponse} from 'next/server';
import {resolveOwnerApiOrganizationContext} from '@/lib/auth/api-organization-context';
import {createServerSupabaseClient} from '@/lib/supabase/server';
export const dynamic='force-dynamic';
export async function GET(req:Request){
 const auth=await resolveOwnerApiOrganizationContext();if(!auth.ok)return NextResponse.json({ok:false,error:auth.error},{status:auth.status});
 const db=createServerSupabaseClient();if(!db)return NextResponse.json({ok:false},{status:503});
 const params=new URL(req.url).searchParams;
 const form=await db.from('project_customer_forms').select('organization_id,project_id,answers').eq('id',params.get('formId')??'').eq('project_id',params.get('projectId')??'').eq('organization_id',auth.organizationId).maybeSingle();
 const file=form.data?.answers?.[params.get('questionId')??''];
 if(!file||!String(file.storage_path??'').startsWith(`${auth.organizationId}/${form.data?.project_id}/customer/${file.form_id}/`))return NextResponse.json({ok:false,error:'File unavailable.'},{status:404});
 const signed=await db.storage.from('project-files').createSignedUrl(file.storage_path,60,{download:file.name});
 if(signed.error)return NextResponse.json({ok:false,error:'File unavailable.'},{status:404});
 return NextResponse.json({ok:true,url:signed.data.signedUrl},{headers:{'Cache-Control':'no-store','Referrer-Policy':'no-referrer'}});
}
