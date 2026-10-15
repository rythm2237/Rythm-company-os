import {NextResponse} from "next/server";
import {resolveOwnerApiOrganizationContext} from "@/lib/auth/api-organization-context";
export async function GET(request:Request){
 const auth=await resolveOwnerApiOrganizationContext();if(!auth.ok)return NextResponse.json({error:auth.error},{status:auth.status});
 const params=new URL(request.url).searchParams;const projectId=params.get("projectId"),itemId=params.get("itemId");
 if(!projectId||!itemId)return NextResponse.json({error:"Project and work item required."},{status:400});
 const project=await auth.supabase.from("projects").select("id").eq("organization_id",auth.organizationId).eq("id",projectId).maybeSingle();
 if(!project.data)return NextResponse.json({error:"Project not found."},{status:404});
 const task=await auth.supabase.from("project_task_runs").select("id,title,status,priority,input,safe_result,dependencies,error_message,started_at,completed_at,attempt_count,waiting_on_approval_id").eq("organization_id",auth.organizationId).eq("project_id",projectId).eq("id",itemId).maybeSingle();
 if(task.error)return NextResponse.json({error:"Work details unavailable."},{status:503});
 if(task.data)return NextResponse.json({item:task.data});
 const action=await auth.supabase.from("action_items").select("id,title,status,priority,description,dependencies,success_criteria,evidence_required,completed_at,due_at").eq("organization_id",auth.organizationId).eq("project_id",projectId).eq("id",itemId).maybeSingle();
 return action.data?NextResponse.json({item:action.data}):NextResponse.json({error:"Work item not found."},{status:404});
}
