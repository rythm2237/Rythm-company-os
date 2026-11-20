/**
 * Bounded, deterministic source-claim check for autonomous meeting minutes.
 * Quote matching validates provenance, NOT semantic truth. Unverified text
 * remains pending human review; an AI source citation is never an approval.
 */
export type MeetingSourceDocument = {
  id:string; title?:string|null; summary?:string|null;
};
export type CheckedMeetingClaim = {
  claim:string;
  source_document_id:string;
  source_excerpt:string;
  supported_by_source_excerpt:boolean;
  reason:"matched_excerpt"|"unknown_or_foreign_source"|"missing_excerpt"|"excerpt_not_in_source"|"numeric_claim_mismatch";
};
export type MeetingEvidenceReview = {
  status:"supported_excerpts"|"human_review_required";
  human_review_required:boolean;
  source_document_ids:string[];
  claims:CheckedMeetingClaim[];
  unsupported_claims:number;
};
const normalized=(value:string)=>value.replace(/\s+/g," ").trim().toLowerCase();
const numeric=(value:string)=>[...value.matchAll(/\d+(?:[.,]\d+)?/g)].map(match=>match[0].replace(",","."));
const value=(input:unknown)=>typeof input==="string"?input.trim():"";

export function reviewMeetingEvidence(
  synthesis:Record<string,unknown>,
  documents:MeetingSourceDocument[]
):MeetingEvidenceReview{
  const available=new Map(documents.filter(doc=>value(doc.id)).map(doc=>[doc.id,doc]));
  const rawClaims=Array.isArray(synthesis.evidence_claims)?synthesis.evidence_claims.slice(0,16):[];
  const checked:CheckedMeetingClaim[]=rawClaims.filter(item=>item&&typeof item==="object"&&!Array.isArray(item)).map(item=>{
    const row=item as Record<string,unknown>;
    const claim=value(row.claim).slice(0,800);
    const sourceDocumentId=value(row.source_document_id).slice(0,120);
    const excerpt=value(row.source_excerpt).slice(0,800);
    const document=available.get(sourceDocumentId);
    let reason:CheckedMeetingClaim["reason"]="matched_excerpt";
    if(!document)reason="unknown_or_foreign_source";
    else if(!excerpt||!claim)reason="missing_excerpt";
    else if(!normalized(document.summary??"").includes(normalized(excerpt)))reason="excerpt_not_in_source";
    else {
      const excerptNumbers=new Set(numeric(excerpt));
      if(numeric(claim).some(number=>!excerptNumbers.has(number)))reason="numeric_claim_mismatch";
    }
    return {claim,source_document_id:sourceDocumentId,source_excerpt:excerpt,
      supported_by_source_excerpt:reason==="matched_excerpt",reason};
  });
  const unsupported=checked.filter(claim=>!claim.supported_by_source_excerpt).length;
  const complete=checked.length>0&&unsupported===0;
  return {
    status:complete?"supported_excerpts":"human_review_required",
    human_review_required:!complete,
    source_document_ids:documents.map(doc=>doc.id).filter(Boolean),
    claims:checked,unsupported_claims:unsupported+(checked.length===0?1:0),
  };
}
