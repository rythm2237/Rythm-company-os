import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, generateGuestCredentials, GUEST_COOKIE, GUEST_COOKIE_OPTIONS, hashGuestCode } from "@/lib/ai-workspace/guest";
import { AIWorkspaceError, serviceClient } from "@/lib/ai-workspace/service";

export const runtime="nodejs";
export async function POST(request:NextRequest){
  try{
    assertSameOrigin(request);
    const body=await request.json() as {code?:unknown};
    if(typeof body.code!=="string"||body.code.length>80) throw new AIWorkspaceError("INVALID_GUEST_CODE",403);
    const credentials=generateGuestCredentials();
    const client=serviceClient();
    const result=await client.rpc("aiw_activate_guest_session",{p_code_hash:hashGuestCode(body.code),p_device_hash:credentials.device.hash,p_session_hash:credentials.session.hash});
    if(result.error||!result.data||typeof result.data!=="object") throw new AIWorkspaceError("INVALID_GUEST_CODE",403);
    const response=NextResponse.json({access:"guest",...(result.data as object)},{status:201,headers:{"cache-control":"no-store"}});
    response.cookies.set(GUEST_COOKIE,credentials.cookie,{...GUEST_COOKIE_OPTIONS,maxAge:7*24*60*60});
    return response;
  }catch(error){ const status=error instanceof AIWorkspaceError?error.status:503; const code=error instanceof AIWorkspaceError?error.code:"GUEST_ACTIVATION_FAILED"; return NextResponse.json({error:code},{status}); }
}
