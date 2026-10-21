import Link from "next/link";
import { SubmitButton } from "@/components/ui/Button";

export type ProgramReadModel={
  id:string;state:string;cadence:string;enabled:boolean;
  last_review_at:string|null;next_review_at:string|null;
  seo_site_id:string|null;
};
export type ProgramProposalReadModel={id:string;title:string;executive_summary:string;status:string};
export type ReviewReadModel={
 id:string;scheduled_for:string;state:string;summary:string|null;
 evidence:Record<string,unknown>|null;proposal_id:string|null;
};

const format=(value:string|null)=>value&&Number.isFinite(new Date(value).getTime())
  ?new Intl.DateTimeFormat("en-GB",{dateStyle:"medium",timeStyle:"short"}).format(new Date(value))
  :"Not scheduled";
const label=(value:string)=>value.replaceAll("_"," ").toLowerCase().replace(/\b\w/g,m=>m.toUpperCase());

export function ContinuousProgramPanel({
  program,reviews,projectId,proposals,submitProposalAction,notice
}:{
  program:ProgramReadModel|null; reviews:ReviewReadModel[];projectId:string;
  proposals:ProgramProposalReadModel[];
  submitProposalAction:(formData:FormData)=>Promise<void>;
  notice?:string;
}) {
  return <section className="panel project-view-panel" aria-label="Continuous program operations">
    <div className="panel-heading">
      <div><p className="label">Ongoing operations</p><h2>Continuous Program</h2></div>
      <span className="pill">{program?.state?label(program.state):"Setup required"}</span>
    </div>
    <p className="security-note">Completing a delivery phase does not close recurring monitoring. Reviews are evidence-based and proposed changes still require governance approval.</p>
    {notice==="approval"?<p role="status" className="form-success">Proposal submitted to the existing executive approval workflow.</p>:null}
    {!program ? <p className="empty-state">Continuous lifecycle is selected, but a monitoring program has not been configured.</p> :
      <>
        <div className="project-card-metrics">
          <div><span>Monitoring</span><strong>{program.enabled?"Enabled":"Disabled"}</strong></div>
          <div><span>Review cadence</span><strong>{label(program.cadence)}</strong></div>
          <div><span>Last review</span><strong>{format(program.last_review_at)}</strong></div>
          <div><span>Next review</span><strong>{format(program.next_review_at)}</strong></div>
        </div>
        {!program.seo_site_id?<p role="status" className="security-note">SEO evidence source is not linked. Technical SEO measurements cannot be validated.</p>:null}
        <details style={{marginTop:16}}>
          <summary style={{cursor:"pointer",fontWeight:700}}>Review history ({reviews.length} recent)</summary>
          {reviews.length?<div className="data-list">
            {reviews.map(review=><div className="data-row" key={review.id}>
              <div style={{minWidth:0}}>
                <strong>{format(review.scheduled_for)}</strong>
                <span style={{whiteSpace:"normal",overflowWrap:"anywhere"}}>{review.summary||"Review queued; no outcome yet."}</span>
                <details><summary style={{cursor:"pointer"}}>Evidence and limitations</summary>
                  <pre style={{whiteSpace:"pre-wrap",overflowWrap:"anywhere",fontSize:12}}>{JSON.stringify(review.evidence??{},null,2)}</pre>
                </details>
                {review.proposal_id?(()=>{
                  const proposal=proposals.find(p=>p.id===review.proposal_id);
                  if(!proposal)return <p className="security-note">A follow-up draft was recorded, but its details are currently unavailable.</p>;
                  return <div style={{marginTop:10}}>
                    <strong>{proposal.title}</strong>
                    <p className="security-note">{proposal.executive_summary}</p>
                    {proposal.status==="draft"?<form action={submitProposalAction}>
                      <input type="hidden" name="projectId" value={projectId}/>
                      <input type="hidden" name="proposalId" value={proposal.id}/>
                      <SubmitButton>Submit for executive approval</SubmitButton>
                    </form>:<Link href={`/projects/operating?project=${projectId}&view=decisions`}>Approval status: {label(proposal.status)}</Link>}
                    <p className="security-note">Submitting requests approval for investigation only; no site change or external action is authorized.</p>
                  </div>;
                })():null}
              </div>
              <span className="pill">{label(review.state)}</span>
            </div>)}
          </div>:<p className="empty-state">No review cycles have run yet.</p>}
        </details>
      </>
    }
  </section>;
}
