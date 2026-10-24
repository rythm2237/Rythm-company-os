# ADR: Extend the existing project operating core

Status: implemented foundation; production rollout and end-to-end validation are separate release gates.

## Context and decision

The existing system already stores project intake, operational knowledge, clarification requests, readiness assessments, scope versions, weighted roadmaps, approved baselines and durable task execution. Creating another discovery database or execution engine would fragment permissions and history. The universal intelligence foundation therefore adds typed, versioned contracts inside existing JSON evidence fields, retaining the current RLS and owner APIs.

`project-intelligence.ts` holds evidence, claim, clarification and diagnosis contracts plus extensible domain profiles and resource policies. Profiles match the project and permitted customer evidence, independently of company-template identifiers. Hospitality, software, marketing and operations are initial configurations, with an unknown-domain fallback to the shared reasoning framework. These are reasoning guidance, not verified agent qualifications.

## Information and provenance

Analysis reads the original brief, operational document summaries, operational Project Knowledge, previously answered clarifications and submitted resource references. The authenticated caller supplies a narrowly selected CRM customer profile through RLS. Contracts, financial fields, confidential documents and unbounded external fetching are excluded. Each supplied source has a stable reference, source kind, recorded timestamp and verification class. Missing timestamps remain null. External research is explicitly `not_performed`.

Business classifications are labeled inferred; possible segments are hypotheses. Model findings are never promoted to confirmed business facts merely because the model supplies a citation. Unknown citation IDs are rejected and hypothesis claims retain unverified status. A vegan restaurant's actual customer mix is never assumed. Approved user corrections supersede corresponding inferences during subsequent analysis.

`POST /api/projects/context` accepts an allowlisted operational field and a bounded value. It uses authenticated owner context and RLS to write an approved correction into Project Knowledge with user, timestamp and customer provenance, then records an activity event. Corrections do not overwrite CRM. Stable business fields for a linked customer are marked customer-scoped; project business objectives stay project-scoped. Cross-project reuse goes through `loadReusableCustomerCorrections` with the caller RLS client, requiring independent customer visibility and visibility of the prior project knowledge, matching both the joined project customer and evidence customer IDs. The latest approved correction per allowlisted field is selected; local project corrections take precedence. No service-role cross-project retrieval is used.

## Minimal-question policy

The model proposes candidates with explicit human-required, decision-impact, execution-dependency and information-availability flags. A deterministic server policy suppresses resolved keys, duplicates, obtainable information and reversible assumptions. It selects at most three initial questions, except explicitly mandatory authorization/legal/safety items. Remaining material candidates are persisted as deferred questions in readiness evidence. Resource policies identify missing website targets without claiming pages have been reviewed. Existing legacy open clarification records are retained rather than silently discarded.

Approved roadmap tasks declare `requiredInputKeys` using exact known clarification keys. Execution snapshots them in task input. When the task becomes runnable, the worker opens only its unanswered deferred questions and holds that task as `waiting_for_data` without spending retries or calling the model. Answered keys resume that hold while other approval and resource gates remain intact. The original roadmap assessment provides the question contract even after later reanalysis. Semantic duplicate detection across differently named keys remains a limitation.

## Diagnosis, planning and governance

Analysis produces a structured diagnosis with stated problem, desired outcome, competing hypotheses, known-source references, uncertainties, diagnostic actions, risks, proposed definition and success metrics. Clear low-risk work can receive lightweight discovery. Uncertain or strategic work yields a bounded Discovery Plan. Delivery planning after standard/deep discovery requires approved supplied evidence, no remaining recorded uncertainties and explicit delivery selection; human roadmap review still applies.

Roadmaps consume the same diagnosis and domain methods. Their `generated_from.intelligence` snapshots the plan kind and proposed diagnosis. Human baseline approval also records the problem-definition reviewer and timestamp. This uses the existing approval rather than introducing a second redundant setup approval. It grants no contractual scope-change or external-action permission. Rejected and stale versions cannot be approved; replaying approval of the active baseline returns its existing state without resetting progress. Generated task and phase dependencies are checked for cycles, missing/ambiguous keys and unauthorized owners before persistence.

Analysis preserves the stage of an already approved or executing project. Legacy roadmaps without intelligence metadata retain their established route and are not restarted or invalidated. The legacy execution start reserves agent capacity through the canonical assignment service before creating an execution.

## Limits and release requirements

The existing AI Gateway provides cost telemetry and bounded requests. The implementation does not add autonomous public-web research or claim source freshness beyond the recorded timestamps. It does not create verified capability evaluations, automatically promote hypothesis findings to truth, or automatically advance a completed Discovery Plan into substantive delivery. Specialist guidance is supplied through structured domain configuration and the assigned workforce; separate expert deliberation remains the existing meeting workflow rather than an extra meeting on every intake.

Page-dependent audits are checked before handoffs or AI requests. A submitted URL alone is insufficient because the structured worker has no browser. Actual extracted operational page screenshots or HTML are required; accepted findings are explicitly constrained to supplied source documents, including when no URL is available. Missing page evidence holds only dependent tasks; safe planning/checklist work can continue. The scheduler resumes these holds when qualifying evidence arrives, retaining the distinction between a supplied document and full-site browsing. The initial evidence classifier is conservative and English-language oriented; source-specific retrieval remains a governed integration concern.

No schema migration is required by these evidence contracts or correction API. The capacity-reservation migration is an independent shared release dependency. Run the behavioral intelligence validation plus project, security, build and browser checks before release. Existing database audit events and records remain intact. Rollback is application rollback: old readers ignore additive JSON keys; retain evidence for audit rather than deleting it.
