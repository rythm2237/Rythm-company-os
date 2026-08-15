# RYTHM Company OS — DPIA Screening / Threshold Assessment

Status: B2B Public Beta production baseline
Assessment date: 15 August 2026
Owner: Tayyebialashti Yaser E.V.
Privacy contact: privacy@rythm-os.com

## Purpose

This screening determines whether the current RYTHM Company OS B2B Public Beta processing is likely to result in a high risk to the rights and freedoms of natural persons such that a full Data Protection Impact Assessment is required under GDPR Article 35.

This is a living assessment. It must be repeated before introducing materially new processing, especially high-impact HR, biometric, health, financial, public-sector, safety-critical or large-scale monitoring use cases.

## Current system scope assessed

RYTHM is a multi-tenant SaaS for governed AI-assisted company operations. Current relevant features include:
- user accounts and organization membership;
- projects, meetings, actions, decisions, approvals and company-memory records;
- optional AI model inference for explicitly invoked features;
- Human CEO / human authority over consequential decisions;
- synthetic read-only public Demo;
- no autonomous external action by default;
- no payment-card processing in the current baseline;
- no product feature intentionally designed for biometric identification, medical diagnosis, credit scoring, criminal-risk scoring or automated employment decisions.

## Article 35 high-risk triggers

### Systematic and extensive automated evaluation with legal or similarly significant effects
Current status: NO for the assessed baseline.

RYTHM can assist with analysis and recommendations, but the current governance model does not authorize the AI to make final automated decisions producing legal or similarly significant effects for an individual. Human authority and approval boundaries are explicit.

If RYTHM is later used to rank, reject, terminate, promote, discipline, credit-score, insure, admit, diagnose or otherwise make or materially determine consequential decisions about individuals, this answer changes and a deployment-specific DPIA and AI Act classification must occur before production use.

### Large-scale processing of special-category or criminal-offence data
Current status: NO for the assessed baseline.

The standard product is not designed around large-scale processing of health, biometric, genetic, political, religious, sexual-orientation, trade-union or criminal-offence data. Customers must not activate such processing as an ordinary use case without prior legal/security review.

If large-scale special-category or criminal-offence data is introduced, a full DPIA is required unless a documented legal assessment concludes otherwise.

### Systematic monitoring of publicly accessible areas on a large scale
Current status: NO.

The assessed product does not perform large-scale CCTV, sensor, location or other systematic monitoring of public areas.

## Additional risk indicators

### New technology / generative AI
Present: YES.

Generative AI can create risks including hallucination, inappropriate disclosure, excessive data transfer, prompt injection, biased output and over-reliance. Mitigations in the current baseline include explicit AI disclosure, human authority, restricted external actions, minimized context, tenant isolation, rate limiting, auditability and high-risk-use gating.

Residual risk: MODERATE, not assessed as high for the current general B2B operating-assistance use case.

### Vulnerable data subjects
Present by design: NO.

The product is not specifically designed for children or vulnerable-person decision making. If a customer deployment targets children, patients, employees in a high-power-imbalance scenario, benefits recipients or similarly vulnerable groups, a fresh DPIA screening is mandatory.

### Large scale
Current status: NO evidence that the present Public Beta constitutes large-scale high-risk personal-data processing.

This conclusion must be revisited as customer count, record volume, monitored population or sensitive-data scope materially increases.

### Matching or combining datasets
Current status: LIMITED.

Workspace context may combine customer-provided operational records for the purpose of the requested feature. RYTHM does not currently operate a general-purpose people-profiling data-broker model. New external datasets or identity-enrichment integrations require privacy review.

### Innovative use preventing individuals from exercising rights
Current status: NO.

Data-request channels, owner-scoped export and deletion/retention workflows exist. No design element intentionally prevents access, correction, deletion or other applicable rights.

## Data flows and processors

Current material service providers are documented in the Subprocessor Register and ROPA, including Supabase, Vercel, OpenAI for explicitly invoked AI processing, and Cloudflare where configured for domain/network/email-routing functions.

International-transfer safeguards depend on the applicable provider contracts, deployment configuration and transfer mechanisms. Deployment-specific enterprise review remains required where customer risk or jurisdiction demands it.

## Main privacy risks and mitigations

1. Cross-tenant disclosure
   - Risk: customer data exposed to another organization.
   - Controls: Supabase RLS, server-side membership/ownership checks, tenant-scoped queries, entitlement controls.

2. Unauthorized account access
   - Risk: account takeover or unauthorized workspace access.
   - Controls: email verification, PKCE recovery, protected routes, server-side auth checks; leaked-password protection and MFA remain platform-hardening actions to enable where available/appropriate.

3. Excessive AI disclosure
   - Risk: more workspace/personal data sent to the model provider than needed.
   - Controls: data minimization, scoped context, transcript truncation where implemented, AI governance baseline, subprocessor disclosure, DPA framework.

4. Over-reliance on AI output
   - Risk: user treats generated output as authoritative consequential decision.
   - Controls: Human CEO authority, recommendation/approval boundary, transparency notice, prohibited/high-risk-use gate.

5. Abuse / excessive API use
   - Risk: denial of service, cost abuse or automated exploitation.
   - Controls: authenticated API boundaries, organization authorization, DB-backed rate limiting, budget controls and fail-closed behavior for protected meeting endpoints.

6. Retention beyond necessity
   - Risk: personal data retained longer than needed.
   - Controls: retention matrix/runbook, data-request intake, deletion process, customer instruction/DPA framework and periodic review.

7. Incident response delay
   - Risk: delayed containment or GDPR notification.
   - Controls: incident/breach SOP, evidence preservation and 72-hour regulatory assessment workflow where applicable.

## Necessity and proportionality

The assessed processing is necessary to provide authenticated multi-tenant collaboration, governed AI assistance, customer workspace operation, security and support. The baseline avoids collecting categories of personal data that are not necessary for these purposes and does not require customers to provide special-category data.

The use of AI is optional/feature-triggered rather than an undisclosed universal background profiling layer. Human review remains the authority boundary for consequential use.

## Screening conclusion

Result: FULL DPIA NOT CURRENTLY TRIGGERED for the assessed general B2B Public Beta baseline.

Reasoning:
- no systematic and extensive solely automated evaluation producing legal or similarly significant effects;
- no intended large-scale special-category/criminal-data processing;
- no large-scale public-area monitoring;
- governance and security measures materially reduce the risks introduced by generative AI;
- the product remains human-governed and does not currently target a high-risk individual-decision domain.

This conclusion is not a blanket exemption for every customer use case.

## Mandatory re-screening triggers

A new DPIA screening, and likely a full DPIA, must occur before production activation of any of the following:
- recruitment ranking, CV scoring, candidate rejection or employee performance/termination decisions;
- credit, insurance, eligibility, benefits or access-to-essential-services decisions;
- biometric identification/categorization or emotion recognition;
- health diagnosis/treatment recommendations using personal health data;
- criminal-risk or law-enforcement use;
- systematic monitoring of workers or the public at material scale;
- processing special-category/criminal data at scale;
- deployment involving children or other vulnerable groups where material effects are possible;
- large-scale profiling or behavioral prediction about identifiable people;
- a new processor/integration that materially changes transfer or confidentiality risk;
- autonomous external actions capable of producing material effects on individuals;
- a material security incident showing the current safeguards are insufficient.

## Approval gate

No feature owner may classify a new use case as 'ordinary B2B productivity' solely because it uses the same RYTHM platform. The intended use, affected data subjects, data categories, decision effect, scale and human-oversight model control the assessment.
