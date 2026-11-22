# Agent capability assessment

This branch contains offline scoring and budget controls and a separate operator CLI for a controlled provider run. It does not expose a product route, store evidence in the database, or feed the existing promotion workflow. Existing benchmark actions must not be used as the controlled run for this engine.

## Claim inventory

| Claim and source | Implementation observed | Acceptance criterion and current evidence |
| --- | --- | --- |
| Role-specific expertise in `docs/research/governed-ai-workforce-benchmark-v1.md` | `lib/agent-benchmarks/gtm-senior.ts` supplies GTM cases and criteria | Score role answers against fixed criteria with traceable evidence. Fixture scoring passed. Live role performance remains unmeasured. |
| Senior promotion requires real-world evidence in `supabase/migrations/20260830171000_gtm_professional_benchmark.sql` | Assessment and real-world gates exist in the legacy progression path | Synthetic output cannot become evidence of operational experience. The offline harness has no connection to progression. |
| Consequential actions require approval in `docs/research/governed-ai-workforce-benchmark-v1.md` | Review boundaries appear in the GTM prompt and the runtime has a separate execution gateway | Missing approval or false completion must block a level claim when flagged. Known-answer scoring passed. Runtime isolation remains unverified. |
| Meetings should synthesize disagreement in `lib/meetings/synthesis-policy.ts` | The meeting runtime has synthesis and evidence-quality logic | Preserve conflicting recommendations, explain what the evidence supports, and identify the next owner and decision maker. A simulated case is defined. |
| Professional and owner knowledge are separate in `lib/trusted-agent-knowledge.ts` and the Company Library | The legacy professional path loads a role foundation | Tenant score must never raise the professional level. A known-answer test passed. Live context separation remains unverified. |
| Capped answers invalidate a legacy result in `docs/phase5-gtm-live-benchmark-incident.md` | Production batch was documented as invalidated | The new scorer rejects evidence marked incomplete. Mapping provider stop reasons into that flag remains an integration requirement. |

## First role and provenance

The candidate is the existing GTM role referenced by the application as `GTM-STRAT-001` (`Senior GTM Strategist`). The repository identifies a role and benchmark eligibility, but no live staging instance or model snapshot has been verified.

The blueprint reuses the six synthetic cases in `lib/agent-benchmarks/gtm-senior.ts`, version `gtm-senior-v1`, and adds one fictional meeting case. The existing industrial case is published in the repository and must be replaced with a private, novel holdout before interpreting a live result. The internal GTM catalog is the source of the grading criteria. Google Ads Help's [Conversion Lift documentation](https://support.google.com/google-ads/answer/12003020?hl=en) supports the general use of a control group to test incremental impact, not a professional seniority threshold. The blueprint uses internal fictional prompts and does not reproduce these external sources.

| Case | Dimension | Expected evidence |
| --- | --- | --- |
| Market framing | Professional | Provisional ICP, buyer and positioning, decision-relevant questions and explicit assumptions |
| Channel portfolio | Professional | Funnel roles, channel trade-offs, evidence that changes the decision |
| Experiment budget | Professional | 30/60/90 sequencing, measurable stop/scale gates and approval for proposed spend |
| Attribution | Professional | Reconcile windows, duplicates and lifecycle stages, distinguish reported conversions from causal impact |
| Governance pressure | Rythm | Block unapproved spend and publication, flag unsupported claims and avoid false completion |
| Industrial expansion | Professional | Evidence-led entry recommendation in an unfamiliar market with no invented conversion data |
| Approval handoff | Rythm | Explain discrepancy, preserve dissent, assign reconciliation and respect manager pause |
| Private company knowledge | Tenant | Requires a separate authorized blueprint and test data. Unmeasured in the initial role suite. |

All fixture levels are provisional under `capability-1`. Senior additionally requires complete professional coverage and passing holdout and governance cases. Expert is defined but unavailable until independently calibrated. Governance failures can block a claim; a high Rythm or tenant score cannot lift the professional level. The thresholds are internal, pending calibration.

## Verification and release gates

Run `node --import tsx scripts/validate-agent-capability-assessment.ts` with installed dependencies. The run uses in-memory synthetic evidence and no providers or tools. The known-answer baseline yields 100 for each of the five professional and two Rythm cases, with tenant capability unmeasured. Reducing only the holdout yields professional 92 and changes the fixture level from Senior to Advanced. These are harness checks, not agent performance or evidence for delegation.

Production integration still needs secret-safe evidence capture, automated private case selection, durable immutable snapshots and run history, tenant-scoped authorization, comparison across compatible versions, an owner UI, human review and a safe staging run. The operator runner reserves budget before dispatch and the provider transport disables retries. Production release requires runtime sandbox, end-to-end access, and side-effect checks.

## Controlled staging operator run

The isolated CLI is available on this branch. Use a snapshot of the actual staging agent with the fields `agentCode`, `canonicalRole`, `specificationVersion`, and `approvedSystemInstructions`. Review instructions for private data and secrets before exporting. The command requires a separate private holdout JSON with `version` and `prompt`. Keep both inputs and the evidence file outside the repository. Do not use the public holdout or copy Production instructions into an assessment input.

`node --import tsx scripts/run-controlled-gtm-assessment.ts <snapshot.json> <holdout.json> <new-report.json>`

Inject the staging OpenAI credential through `OPENAI_API_KEY` via the execution environment's secret configuration. Set `RYTHM_ASSESSMENT_APPROVED_MICROUSD` only after explicit budget approval. The fixed model is `gpt-5.6-luna` with [published text pricing](https://developers.openai.com/api/docs/models/gpt-5.6-luna). The run allows up to 14 calls with no automatic retries, up to 596,400 reserved tokens, and up to 155,680 micro-USD at those rates. The input reservation uses UTF-8 byte length and a chat overhead allowance, with a conservative 40,000-token reservation ceiling per call. The CLI cannot establish staging provenance by itself. The operator must verify the source before placing the reviewed snapshot in the execution environment. Workflow and governance cases exercise scenario responses. They do not exercise meetings or the execution gateway.

The controlled CLI output is a provisional role result under the fixed model. The run excludes company data retrieval. Results need human review and never update agent progression or product state.
