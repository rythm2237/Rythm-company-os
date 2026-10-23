import assert from "node:assert/strict";
import { endSession, isSessionCookie } from "../lib/auth/logout";
import { POST } from "../app/auth/logout/route";
import { NextRequest } from "next/server";

const url = "https://logout-fixture.supabase.co", key = "fixture-public-key", name = "sb-logout-fixture-auth-token";
const session = (expired = false) => ({ access_token: "fixture-access-token", refresh_token: "fixture-refresh-token", token_type: "bearer", expires_in: 3600, expires_at: Math.floor(Date.now()/1000)+(expired?-1000:3600), user: { id: "00000000-0000-4000-8000-000000000001", aud: "authenticated", role: "authenticated", app_metadata: {}, user_metadata: {}, created_at: "2026-01-01T00:00:00Z" } });
const cookie = (expired = false) => ({name, value:"base64-"+Buffer.from(JSON.stringify(session(expired))).toString("base64url")});
async function main() {
 const requests: string[] = [];
 const healthy: typeof fetch = async input => { requests.push(String(input)); return new Response(null,{status:204}); };
 const ok = await endSession({url,key,cookies:[cookie()],fetcher:healthy});
 assert.equal(ok.revoked,true); assert.equal(new URL(requests[0]).searchParams.get("scope"),"local");
 const stalled: typeof fetch = () => new Promise(()=>{});
 const start=performance.now();const timeout=await endSession({url,key,cookies:[cookie()],fetcher:stalled,timeoutMs:30});
 assert.equal(timeout.revoked,false);assert.ok(performance.now()-start<500,"stalled fetch cannot hold logout open");assert.ok(timeout.cookieNames.includes(name));
 for(const expired of [false,true]) {
  let calls=0;const result=await endSession({url,key,cookies:[cookie(expired)],fetcher:async()=>{calls++;return new Response(null,{status:503});},timeoutMs:100});
  assert.equal(result.revoked,false);assert.equal(calls,1,"logout must not retry refresh during an outage");
 }
 const network=await endSession({url,key,cookies:[cookie()],fetcher:async()=>{throw new Error("offline")}});assert.equal(network.revoked,false);
 assert.equal(isSessionCookie(name+".0",name),true);assert.equal(isSessionCookie(name+"-code-verifier.1",name),true);assert.equal(isSessionCookie("sb-other-auth-token",name),false);assert.equal(isSessionCookie(name+".bad",name),false);
 const foreign=await POST(new NextRequest("https://app.example/auth/logout",{method:"POST",headers:{origin:"https://attacker.example"}}));assert.equal(foreign.status,403);
 const absent=await POST(new NextRequest("https://app.example/auth/logout",{method:"POST"}));assert.equal(absent.status,403);
 const oldFetch=globalThis.fetch,oldUrl=process.env.NEXT_PUBLIC_SUPABASE_URL,oldKey=process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
 try {
  process.env.NEXT_PUBLIC_SUPABASE_URL=url;process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=key;globalThis.fetch=healthy;
  const result=await POST(new NextRequest("https://app.example/auth/logout",{method:"POST",headers:{origin:"https://app.example",cookie:`${name}=${cookie().value}; ${name}.1=old-chunk; sb-other-auth-token=preserve; rythm_active_org=old`}}));
  assert.equal(result.status,303);assert.equal(result.headers.get("location"),"https://app.example/login");assert.match(result.headers.get("cache-control")!,/no-store/);
  const deleted=result.cookies.getAll();assert.ok(deleted.some(c=>c.name===name&&c.maxAge===0));assert.ok(deleted.some(c=>c.name===name+".1"&&c.maxAge===0));assert.ok(deleted.some(c=>c.name==="rythm_active_org"));assert.ok(!deleted.some(c=>c.name==="sb-other-auth-token"));
  const anonymous=await POST(new NextRequest("https://app.example/auth/logout",{method:"POST",headers:{origin:"https://app.example"}}));assert.equal(anonymous.status,303);
 } finally {globalThis.fetch=oldFetch;if(oldUrl===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_URL;else process.env.NEXT_PUBLIC_SUPABASE_URL=oldUrl;if(oldKey===undefined)delete process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;else process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY=oldKey;}
 console.log("Logout passed: real SDK local revocation, hung/failed network deadlines, no refresh retries, cookie chunks, tenant isolation, same-origin POST, 303/no-store and anonymous logout (isolated synthetic session).");
}
main().catch(error=>{console.error(error);process.exitCode=1});
