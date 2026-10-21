import type { SupabaseClient } from "@supabase/supabase-js";

/**
 * Read-only evidence assessment + governed draft proposals.
 * Never performs external actions, accepts a proposal, or fabricates traffic metrics.
 * Calls only through the existing authenticated service-role project dispatcher.
 */
type ClaimedCycle={cycle_id:string;program_id:string;organization_id:string};
export type ProgramReviewResult={
 cycleId:string;projectId?:string;status:"completed"|"waiting_for_data"|"failed";
 reason:string;proposalId?:string|null;
};
type Finding={id?:string;title?:string;severity?:string;authority?:string};
type Snapshot={id:string;checked_at:string;score:number;counts:unknown;findings:unknown};
function persistentFindings(latest:Snapshot,previous:Snapshot):Finding[]{
  const current=Array.isArray(latest.findings)?latest.findings as Finding[]:[];
  const earlier=Array.isArray(previous.findings)?previous.findings as Finding[]:[];
  const priorIds=new Set(earlier.map(f=>f.id).filter(Boolean));
  return current.filter(f=>typeof f.id==="string"&&priorIds.has(f.id)&&["medium","high","critical"].includes(String(f.severity).toLowerCase()))
    .slice(0,12).map(f=>({id:f.id,title:f.title,severity:f.severity,authority:f.authority}));
}
const maxAgeMs=14*24*60*60*1000;
const minPeriodMs=6*60*60*1000;
const anomalyThreshold=10;
const cleanNumber=(v:unknown)=>typeof v==="number"&&Number.isFinite(v)?v:null;

async function markCycle(service:SupabaseClient,cycleId:string,organizationId:string,
  status:ProgramReviewResult["status"],summary:string,evidence:Record<string,unknown>,
  proposalId:string|null=null) {
  const {error}=await service.from("continuous_program_review_cycles").update({
    state:status,summary,finished_at:new Date().toISOString(),evidence,proposal_id:proposalId,
    last_error:status==="failed"?summary:null,updated_at:new Date().toISOString()
  }).eq("id",cycleId).eq("organization_id",organizationId).eq("state","running");
  if(error)throw new Error(`Review outcome persistence failed: ${error.message}`);
}

export async function processContinuousProgramReviews(service:SupabaseClient,limit=5):Promise<ProgramReviewResult[]> {
  const claim=await service.rpc("claim_continuous_review_work_v1",{p_limit:limit});
  if(claim.error)throw new Error(`Unable to claim continuous review work: ${claim.error.message}`);
  const results:ProgramReviewResult[]=[];
  for(const item of (claim.data??[]) as ClaimedCycle[]){
    results.push(await processOneReview(service,item));
  }
  return results;
}

async function processOneReview(service:SupabaseClient,cycle:ClaimedCycle):Promise<ProgramReviewResult>{
  let projectId:string|undefined;
  try {
    const program=await service.from("continuous_programs")
      .select("id,organization_id,project_id,seo_site_id,state,enabled")
      .eq("id",cycle.program_id).eq("organization_id",cycle.organization_id).single();
    if(program.error||!program.data)throw new Error(program.error?.message||"Program missing");
    projectId=program.data.project_id as string;
    const evidence:Record<string,unknown>={
      analyzer:"continuous-program-evidence-v1",
      evaluated_at:new Date().toISOString(),
      interpretation:"Verified technical SEO snapshot scores only; no search traffic, AI referrals, or conversions inferred"
    };
    if(!program.data.seo_site_id){
      await markCycle(service,cycle.cycle_id,cycle.organization_id,"waiting_for_data",
        "Connect an authorized SEO site to provide evidence for this program.",evidence);
      return {cycleId:cycle.cycle_id,projectId,status:"waiting_for_data",reason:"SEO source not configured"};
    }
    const snapshots=await service.from("agency_seo_snapshots")
      .select("id,checked_at,score,counts,findings")
      .eq("organization_id",cycle.organization_id).eq("site_id",program.data.seo_site_id)
      .order("checked_at",{ascending:false}).limit(2);
    if(snapshots.error)throw new Error(`SEO evidence query failed: ${snapshots.error.message}`);
    const rows=(snapshots.data??[]) as Snapshot[];
    const latest=rows[0],previous=rows[1];
    evidence.source="agency_seo_snapshots";
    evidence.site_id=program.data.seo_site_id;
    evidence.snapshot_ids=rows.map(r=>r.id);
    if(!latest||!previous||cleanNumber(latest.score)===null||cleanNumber(previous.score)===null){
      await markCycle(service,cycle.cycle_id,cycle.organization_id,"waiting_for_data",
        "At least two verified technical SEO snapshots are required.",evidence);
      return {cycleId:cycle.cycle_id,projectId,status:"waiting_for_data",reason:"Insufficient verified snapshots"};
    }
    const latestMs=new Date(latest.checked_at).getTime();
    const previousMs=new Date(previous.checked_at).getTime();
    const now=Date.now();
    if(!Number.isFinite(latestMs)||!Number.isFinite(previousMs)||
      latestMs>now+5*60*1000||now-latestMs>maxAgeMs||latestMs-previousMs<minPeriodMs){
      await markCycle(service,cycle.cycle_id,cycle.organization_id,"waiting_for_data",
        "SEO snapshots are stale or too close together for comparison.",evidence);
      return {cycleId:cycle.cycle_id,projectId,status:"waiting_for_data",reason:"Snapshots require a fresh valid interval"};
    }
    const delta=latest.score-previous.score;
    const persistent=persistentFindings(latest,previous);
    Object.assign(evidence,{
      prior:{id:previous.id,checked_at:previous.checked_at,technical_seo_score:previous.score},
      latest:{id:latest.id,checked_at:latest.checked_at,technical_seo_score:latest.score,counts:latest.counts},
      delta_points:delta,threshold_points:-anomalyThreshold,persistent_findings:persistent,
      caveat:"Audit snapshot score is not a Google Search Console ranking, organic traffic, or conversion measurement"
    });
    let proposalId:string|null=null;
    if(delta<=-anomalyThreshold||persistent.length>0){
      const regression=delta<=-anomalyThreshold;
      const proposalType=regression?"continuous_program_technical_seo_review":"continuous_program_persistent_seo_findings";
      const existing=await service.from("project_proposals")
        .select("id").eq("organization_id",cycle.organization_id).eq("project_id",projectId)
        .eq("proposal_type",proposalType)
        .in("status",["draft","internal_review","ready_for_executive","approved","executing"])
        .order("created_at",{ascending:false}).limit(1);
      if(existing.error)throw new Error(`Existing proposal lookup failed: ${existing.error.message}`);
      proposalId=existing.data?.[0]?.id??null;
      if(!proposalId){
        const proposal=await service.from("project_proposals").insert({
          organization_id:cycle.organization_id,project_id:projectId,
          proposal_type:proposalType,
          title:regression?"Investigate technical SEO score regression":"Review persistent technical SEO findings",
          executive_summary:regression
            ?`Technical SEO audit score decreased by ${Math.abs(delta)} points (${previous.score} → ${latest.score}). Diagnose before making changes.`
            :`${persistent.length} technical SEO findings persist across two independent snapshots. Inspect the findings and obtain approval before modifying site configuration or content.`,
          rationale:"Two authorized SEO audit snapshots provide a bounded comparison. Findings are potential issues, not proof of Google ranking or conversion loss.",
          status:"draft",decision_required_from:"human_ceo",risk_level:"medium",
          expected_impact:{type:"unquantified",confidence:"limited",purpose:regression?"Investigate audit-score regression":"Assess persistent technical findings"},
          estimated_effort:"Requires investigation",
          supporting_evidence:[{source:"agency_seo_snapshots",site_id:program.data.seo_site_id,
            snapshot_ids:[previous.id,latest.id],delta_points:delta,persistent_findings:persistent}],
          required_permissions:["manager_review","human_ceo_approval"]
        }).select("id").single();
        if(proposal.error||!proposal.data)throw new Error(`Proposal draft failed: ${proposal.error?.message||"no id"}`);
        proposalId=proposal.data.id;
      }
    }
    const summary=proposalId
      ? `Technical SEO changed by ${delta} points; ${persistent.length} findings persisted. A draft proposal requires review; nothing was authorized or executed.`
      : `Technical SEO score ${latest.score} (${delta>=0?"+":""}${delta} points since previous snapshot); no verified actionable anomaly detected.`;
    const updated=await service.from("continuous_programs").update({
      last_review_at:new Date().toISOString(),updated_at:new Date().toISOString(),
      ...(program.data.state==="WAITING_FOR_DATA"?{state:"MONITORING"}:{})
    }).eq("id",cycle.program_id).eq("organization_id",cycle.organization_id);
    if(updated.error)throw new Error(`Program review timestamp failed: ${updated.error.message}`);
    await markCycle(service,cycle.cycle_id,cycle.organization_id,"completed",summary,evidence,proposalId);
    return {cycleId:cycle.cycle_id,projectId,status:"completed",reason:summary,proposalId};
  } catch(error){
    const reason=error instanceof Error?error.message:"Unknown review processing failure";
    try{
      await markCycle(service,cycle.cycle_id,cycle.organization_id,"failed",reason,
        {analyzer:"continuous-program-evidence-v1",reason:"processing_failed"});
    }catch(persistenceError){console.error("continuous_review_error_persistence_failed",persistenceError);}
    return {cycleId:cycle.cycle_id,projectId,status:"failed",reason};
  }
}
