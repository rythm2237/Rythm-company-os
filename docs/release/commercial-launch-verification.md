# Commercial launch verification and remaining gates

Audit date: 30 September 2026. Baseline: main `35a283daed78e2dffd6697d9b0163c8d314c0be9` (PR #410).

## Verified baseline

- Phases 1–5 implementation was merged through PRs #404–#409. Phase 4 and 5 customer E2E limitations remain; merging does not certify them.
- Baseline Production deployment `dpl_EXxR6gARHfFU2AP8PcwFWRPEQ91W` is READY, assigned to rythm-os.com, and matches baseline main.
- Production migration registry contains paid-launch hardening, template operational readiness, commercial selection, atomic approval resume and assisted commercial activation, plus the completion-architecture followups.
- Provisioning and payment-confirmation RPCs deny anon and have empty search_path. The legacy provisioning RPC denies authenticated. These grant checks do not prove a positive customer installation.
- Production /api/health returned HTTP 200, status ok, configured database and external actions locked. This endpoint checks configuration, not live database queries or provider access; database availability was separately confirmed through read-only SQL.
- Main CI run 36677155121 succeeded. Branch main remains unprotected; administration endpoint returns 403 for the connected GitHub App.
- Runtime error aggregation over the inspected 24-hour window returned one meeting continuation stop on an older deployment: HTTP 409, meeting not open for deliberation. It is not evidence of successful execution or a current release regression.

## Follow-up changes

Provider setup eligibility now uses an explicit available/setup_available allowlist. Coming-later, missing and unknown availability are excluded from available counts and initial selection; the server action rejects forged setup submissions before any database write. Existing connections remain accessible for management.

CI explicitly runs commercial selection, actual isolated PostgreSQL payment migration tests and the unavailable-provider server-action regression. Prebuild also runs availability validation. The public production smoke can be repeated with `npm run smoke:commercial-public`, or the manually dispatched Commercial Production Smoke workflow. It performs GET requests only and tests health, templates, assisted billing copy, signup and selection-preserving setup redirects.

## Integration capability boundaries

Availability, historical authorization, resource discovery and permission to execute are separate facts. A project can require a provider even when the template does not mark it required. A connected row is historical evidence; verify health and bind the exact resource before dependent work.

| Template | Production requirement classification | Limit |
| --- | --- | --- |
| Software Company | GitHub, Vercel and Supabase recommended; Cloudflare/Figma/Stripe optional; several business systems recommended | External code/deploy work requires verified bindings and approval; Stripe company-connection setup is coming later |
| AI Advertising Agency | Analytics and Search Console recommended; advertising networks, Ahrefs and Semrush optional; several business systems recommended | Running paid campaigns requires the project's exact account authorization and approvals |

Neither template has an external required provider at template level in the inspected Production data. Recommended business categories include planned/unavailable services and do not establish executable capability. Accounting ERP and People HRIS requirements exist but those providers were absent from the enabled registry.

The enabled registry contains 31 providers: 22 available/setup_available and 9 coming_later. Resource discovery is flagged supported for 9; the flag is implementation metadata, not successful account discovery. Production Google Ads, Google Business Profile and LinkedIn Marketing lack successful verification timestamps; Meta is setup_required; Ahrefs and Semrush are error. Other providers have historical verifications, not current live health certification. No credentials were extracted for this audit.

## Release procedure

1. Complete related changes on a branch. Review migrations for auth checks, grants, search_path, tenant isolation and rollback. Execute affected SQL against isolated PostgreSQL before applying it; a source-text validator alone is insufficient.
2. Run affected tests, typecheck, lint and build. CI build must succeed for the exact PR head. Merge once; let Git trigger Production deployment. Apply reviewed migrations when required and verify their registered state and relevant contracts. This follow-up requires no migration.
3. Confirm deployment READY, main commit and custom domain alias. Run public smoke. Inspect scoped runtime errors. This is technical release verification, not a customer acceptance certificate.
4. Perform the remaining customer tests below. Record account/company, time, expected/actual results and non-secret evidence. Never infer pass from a validator or a database status field.

## Remaining human-dependent acceptance

| Gate | Required evidence / action |
| --- | --- |
| Branch protection | Owner enables PR requirement, required CI build, up-to-date branch and no bypass; disallow force pushes/deletions. Re-read main until protected=true. Connector has no administration scope. |
| Customer authentication | Authorized test user completes email verification/OAuth. Verify selected product/template through login, refresh and back/forward, with correct active-company context. |
| Real payment and installation | Real received invoice payment confirmed by allowlisted platform admin per docs/commercial/activation-model.md; customer reloads Activation and explicitly provisions selected Agency/Software template. Do not fabricate Production invoices. |
| Provider health and binding | Company owner runs Check connection health, discovers accessible resources, and binds the actual project resource. Provider consent/login/MFA must be completed by its authorized user. |
| Billing email | Send an explicitly authorized Billing request and verify receipt with its recipient; no email was sent for this audit. |
| Template execution | Run one approved scoped project for each template; verify approval pause/resume, external result, evidence, correct tenant and completion/closeout report. These flows have not been certified in Production. |

## Readiness verdict

Technical fixes can be deployed independently of these acceptance gates. Full paid commercial readiness remains NOT VERIFIED until the gates above have real evidence. Phase 6 live connectivity, Phase 7 enforced repository protection/customer E2E, and final commercial acceptance must not be marked complete merely because implementation and CI succeed.
