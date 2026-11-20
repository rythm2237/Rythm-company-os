import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import { PGlite } from '@electric-sql/pglite';

// Execute the same PostgreSQL compare-and-set predicate used by both Owner endpoints
// against a disposable actual database; do not mutate a hosted/prod database.
async function main(){
const db=new PGlite();
await db.exec(`
  create table approval_requests(
    id uuid primary key, organization_id uuid not null, status text not null,
    response_note text, approver_user_id uuid, resolved_at timestamptz
  );
  create table audit_events(id bigserial primary key, approval_id uuid not null);
  insert into approval_requests(id,organization_id,status)
  values ('00000000-0000-4000-8000-000000000012',
          '00000000-0000-4000-8000-000000000013','pending');
`);
const id='00000000-0000-4000-8000-000000000012';
const org='00000000-0000-4000-8000-000000000013';
const user='00000000-0000-4000-8000-000000000014';
async function resolve(tenant:string,resolution:string){
  const query=await db.query<{id:string}>(`
    update approval_requests
    set status=$1,response_note='CEO explicitly chose this outcome',
        resolved_at=now(),approver_user_id=$2
    where id=$3 and organization_id=$4 and status='pending'
    returning id
  `,[resolution,user,id,tenant]);
  // Matches route code: no successful row means no audit.
  if(query.rows.length)await db.query('insert into audit_events(approval_id) values($1)',[id]);
  return query.rows.length;
}
assert.equal(await resolve('00000000-0000-4000-8000-000000000099','approved'),0,
  'Foreign tenant cannot resolve approval');
assert.equal(await resolve(org,'rejected'),1,'First human submission wins');
assert.equal(await resolve(org,'approved'),0,'Replay cannot overwrite rejected decision');
assert.equal(await resolve(org,'rejected'),0,'Repeat identical submission is idempotent');
const status=await db.query<{status:string;count:number}>(`
  select a.status,(select count(*)::int from audit_events) count
  from approval_requests a where id=$1`,[id]);
assert.deepEqual(status.rows[0],{status:'rejected',count:1},
  'No replay or cross-tenant extra audit event');
await db.close();

const decisionPage=await readFile('app/(app)/approvals/decisions/page.tsx','utf8');
const meetingClose=await readFile('app/api/meetings/close/route.ts','utf8');
const meetingWorker=await readFile('lib/projects/project-autonomous-meetings.ts','utf8');
assert.match(decisionPage,/requireOwnerOrganizationContext\(\)/);
assert.match(decisionPage,/\.eq\("status", "pending"\)\s*\.select\("id"\)\.maybeSingle\(\)/,
  'Actual approval handler must verify affected row before audit');
assert.match(decisionPage,/if \(error \|\| !resolved\)/);
assert.match(decisionPage,/approval\.expires_at/);
assert.match(meetingClose,/\.eq\("status","running"\)\.select\("id"\)\.maybeSingle\(\)/,
  'Only the winning closure can emit an audit event');
assert.match(meetingClose,/if\(!closed\)/);
assert.match(meetingWorker,/projectMeetingActionNeedsApproval/);
console.log('PASS W12: disposable real PostgreSQL approval tenant denial, approve/reject conflict and replay (1 winner, 1 audit); Owner and meeting-close source compare-and-set guards');

}
main().catch(error=>{console.error(error);process.exitCode=1;});
