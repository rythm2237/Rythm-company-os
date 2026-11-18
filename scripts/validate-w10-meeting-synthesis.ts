import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { PGlite } from "@electric-sql/pglite";
import { isMeetingSynthesizer, selectMeetingSynthesizer } from "../lib/meetings/synthesis-policy";

async function main(){
assert.equal(isMeetingSynthesizer({agent_code:"STRATEGY_DIRECTOR"}),true);
assert.equal(isMeetingSynthesizer({agent_code:"B-001"}),true);
assert.equal(isMeetingSynthesizer({agent_code:"ACCOUNT_MANAGER"}),false);
assert.equal(selectMeetingSynthesizer([{agent_code:"STRATEGY_DIRECTOR",enabled:false}]),undefined);
const db = new PGlite();
await db.exec(`
 create table public.agents(id int primary key,organization_id int,agent_code text,enabled boolean);
 create table public.meeting_agent_participants(session_id int,organization_id int,agent_id int,explicitly_authorized_by_ceo boolean);
 create table public.meeting_agent_sessions(id int primary key,organization_id int,status text);
 insert into public.agents values(1,10,'STRATEGY_DIRECTOR',true),(2,10,'ACCOUNT_MANAGER',true),(3,20,'STRATEGY_DIRECTOR',true),(4,10,'CONTENT_SPECIALIST',true),(5,10,'B-001',true);
`);
await db.exec(await readFile("supabase/migrations/20261118120000_agency_meeting_synthesizer.sql","utf8"));
await db.exec(`create trigger meeting_runtime_guard before update on public.meeting_agent_sessions for each row execute function public.enforce_enabled_agents_before_session_run()`);
let id=0;
async function session(agents:number[],authorized=true){
 const n=++id;
 await db.query("insert into public.meeting_agent_sessions values($1,10,'ready')",[n]);
 for(const agent of agents) await db.query("insert into public.meeting_agent_participants values($1,10,$2,$3)",[n,agent,authorized]);
 return ()=>db.query("update public.meeting_agent_sessions set status='running' where id=$1",[n]);
}
await (await session([1,2]))();
await (await session([5,2]))();
await assert.rejects(await session([2,4]),/synthesis/);
await assert.rejects(await session([1]),/two/);
await assert.rejects(await session([1,2],false),/two/);
await assert.rejects(await session([3,2]),/two/);
await db.exec("update public.agents set enabled=false where id=1");
await assert.rejects(await session([1,2]),/paused/);
await db.close();
console.log("PASS W10 meeting synthesis: Agency and legacy leads accepted; ordinary, paused, unauthorized and foreign-tenant participants rejected by actual PostgreSQL trigger");

}
main().catch(error=>{console.error(error);process.exitCode=1;});
