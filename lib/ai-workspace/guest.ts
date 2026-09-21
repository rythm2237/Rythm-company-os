import { createHash, randomBytes } from "node:crypto";
import type { NextRequest } from "next/server";
import type { SupabaseClient } from "@supabase/supabase-js";
import { AIWorkspaceError } from "@/lib/ai-workspace/service";

export const GUEST_COOKIE = "__Host-rythm-ai-guest";
export const GUEST_COOKIE_OPTIONS = { httpOnly: true, secure: true, sameSite: "strict" as const, path: "/" };

export function generateGuestCode() {
  const code = `RYTHM-${randomBytes(24).toString("hex").toUpperCase()}`;
  return { code, hash: hashGuestCode(code) };
}
export function hashGuestCode(code: string) {
  const normalized=code.trim().toUpperCase();
  if(!/^RYTHM-[A-F0-9]{48}$/.test(normalized)) throw new AIWorkspaceError("INVALID_GUEST_CODE",403);
  return createHash("sha256").update(`rythm:ai:guest-code:v1:${normalized}`).digest("hex");
}
function credential() { const value=randomBytes(32).toString("base64url"); return { value, hash:createHash("sha256").update(`rythm:ai:guest-session:v1:${value}`).digest("hex") }; }
export function generateGuestCredentials(){ const device=credential(); const session=credential(); return { device,session,cookie:`${device.value}.${session.value}` }; }
function parseCredential(value:string){ if(!/^[A-Za-z0-9_-]{43}$/.test(value)) throw new AIWorkspaceError("INVALID_GUEST_SESSION",401); return createHash("sha256").update(`rythm:ai:guest-session:v1:${value}`).digest("hex"); }
export function parseGuestCookie(value:string|undefined){ if(!value) throw new AIWorkspaceError("AUTH_REQUIRED",401); const parts=value.split("."); if(parts.length!==2) throw new AIWorkspaceError("INVALID_GUEST_SESSION",401); return { deviceHash:parseCredential(parts[0]),sessionHash:parseCredential(parts[1]) }; }
export function assertSameOrigin(request: NextRequest){ const origin=request.headers.get("origin"); if(!origin||origin!==request.nextUrl.origin) throw new AIWorkspaceError("ORIGIN_REJECTED",403); }

export type GuestAccess={accountId:string;workspaceId:string;projectId:string;conversationId:string;walletId:string;organizationId:string;allowedModes:string[];allowedPromptProfiles:string[];allowedModels:string[];maxRequestMicros:number;currency:string};
export async function resolveGuestAccess(request:NextRequest,client:SupabaseClient):Promise<GuestAccess>{
  const parsed=parseGuestCookie(request.cookies.get(GUEST_COOKIE)?.value);
  const result=await client.rpc("aiw_validate_guest_session",{p_session_hash:parsed.sessionHash,p_device_hash:parsed.deviceHash});
  if(result.error||!result.data||typeof result.data!=="object") throw new AIWorkspaceError("GUEST_ACCESS_EXPIRED_OR_REVOKED",403);
  const data=result.data as Record<string,unknown>;
  for(const key of ["accountId","workspaceId","projectId","conversationId","walletId","organizationId","currency"]) if(typeof data[key]!=="string") throw new AIWorkspaceError("INVALID_GUEST_SESSION",401);
  return data as unknown as GuestAccess;
}
