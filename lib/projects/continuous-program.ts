/**
 * Shared Continuous Program domain. This module never executes external work and
 * cannot authorize decisions; it computes the next review intent from trusted state.
 */
export type ProgramKind = "finite" | "campaign" | "continuous";
export type ProgramState = "SETUP" | "BASELINE" | "INITIAL_IMPLEMENTATION" |
  "VALIDATION" | "MONITORING" | "OPTIMIZING" | "WAITING_FOR_DATA" |
  "BLOCKED" | "PAUSED" | "CANCELLED" | "ARCHIVED";
export type ReviewCadence = "daily" | "weekly" | "monthly" | "quarterly";
export type ReviewState = "scheduled" | "running" | "waiting_for_data" |
  "awaiting_approval" | "completed" | "failed" | "cancelled";

export interface ContinuousProgram {
  id:string;
  organizationId:string;
  projectId:string;
  state:ProgramState;
  cadence:ReviewCadence;
  nextReviewAt:string|null;
  lastReviewAt:string|null;
  enabled:boolean;
}
export type ReviewDecision =
  | {kind:"skip";reason:string}
  | {kind:"review_due";programId:string;projectId:string;organizationId:string;scheduledFor:string;cycleKey:string};

const halted = new Set<ProgramState>(["BLOCKED","PAUSED","CANCELLED","ARCHIVED"]);
const iso = (value:string) => {
  const d=new Date(value);
  if(!Number.isFinite(d.valueOf())) throw new Error("Invalid review timestamp");
  return d.toISOString();
};

/** UTC calendar arithmetic avoids fixed-day assumptions for months and quarters. */
export function nextReviewDate(anchor:string,cadence:ReviewCadence):string {
  const date=new Date(iso(anchor));
  if(cadence==="daily")date.setUTCDate(date.getUTCDate()+1);
  else if(cadence==="weekly")date.setUTCDate(date.getUTCDate()+7);
  else {
    const months=cadence==="monthly"?1:3;
    const day=date.getUTCDate();
    date.setUTCDate(1);
    date.setUTCMonth(date.getUTCMonth()+months);
    const maxDay=new Date(Date.UTC(date.getUTCFullYear(),date.getUTCMonth()+1,0)).getUTCDate();
    date.setUTCDate(Math.min(day,maxDay));
  }
  return date.toISOString();
}

/** Stable idempotency key prevents duplicate cycle creation when dispatch retries. */
export function reviewCycleKey(programId:string,scheduledFor:string) {
  return `${programId}:${iso(scheduledFor)}`;
}

export function evaluateReviewDue(program:ContinuousProgram,now:string):ReviewDecision {
  if(!program.enabled)return {kind:"skip",reason:"Monitoring disabled"};
  if(halted.has(program.state))return {kind:"skip",reason:`Program is ${program.state}`};
  if(!program.nextReviewAt)return {kind:"skip",reason:"Review schedule not configured"};
  const scheduledFor=iso(program.nextReviewAt);
  if(new Date(scheduledFor).getTime()>new Date(iso(now)).getTime())
    return {kind:"skip",reason:"Next review is not due"};
  return {kind:"review_due",programId:program.id,projectId:program.projectId,
    organizationId:program.organizationId,scheduledFor,cycleKey:reviewCycleKey(program.id,scheduledFor)};
}

/** Review completion does not complete or close the parent program. */
export function finishReview(program:ContinuousProgram,reviewedAt:string):ContinuousProgram {
  if(halted.has(program.state))throw new Error("Halted program cannot complete a review");
  return {...program,lastReviewAt:iso(reviewedAt),
    nextReviewAt:nextReviewDate(program.nextReviewAt??reviewedAt,program.cadence),
    state:program.state==="OPTIMIZING"?"OPTIMIZING":"MONITORING"};
}

export function canCloseProject(kind:ProgramKind,requestedState:string):boolean {
  return kind!=="continuous" || !["COMPLETED","CLOSEOUT"].includes(requestedState.toUpperCase());
}
