# RYTHM AI Governance Baseline

**Status:** Public Beta operational baseline  
**Effective:** 14 August 2026  
**Owner:** Tayyebialashti Yaser E.V. / RYTHM Company OS

This document records the current AI-system inventory, intended-use boundaries, human-oversight requirements, transparency controls, and change gates for RYTHM Company OS. It is an operational baseline, not a certification or a claim that every possible customer deployment has the same regulatory classification.

## 1. Current AI system inventory

| System / capability | Provider role | Current model provider | Intended purpose | Human interaction | Current risk posture |
| --- | --- | --- | --- | --- | --- |
| Governed AI Agents | RYTHM provides the application/workflow layer | OpenAI when an AI invocation is enabled | Drafting, analysis, recommendations, structured contributions, planning and organization-scoped assistance | User knowingly works with named AI Agents | General-purpose business assistance; consequential action remains human-governed |
| Governed AI Meeting deliberation | RYTHM provides meeting orchestration and governance | OpenAI | Generate role-scoped contributions based on meeting purpose, agenda, decision question and relevant transcript/context | AI participation is explicit in the meeting experience | Decision support; Human CEO remains final authority |
| Meeting summarization | RYTHM provides workflow | OpenAI | Produce structured summaries and follow-up material from authorized meeting context | AI-generated summary is presented to user | Assistive content generation; human review expected |
| Legal issue spotting / review workflow | RYTHM provides assistive workflow, not a law firm | OpenAI | Identify potential legal/governance issues for escalation and human review | AI role is disclosed through the workflow | Not approved as autonomous legal advice or final legal decision |
| Public Demo AI-company experience | RYTHM | Synthetic/read-only experience | Product education | AI nature is obvious from product context | Synthetic, no real customer production actions |

No current Public Beta capability is approved by default for autonomous employment decisions, worker scoring, creditworthiness, eligibility for essential services, biometric identification/categorisation, medical diagnosis, law-enforcement decisions, safety-critical control, or other regulated high-impact decisions.

## 2. AI transparency rule

Every production surface that directly presents AI-generated interaction to a natural person must make the AI nature clear from the context, naming, interface, or an explicit disclosure before or at the interaction.

Minimum rules:

- AI Agents must be presented as AI, not impersonated as undisclosed human employees.
- AI-generated recommendations or meeting contributions must remain distinguishable from Human CEO decisions or approvals.
- A product change that could make the AI nature non-obvious requires explicit interaction-level disclosure before release.
- Synthetic Demo content must remain identified as synthetic/read-only.
- Marketing, Trust, Terms and Privacy statements must not imply that an AI output is independently verified human professional advice.

## 3. Human authority and oversight

Current Public Beta governance baseline:

- Human CEO is the final authority for consequential company decisions.
- AI Agents have bounded roles, authority levels and risk ceilings.
- Approval boundaries separate recommendations from consequential actions.
- External actions are disabled by default unless a governed capability explicitly enables them.
- AI output must be reviewable before consequential execution.
- Audit/governance records should preserve who or what generated a recommendation and who approved a consequential action.

A feature must not silently convert a recommendation into an external consequential action.

## 4. Data sent to model providers

An AI invocation may include only the context reasonably required to perform the requested task. Depending on the feature, that can include:

- user instructions and prompts;
- organization-scoped agent role/purpose/instructions;
- meeting purpose, agenda and decision question;
- relevant transcript excerpts and authorized workspace context;
- prior generated outputs needed for the current governed workflow.

The following must not intentionally be sent unless a separately approved architecture requires it:

- passwords, authentication cookies, session tokens, API keys or service-role credentials;
- unrelated personal data;
- special-category or highly sensitive data without deployment-specific review;
- another tenant's data;
- data the requesting user is not authorized to access.

Application code should minimize context before model invocation and avoid logging full model payloads where operational metadata is sufficient.

## 5. Provider and training/retention governance

OpenAI is the currently verified model provider for production AI inference in the audited Public Beta application. Its role is also disclosed in the public Subprocessor Register.

Before changing the provider, model gateway, retention configuration, training/data-use terms, or region materially, the release owner must:

1. review the provider's current business/API data terms and data-use settings;
2. document retention and training/data-use behavior applicable to RYTHM's contracted service;
3. update the processing inventory, DPA/Subprocessor Register and Privacy disclosures where required;
4. assess international-transfer implications;
5. re-run security/privacy review before Production activation.

Do not claim provider-side zero retention, EEA-only processing, or no-training guarantees unless the applicable contracted configuration has been verified.

## 6. AI Act / regulatory classification gate

Every materially new AI use case must be classified before Production release.

Review at minimum:

- intended purpose and affected persons;
- whether the system directly interacts with natural persons;
- whether Article 50 transparency obligations are triggered;
- whether any prohibited practice may be implicated;
- whether Annex III or product-safety high-risk categories may be implicated;
- whether RYTHM is acting as provider, deployer, importer, distributor, or only as an application layer around a third-party model for the relevant use;
- human oversight and contestability;
- data-protection/DPIA implications;
- logging/documentation requirements;
- required instructions, warnings, or customer contractual restrictions.

High-risk or unclear classifications require specialist legal/compliance review before enabling the use case in Production.

## 7. Prohibited-by-default RYTHM uses

Without a separately reviewed deployment and legal basis, RYTHM Public Beta must not be configured to:

- manipulate or deceive people in a way intended or likely to cause significant harm;
- exploit vulnerabilities based on age, disability, or specific social/economic situation in a harmful manner;
- perform social scoring prohibited by applicable law;
- infer or use sensitive characteristics through prohibited biometric categorisation;
- autonomously make final hiring, firing, promotion, worker-management, credit, insurance, education-access, essential-service, law-enforcement, migration, justice, or safety-critical decisions;
- present AI-generated legal, medical, financial, or safety-critical output as a final professional determination without appropriate qualified human review.

## 8. AI literacy

People who design, operate, support, configure or approve consequential use of RYTHM AI should receive role-appropriate guidance covering:

- what the AI can and cannot reliably do;
- hallucination/error risk and verification;
- prompt/context privacy and tenant boundaries;
- human approval responsibilities;
- prohibited/high-risk use gates;
- incident escalation;
- how to distinguish AI recommendation from human decision.

Maintain evidence of the training/guidance used for staff and operators as the organization grows.

## 9. AI incident trigger

Escalate as an AI/privacy/security incident when an AI workflow causes or may have caused:

- cross-tenant or unauthorized data disclosure;
- material harmful or prohibited output acted upon by the system;
- bypass of a required human approval;
- unexpected external action;
- material prompt-injection or instruction-hijacking impact;
- leakage of secrets or privileged system instructions;
- repeated systematic output failure in a consequential workflow.

Link the incident to the general incident/breach runbook where personal data or security is involved.

## 10. Release gate

The AI governance review must be repeated before merge when a change introduces:

- a new AI/model provider;
- a new model data destination or materially different data-use/retention terms;
- autonomous external action;
- a new consequential decision domain;
- employee/candidate/customer scoring or ranking;
- biometric, health, financial, legal or other sensitive inference;
- hidden/non-obvious AI interaction;
- materially expanded transcript/context collection;
- removal or weakening of Human CEO/approval controls.

The review outcome must be recorded in the PR/release evidence and public disclosures updated where relevant.
