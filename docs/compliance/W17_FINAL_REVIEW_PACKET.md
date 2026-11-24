# W17 final review packet — 2026-11-24

Status: technical remediation in draft branch, release BLOCKED. Owner authorization is recorded in PR #471. This packet is an engineering/privacy review aid, not legal advice or legal approval.

## Evidence and known boundaries

- W09 integration is on main 66036e557da6ac5dbb4d3a61eb58b0d300fcf3fe. The actual operational archive restore and synthetic personal-memory erasure reconciliation passed on 2026-11-24; named transient paths and container absence checked. No actual account deletion or full application recovery established.
- The prior W17 candidate 3ced34720446f6213def30d281e8c24ae1d6f2a9 passed CI 45420384435 and disposable schema 45420384431. Hosted staging check skipped on that head. GitHub generated merge ref 586394e507d086fd2fd3f57238e73abca01d4ff9 with current main and that head as parents; no check runs returned on this merge SHA. New code requires new test evidence; no old PASS transfers to it.
- OpenAI organization screenshots: optional sharing disabled, API call logging selected Disabled, usage dashboard restricted, Logs UI owner-only. Intended Rythm Company OS project Global, dedicated Production-named active key. Actual deployed credential/project match and effective special retention approval not verified. Assume standard monitoring up to 30 days with exceptions for planning, not a proven account setting. No EU-only or ZDR claim.
- Cloudflare inbound Worker Production: Logs, Traces, Issues off and no displayed telemetry destinations. Email Routing service telemetry and account-wide exports remain distinct.
- Gmail personal: general forwarding and POP disabled, displayed filters have no forwarding action, MFA methods configured but explicit status not shown, recovery email needs verification and linked-app permissions/delegation require scope review. No message deleted.
- Google states consumer Gmail AND Drive do not have a Google DPA. This is a concrete contract gap to assess under GDPR Articles 28 and 44–49 if Google acts as processor/subprocessor; an encrypted archive is not automatically outside GDPR. Keep current recoverable archives private while planning a compliant destination and validating a replacement. Do not move or delete the only recoverable copy. No paid service procurement authorized.
- Supabase Free/no scheduled backups, Vercel Hobby/no displayed Drains: scope-specific earlier dashboard evidence, not general retention guarantees.
- Repo managed mail routing identifies Resend as outbound and Supabase as system of record; managed Resend is described as Production server integration. Public register currently lists only Supabase, Vercel, OpenAI and Cloudflare. Determine actual Resend processing, contract, retention and register role before customer activation. Stripe integration code and existing server configuration are evidence of potential payment processing, not proof that live customer checkout is active. Confirm real billing flow against the W16 scope and adjust notices if needed.

## New consent issue and remediation

The integrated source had a root-mounted GoogleAnalyticsConsent component, a Cookie Notice denying current third-party analytics, and first-party referral/event collection and server conversion attribution without an explicit consent check. Draft branch adds a versioned opt-in cookie (old consent does not authorize expanded scope), client storage/transmission guards, HTTP and server conversion guards, a withdrawal control on /cookies, cleanup of known optional browser storage and GA disable flag before reload, and corrected Cookie Notice. Acceptance may lose original referral context because page reload is deliberate. Local UI event dispatch remains for functionality, not persisted analytics. These are draft changes, not a verified compliance result. Validate cross-tab behavior, host/cookie scope, expiry, refusal/withdrawal, no third-party network before consent, no first-party DB write on refusal and no interference with essential features. Confirm Google Analytics property configuration and retention, applicable terms, and first-party existing data disposition. Test parser/source-boundary assertions via test:w17; these are not a substitute for browser/network tests.

## Proposed legal/disclosure corrections for counsel

| Source | Issue / proposed decision |
| --- | --- |
| Privacy Notice | Clearly distinguish RYTHM controller activities (account, support, billing) from customer-controller workspace processing. Explain actual recipients including communication, analytics and applicable payment processing. Verify purposes, legal bases, transfer safeguards and retention; no unsupported EU residency or provider deletion claims. |
| Data Requests | Article 12 clock from receipt, without undue delay and normally within one month, with reasoned permitted extension communicated within that initial period. Identity verification proportionate; distinguish Article 15 copy and Article 20 applicability; do not promise instant complete account deletion. |
| DPA | Article 28(3)(g): controller choice of return or deletion at end of services and deletion of copies unless applicable Union or Member State law requires storage. Review current "where reasonably available" and broad security/claims exceptions; distinguish controller's own lawful records from processor-held data. Review subprocessor authorization, change notice, breach notice, audit rights, transfers and annexes. |
| Subprocessor register | Verify Resend, Google Analytics, consumer Gmail/Drive and any actual Stripe/customer-authorized integration roles and terms. Do not simply label consumer Google as contracted processor. Update register before introducing any new processor to customer data. |
| Cookie Notice | Draft corrected to reflect optional GA and first-party analytics and consent withdrawal. Validate actual implementation and provider terms before publication. |
| Retention | Owner-approved operational 90-day logs, 12-month minimal erasure receipt, 30-day operational backup target. Raw MIME 30-day proposal after verified complete extraction and exception review; ordinary support review 90 days after closure. Financial statutory and OSS scopes separately confirmed. No age-only purge. Resolve overlap with older three-year case-file review and ensure access restrictions. |

## Technical remaining risks / tests

- Organization owner export selects all columns from an allowlist of tables and uses range(0,9999) without pagination or explicit completeness checks. Confirm each table/column and RLS, third-party data, and export bounds; do not describe this as complete DSAR or exhaustive organization export. Audit sensitive columns and response logs before final release.
- Actual account with shared ownership, retained billing/usage records, indirect references and provider copies remains unresolved. Use synthetic cases for ownership transfer, holds, queued writes, retained records and repeated deletion. Never run destructive smoke tests on real accounts.
- For raw MIME, verify attachments and header dependencies, retention holds, retries and preservation of parsed content with synthetic fixtures before enabling purge. Existing 2 old raw records are review candidates, not approved deletion targets.
- Verify final exact integrated commit and all required CI, browser and isolated database checks; preserve ledger and new recovery point; do not merge/deploy while release sign-offs remain outstanding.

## Decision checklist for independent reviewer

Record reviewer, date, applicable service agreements and actual account scope, decision (approved / rejected / conditional), required changes, and evidence link for each item in W17_LEGAL_REVIEW.md. Explicitly decide Google consumer mail/backup alternatives or lawful non-processor role, processor/subprocessor terms and transfers, statutory record categories, retention clocks, data rights and backup restoration controls. Do not mark release approved on the basis of owner approval or this packet alone.

Primary references: https://eur-lex.europa.eu/eli/reg/2016/679/oj ; https://support.google.com/policies/answer/9581826/privacy-help-center ; https://developers.openai.com/api/docs/guides/your-data ; https://admin.google.com/terms/apps/8/1/en/dpa_terms.html .

No Production writes, deployment, paid service activation or customer-data purge performed as part of this review.
