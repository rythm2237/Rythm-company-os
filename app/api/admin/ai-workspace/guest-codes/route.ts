import { NextRequest, NextResponse } from "next/server";
import { getPlatformAdminContext } from "@/lib/admin/authorization";
import { generateGuestCode } from "@/lib/ai-workspace/guest";
import { serviceClient } from "@/lib/ai-workspace/service";

export async function POST(request:NextRequest){
  const admin=await getPlatformAdminContext(); if(!admin) return NextResponse.json({error:"PLATFORM_ADMIN_REQUIRED"},{status:403});
  const body=await request.json() as Record<string,unknown>;
  if(typeof body.organizationId!=="string"||typeof body.label!=="string"||body.label.trim().length<1||body.label.length>120) return NextResponse.json({error:"INVALID_GUEST_CODE_REQUEST"},{status:400});
  const initialCreditMicros=Math.trunc(Number(body.initialCreditMicros??0)); const perRequestCapMicros=Math.trunc(Number(body.perRequestCapMicros??100000)); const dailyLimitMicros=Math.trunc(Number(body.dailyLimitMicros??0)); const monthlyLimitMicros=Math.trunc(Number(body.monthlyLimitMicros??0)); const deviceLimit=Math.trunc(Number(body.deviceLimit??1)); const activationLimit=Math.trunc(Number(body.activationLimit??1));
  if([initialCreditMicros,perRequestCapMicros,dailyLimitMicros,monthlyLimitMicros].some(v=>!Number.isSafeInteger(v)||v<0)||deviceLimit<1||deviceLimit>10||activationLimit<1||activationLimit>1000) return NextResponse.json({error:"INVALID_GUEST_LIMITS"},{status:400});
  const client=serviceClient(); const org=await client.from("organizations").select("id").eq("id",body.organizationId).maybeSingle(); if(org.error||!org.data) return NextResponse.json({error:"ORGANIZATION_NOT_FOUND"},{status:404});
  const generated=generateGuestCode();
  const insert=await client.from("aiw_guest_codes").insert({code_hash:generated.hash,label:body.label.trim(),organization_id:body.organizationId,initial_credit_micros:initialCreditMicros,per_request_cap_micros:perRequestCapMicros,daily_limit_micros:dailyLimitMicros,monthly_limit_micros:monthlyLimitMicros,device_limit:deviceLimit,activation_limit:activationLimit,allowed_modes:["auto","fast"],allowed_prompt_profiles:["normal","professional"],created_by:admin.user.id}).select("id,label,status,expires_at,created_at").single();
  if(insert.error) return NextResponse.json({error:"GUEST_CODE_CREATE_FAILED"},{status:503});
  return NextResponse.json({...insert.data,code:generated.code},{status:201,headers:{"cache-control":"no-store"}});
}
