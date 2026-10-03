import {NextResponse} from 'next/server';
import {randomUUID} from 'node:crypto';
import {createServerSupabaseClient} from '@/lib/supabase/server';
import {loadCustomerForm} from '@/lib/company-core/customer-forms';
export const dynamic='force-dynamic';
export async function POST(req:Request,{params}:{params:Promise<{token:string}>}){
 const headers={'Cache-Control':'no-store','Referrer-Policy':'no-referrer'};
 if(req.headers.get('origin')!==new URL(req.url).origin)return NextResponse.json({ok:false},{status:403,headers});
 try{
 const db=createServerSupabaseClient();if(!db)throw new Error('unavailable');const f=await loadCustomerForm(db,(await params).token);if(!['draft','correction'].includes(f.status))throw new Error('Submitted form.');
 if(Number(req.headers.get('content-length')??0)>11*1024*1024)return NextResponse.json({ok:false,error:'Maximum upload size is 10 MB.'},{status:413,headers});
 const body=await req.formData(),file=body.get('file'),questionId=String(body.get('questionId')??'');
 if(!(file instanceof File)||file.size===0||file.size>10*1024*1024||!['application/pdf','image/png','image/jpeg'].includes(file.type))throw new Error('PDF, PNG or JPEG required (max 10 MB).');
 if(!f.questions.some((q:{id:string;input_type:string})=>q.id===questionId&&q.input_type==='file'))throw new Error('Upload not requested.');
 const bytes=new Uint8Array(await file.arrayBuffer());
 const magic=file.type==='application/pdf'?String.fromCharCode(...bytes.slice(0,5))==='%PDF-':file.type==='image/png'?bytes.slice(0,4).join(',')==='137,80,78,71':bytes[0]===255&&bytes[1]===216;
 if(!magic)throw new Error('File format mismatch.');
 const path=`${f.organization_id}/${f.project_id}/customer/${f.id}/${randomUUID()}`;
 const r=await db.storage.from('project-files').upload(path,bytes,{contentType:file.type,upsert:false});if(r.error)throw new Error('Upload unavailable.');
 return NextResponse.json({ok:true,file:{storage_path:path,name:file.name.replace(/[^a-zA-Z0-9._ -]/g,'_').slice(0,120),mime_type:file.type,byte_size:file.size,form_id:f.id}},{headers});
 }catch{return NextResponse.json({ok:false,error:'Upload could not be accepted.'},{status:409,headers});}
}
