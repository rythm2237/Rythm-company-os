import { readFileSync, mkdirSync, writeFileSync } from "node:fs";
import { join, dirname } from "node:path";

/** Evidence register, not a substitute for human source/security signoff. */
const manifest = JSON.parse(readFileSync("test-results/w06-privileged-boundaries.json", "utf8"));
const history = JSON.parse(readFileSync("docs/security/w03-api-coverage.json", "utf8"));
const routeMap = new Map(history.routes.map(route => [route.path, route]));
const proofs = new Map([
  ["app/api/projects/dispatch/route.ts", ["test:w06-backend", "live W03 staging routes"]],
  ["app/api/admin/automation/dispatch/route.ts", ["test:w06-backend"]],
  ["app/api/billing/webhook/route.ts", ["test:w06-backend"]],
  ["app/api/communication/inbound/resend/route.ts", ["test:w06-backend"]],
  ["app/api/communication/inbound/cloudflare/route.ts", ["test:w06-backend"]],
  ["app/api/agents/[code]/benchmark/route.ts", ["test:w06-evaluation"]],
  ["app/api/projects/analyze/route.ts", ["test:w06-project-gates"]],
  ["app/api/projects/completion/route.ts", ["test:w06-project-gates"]],
  ["app/api/projects/roadmap/route.ts", ["test:w06-project-gates"]],
  ["lib/integrations/connections/agent-oauth-callback.ts", ["test:w06-agent-oauth-tenant"]],
  ["supabase/functions/two-nya-push/index.ts", ["test:w06-edge-push", "live production signed and unsigned smoke"]],
]);
const dangerousSink = /(?:console\.(?:log|warn|error)|last_error_message|error_message|error\s*:|reason\s*:|detail\s*:)/;
const evidence = manifest.rows.map(r => {
  const source = readFileSync(r.path, "utf8");
  const lines = source.split("\n");
  const boundaries = [
    ...source.matchAll(/\b(?:requireOwnerOrganizationContext|requireActiveOwnerOrganizationContext|requireOwnerApiOrganizationContext|requirePlatformAdmin|resolveOwnerApiOrganizationContext|requireOrganizationContext|resolveOrganizationContext|auth\.getUser|authorizeDispatcher|verifySvixSignature|timingSafeEqual|resolveGuestAccess|assertSameOrigin)\s*\(/g),
  ].slice(0, 20).map(m => ({marker:m[0].replace(/\s*\($/, ""),line:source.slice(0,m.index).split("\n").length}));
  const calls = lines.flatMap((line,idx) => {
    const found = [...line.matchAll(/\b(?:createServerSupabaseClient|createBillingAdminClient|createAnalyticsAdminClient|createKnowledgeAdminClient|createEvaluationAdminClient|createWorkforceAdminClient|createExecutionServiceClient|serviceClient)\s*\(/g)];
    return found.map(m=>({symbol:m[0].replace(/\s*\($/,""),line:idx+1,definition:/\bfunction\b|\bexport\b/.test(line.slice(0,m.index))}));
  });
  const dbTables = Array.from(new Set([...source.matchAll(/\.from\s*\(\s*["']([\w.-]+)["']\s*\)/g)].map(m=>m[1]))).sort();
  const rpcNames = Array.from(new Set([...source.matchAll(/\.rpc\s*\(\s*["']([\w.-]+)["']/g)].map(m=>m[1]))).sort();
  const status = routeMap.get(r.path);
  const exactProof = proofs.get(r.path)??[];
  const sensitiveLines = lines.flatMap((line,idx)=>dangerousSink.test(line)&&/\.message|redactSecretText\(|\berror\b/.test(line)?[idx+1]:[]).slice(0,15);
  const reviewStatus = r.type==="script-or-test"?"SCRIPT_REVIEW_PENDING":
    exactProof.length?"TESTED_SELECTED_BRANCHES_MANUAL_REVIEW_PENDING":
    status?.httpCaseStatus==="PASS_LISTED_CASES_ONLY"?"HISTORICAL_HTTP_LISTED_ONLY_MANUAL_REVIEW_PENDING":"MANUAL_REVIEW_PENDING";
  return {
    path:r.path,priority:r.priority,type:r.type,referenceCount:r.hits.length,
    privilegedClientCalls:calls,recognizedGateMarkers:boundaries,
    tables:dbTables,rpcs:rpcNames,guardMarkers:r.guards,
    historicRouteEvidence:status?{status:status.httpCaseStatus,sourceSha:history.testedSha,
      runIds:status.httpEvidence?.runIds??[],caseDepth:status.httpEvidence?.depth??null}:null,
    isolatedEvidence:exactProof,diagnosticTriageLines:sensitiveLines,
    reviewStatus,manualApproval:null,risksOrDecisions:[],
  };
});
const summary = {
  sourceVersion:"W06-acceptance-matrix-v1",
  scannedFiles:manifest.scannedFiles,
  privilegedFiles:evidence.length,
  prioritizedP0:evidence.filter(x=>x.priority==="P0").length,
  prioritizedP1:evidence.filter(x=>x.priority==="P1").length,
  moduleAndScript:evidence.filter(x=>!["P0","P1"].includes(x.priority)).length,
  testedSelectedBranches:evidence.filter(x=>x.isolatedEvidence.length).length,
  missingManualSignoffs:evidence.filter(x=>x.manualApproval===null).length,
  contractFailures:manifest.failures?.length??0,
  caveat:"No row may be treated as fully reviewed merely because it has an auth marker, HTTP smoke, or passing CI. This is a source-linked triage manifest; follow actual callers and privileges before signing off.",
};
const output="test-results/w06-acceptance-matrix.json";
mkdirSync(dirname(output),{recursive:true});
writeFileSync(output,JSON.stringify({summary,evidence},null,2)+"\n");
console.log("W06 full privileged source review register",JSON.stringify(summary));
if(summary.privilegedFiles!==manifest.privilegedFiles || summary.contractFailures>0)throw Error("Inventory inconsistent/failed");
