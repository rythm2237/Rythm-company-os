import { NextRequest, NextResponse } from "next/server";
import { assertSameOrigin, GUEST_COOKIE, GUEST_COOKIE_OPTIONS, parseGuestCookie } from "@/lib/ai-workspace/guest";
import { serviceClient } from "@/lib/ai-workspace/service";

export async function POST(request:NextRequest){
  try{ assertSameOrigin(request); const parsed=parseGuestCookie(request.cookies.get(GUEST_COOKIE)?.value); await serviceClient().rpc("aiw_revoke_guest_session",{p_session_hash:parsed.sessionHash,p_device_hash:parsed.deviceHash}); }catch{/* cookie is cleared even when already invalid */}
  const response=NextResponse.json({ok:true},{headers:{"cache-control":"no-store"}}); response.cookies.set(GUEST_COOKIE,"",{...GUEST_COOKIE_OPTIONS,maxAge:0}); return response;
}
