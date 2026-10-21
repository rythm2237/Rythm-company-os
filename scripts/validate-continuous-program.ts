import { strict as assert } from "node:assert";
import fs from "node:fs";
import path from "node:path";
import { canCloseProject, evaluateReviewDue, finishReview, nextReviewDate, type ContinuousProgram } from "../lib/projects/continuous-program";
import { persistentFindings } from "../lib/projects/continuous-program-review-worker";

const program:ContinuousProgram={
 id:"program-1",organizationId:"org-1",projectId:"project-1",
 state:"MONITORING",cadence:"weekly",enabled:true,
 nextReviewAt:"2026-10-18T09:00:00Z",lastReviewAt:null
};
assert.equal(evaluateReviewDue(program,"2026-10-18T08:59:59Z").kind,"skip");
const due=evaluateReviewDue(program,"2026-10-18T09:00:00Z");
assert.equal(due.kind,"review_due");
if(due.kind==="review_due")assert.equal(due.cycleKey,"program-1:2026-10-18T09:00:00.000Z");
assert.equal(evaluateReviewDue({...program,state:"PAUSED"},"2026-10-20T00:00:00Z").kind,"skip");
assert.equal(evaluateReviewDue({...program,enabled:false},"2026-10-20T00:00:00Z").kind,"skip");
const finished=finishReview(program,"2026-10-18T10:00:00Z");
assert.equal(finished.state,"MONITORING");
assert.equal(finished.nextReviewAt,"2026-10-25T09:00:00.000Z");
assert.equal(canCloseProject("continuous","COMPLETED"),false);
assert.equal(canCloseProject("finite","COMPLETED"),true);
assert.equal(nextReviewDate("2026-01-31T00:00:00Z","monthly"),"2026-02-28T00:00:00.000Z");
assert.equal(nextReviewDate("2026-11-30T00:00:00Z","quarterly"),"2027-02-28T00:00:00.000Z");
const observed={id:"snap2",checked_at:"2026-10-21T08:00:00Z",score:87,counts:{warning:2},
 findings:[{id:"homepage.canonical",severity:"medium",title:"Canonical"}, {id:"description",severity:"medium",title:"Meta description"}]};
const prior={...observed,id:"snap1",checked_at:"2026-10-20T08:00:00Z",
 findings:[{id:"homepage.canonical",severity:"medium",title:"Canonical"},{id:"new.issue",severity:"low",title:"New"}]};
assert.deepEqual(persistentFindings(observed,prior).map(f=>f.id),["homepage.canonical"]);
assert.deepEqual(persistentFindings({...observed,findings:[{id:"only.now",severity:"high"}]},prior),[]);
console.log("Continuous Program domain and persistent findings tests passed");

const root=process.cwd();
const read=(p:string)=>fs.readFileSync(path.join(root,p),"utf8");
const migration=read("supabase/migrations/20261018190000_continuous_program_foundation.sql");
const dispatcher=read("app/api/projects/dispatch/route.ts");
const worker=read("lib/projects/continuous-program-review-worker.ts");
const projectPage=read("app/(app)/projects/operating/page.tsx");
for(const required of [
  "alter table public.continuous_programs enable row level security",
  "alter table public.continuous_program_review_cycles enable row level security",
  "constraint continuous_programs_org_site_fk",
  "unique(program_id,scheduled_for)",
  "for update of c skip locked",
  "for update of cy skip locked",
  "guard_continuous_project_close",
  "claim_due_continuous_program_reviews_v1",
  "claim_continuous_review_work_v1",
  "configure_continuous_program_v1",
  "grant execute on function public.configure_continuous_program_v1",
  "to service_role"
])assert.ok(migration.includes(required),`Missing migration invariant: ${required}`);
assert.equal((migration.match(/\$cp\$/g)??[]).length%2,0,"Unbalanced PostgreSQL function delimiter");
assert.ok(!migration.includes("set search_path=public as $\n"),"Invalid bare-dollar function delimiter");
assert.ok(dispatcher.includes('CONTINUOUS_PROGRAM_ENGINE_ENABLED==="true"'),"Scheduler must be feature gated");
assert.ok(dispatcher.includes("processContinuousProgramReviews"),"Scheduler must actually run review worker");
assert.ok(worker.includes('"waiting_for_data"'),"Missing explicit insufficient-data outcome");
assert.ok(worker.includes('status:"draft"'),"Automation must not auto-approve proposals");
assert.ok(worker.includes("agency_seo_snapshots"),"Evidence must come from existing trusted SEO snapshots");
assert.ok(!worker.includes("requestToolExecution"),"Reviews must not execute external actions");
assert.ok(projectPage.includes("saveContinuousProgram"),"Owner-controlled opt-in missing");
console.log("Continuous Program database/API safety contract tests passed");
