# RYTHM GDPR Operational Baseline

**Status:** Public Beta operational baseline  
**Owner:** Tayyebialashti Yaser E.V. / RYTHM Company OS  
**Privacy contact:** privacy@rythm-os.com  
**Security contact:** security@rythm-os.com  
**Effective:** 14 August 2026

This runbook converts the public Privacy Policy, DPA, Subprocessor Register, and Data Requests page into an operational process. It is not a claim of certification and does not replace deployment-specific legal advice.

## 1. Processing inventory

Maintain a current inventory for every production feature that handles personal data. At minimum record:

- system/feature;
- controller/processor role;
- data-subject categories;
- personal-data categories;
- purpose and lawful basis where RYTHM is controller;
- customer instruction where RYTHM is processor;
- source and destination systems;
- subprocessors involved;
- international-transfer mechanism where applicable;
- retention/deletion rule;
- access roles;
- security controls;
- whether AI processing is involved.

Current verified production processor stack includes Supabase, Vercel, OpenAI for invoked AI features, and Cloudflare for the configured domain/routing layer. Any new processor must be added to the public Subprocessor Register before production use where it will process customer personal data.

## 2. Retention baseline

Retention periods below are RYTHM operational targets, not statements that every provider backup can be erased immediately. A legal hold or mandatory statutory retention obligation overrides deletion only for the affected data.

| Data category | Active retention | Post-termination target | Notes |
| --- | --- | --- | --- |
| Account/profile and organization membership | While account/service is active | Remove from active service within 30 days after validated deletion/termination instruction unless required for legal/security reasons | Authentication provider deletion must be included |
| Customer workspace/application records | While contracted workspace is active | Remove from active production within 30 days after validated organization-owner instruction or contract termination | Confirm ownership and export requirement before destructive deletion |
| AI prompts/context/meeting transcript data stored by RYTHM | According to the underlying workspace record | Follows the workspace deletion rule | Provider-side retention must be governed by the applicable business/API terms and configuration |
| Security and operational logs | As needed for incident detection and investigation | Target 90 days unless a longer period is justified by an active incident, abuse case, contract, or legal requirement | Avoid logging secrets or full sensitive payloads |
| Audit/governance records | While workspace is active and as necessary for traceability | Review at 12 months after termination; retain longer only where contract/legal/security justification exists | Minimize personal fields where possible |
| Privacy/DSAR case record | Through request completion | Retain only the minimum evidence needed to demonstrate handling and resolve disputes; review after 3 years | Do not retain exported customer payload solely as DSAR evidence |
| Billing/accounting records | Contract/statutory period | Retain for the applicable Hungarian/EU accounting and tax retention period | Keep billing records logically separate from deleted workspace content where possible |
| Provider backups | Provider backup lifecycle | Expire through normal backup rotation | Do not restore deleted data into active use except for legitimate disaster recovery; re-apply deletion where a restore reintroduces deleted records |
| Browser-local preferences | Until replaced/expired/cleared on device | User/device controlled | Not centrally deletable when stored only in the user's browser |

### Retention review

- Review this table whenever a new data category, processor, payment provider, analytics product, or integration is introduced.
- Do not claim a deletion period externally until the technical implementation and provider lifecycle can meet it.
- Any exception must record owner, reason, affected records, legal/security basis, and review date.

## 3. Data-subject / customer privacy request workflow

### Intake

1. Accept requests through `privacy@rythm-os.com` and the public `/data-requests` instructions.
2. Record received time, requester, requested right, relevant organization/workspace, and initial scope.
3. Never ask the requester to send passwords, one-time links, API keys, or unrelated identity documents by default.

### Verify

4. Verify identity proportionately, preferably through the authenticated account/email already associated with RYTHM.
5. For organization-wide export or deletion, verify owner/authorized customer-controller authority.
6. If RYTHM is only the processor, coordinate with the customer controller unless applicable law requires RYTHM to act directly.

### Scope and preserve

7. Search active RYTHM application data, authentication/account data, relevant support records, and processor-held records within RYTHM's control.
8. Identify third-party data that must not be disclosed to the requester.
9. Check for legal hold, accounting retention, security investigation, or legal-claim constraints before deletion.

### Execute

10. Access: provide confirmation, relevant personal data, and required processing information.
11. Portability: where applicable, provide requester-provided data in a commonly used machine-readable format such as JSON or CSV.
12. Correction: update inaccurate data and, where required, propagate correction to relevant processors/systems.
13. Deletion: delete eligible active data; disable/remove authentication as applicable; record any narrowly retained exception and its basis.
14. Restriction/objection: apply the legally relevant restriction or document why the request does not apply.

### Close

15. Respond without undue delay and target completion within one month where GDPR applies. If a lawful extension is necessary, notify the requester within the original period and document the reason.
16. Do not retain a complete copy of the export after delivery merely to prove the request was completed.
17. Record request closure date, systems checked, actions taken, unresolved exceptions, and follow-up date if backup expiry or processor action remains pending.

## 4. Personal-data breach / incident workflow

### Trigger

Treat suspected unauthorized access, loss, disclosure, alteration, destruction, credential compromise, cross-tenant exposure, accidental publication, or processor breach affecting personal data as a privacy-security incident until triaged.

### Immediate containment

1. Record awareness time. This is the compliance clock anchor.
2. Limit access, revoke/rotate compromised credentials or sessions where appropriate, preserve evidence, and stop further disclosure.
3. Do not destroy logs/evidence required for investigation.
4. Open an operational incident record and identify an incident owner.

### Assess

5. Determine systems, organizations, data subjects, data categories, approximate volume, exposure window, and whether special-category/high-risk data is involved.
6. Determine whether confidentiality, integrity, or availability of personal data was compromised.
7. Assess likely risk to rights and freedoms and whether affected customers are controllers that require processor notification.

### Notify/escalate

8. Where RYTHM is processor, notify the affected controller/customer without undue delay when required and provide available facts in phases if necessary.
9. Where RYTHM is controller, assess GDPR Article 33 supervisory-authority notification. If notification is required, target notification without undue delay and, where feasible, within 72 hours of awareness; document reasons for any delay.
10. Where a controller-side breach is likely to result in high risk to individuals, assess Article 34 data-subject communication without undue delay.
11. Use legal/privacy review for uncertain reportability rather than silently assuming a breach is non-reportable.

### Evidence package

Maintain:

- awareness and containment timestamps;
- affected systems/tenants;
- categories and approximate number of data subjects/records where known;
- likely consequences;
- remediation/containment steps;
- notification decision and rationale;
- customer/regulator/data-subject communications;
- root cause and corrective actions.

### Post-incident

12. Complete root-cause analysis and corrective actions.
13. Review logging, RLS/authz, API abuse controls, secrets, dependency exposure, and relevant processor configuration.
14. Update the processing inventory, risk register, runbooks, and public disclosures if the architecture or material processing changes.

## 5. AI processing control

For every AI-enabled production feature:

- document what user/customer data is sent to the model provider;
- minimize context to what the invoked task reasonably needs;
- do not send privileged secrets, authentication tokens, or unnecessary sensitive data;
- document whether the AI provider is acting as processor/subprocessor under the applicable business terms;
- record relevant provider retention/training configuration where available;
- preserve human authority for consequential decisions;
- require separate review before enabling employment, credit, essential-services, biometric, safety-critical, or other potentially high-risk regulated uses.

## 6. Change gate

A production change must trigger privacy/security review before merge if it introduces any of the following:

- new personal-data category;
- new subprocessor or destination;
- new analytics/advertising/session-replay technology;
- new payment or billing processor;
- new AI provider/model data path;
- new cross-tenant/admin data access;
- new public API accepting customer data;
- new regulated/high-risk decision use case;
- materially different retention period;
- new international transfer pattern.

The review must update public disclosures and this runbook where necessary before or with the production release.
