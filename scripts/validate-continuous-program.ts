import { strict as assert } from "node:assert";
import { canCloseProject, evaluateReviewDue, finishReview, nextReviewDate, type ContinuousProgram } from "../lib/projects/continuous-program";

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
console.log("Continuous Program domain tests passed");
