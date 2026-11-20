import assert from 'node:assert/strict';
import {reviewMeetingEvidence} from '../lib/meetings/evidence-quality';

const documents=[
  {id:'doc-tenant-a',title:'Synthetic client metrics',summary:'Campaign reported 1000 impressions and CTR 5%; source is internal.'},
  {id:'doc-tenant-a-2',title:'Synthetic brief',summary:'No external publication has been approved.'}
];
const supported=reviewMeetingEvidence({evidence_claims:[
  {claim:'The observed CTR was 5%',source_document_id:'doc-tenant-a',source_excerpt:'CTR 5%'}
]},documents);
assert.equal(supported.status,'supported_excerpts');
assert.equal(supported.human_review_required,false);
assert.deepEqual(supported.source_document_ids,['doc-tenant-a','doc-tenant-a-2']);

const hallucinated=reviewMeetingEvidence({executive_summary:'Conversion rate 100% is confirmed',
  evidence_claims:[{claim:'Conversion rate 100% is confirmed',
    source_document_id:'doc-tenant-a',source_excerpt:'CTR 5%'}]},documents);
assert.equal(hallucinated.status,'human_review_required');
assert.equal(hallucinated.unsupported_claims,1);
assert.equal(hallucinated.claims[0].reason,'numeric_claim_mismatch');

const fabricatedQuote=reviewMeetingEvidence({evidence_claims:[
  {claim:'10,000 sales',source_document_id:'doc-tenant-a',source_excerpt:'10,000 sales'}
]},documents);
assert.equal(fabricatedQuote.claims[0].reason,'excerpt_not_in_source');

const foreignTenant=reviewMeetingEvidence({evidence_claims:[
  {claim:'CTR 5%',source_document_id:'foreign-tenant-doc',source_excerpt:'CTR 5%'}
]},documents);
assert.equal(foreignTenant.claims[0].reason,'unknown_or_foreign_source');

const noCitation=reviewMeetingEvidence({executive_summary:'Unsubstantiated agreement'},documents);
assert.equal(noCitation.status,'human_review_required');
assert.ok(noCitation.unsupported_claims>0);

console.log('PASS W12 evidence evaluation: exact tenant-local source quotation, synthetic false metrics, fabricated sources, cross-tenant source rejection and missing citation to human review');
