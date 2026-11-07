# W05 — Private files, signed URLs, downloads: execution and acceptance register

**Review date:** 2026-11-07 · **Priority:** P0 · **Scope:** SEC-05 · **State:** IMPLEMENTED IN DRAFT BRANCH; **NOT ACCEPTED / NOT DEPLOYED**.

## 1. Grounded production baseline (read-only inspection)
- GitHub `main`: `e79bd764238482deb8019267b3fbb3c471bdaf0c` (W04 merge). Vercel production alias `rythm-os.com` → deployment `dpl_AUc1u9iicPrJDTisoMH4xG382DZb`, READY, same SHA. No assumption that older historical baseline SHA is live.
- Supabase production `dezbacyuvsdrlpmmpjht`: ACTIVE_HEALTHY. Production ledger includes W04 versions `20261107050033`, `20261107050037`. Feature flags retrieval returned HTTP 403; **feature-flag parity unverified**.
- Supabase staging `viqjdgohtxqkrdgwtull`: INACTIVE. Re-activation might incur cost; no activation or migrations executed.
- W02 PR [#438](https://github.com/rythm2237/Rythm-company-os/pull/438) and W03 PR [#440](https://github.com/rythm2237/Rythm-company-os/pull/440): staging evidence exists, but both are draft and unmerged. Upstream migration-history parity remains a separate outstanding release gate.
- Storage buckets `project-files`, `company-knowledge`, `agent-artifacts`, `agent-attachments`, `ai-workspace-private` have `public=false`; `nail-2nya-media` is intentionally public.
- `storage.objects` policy `crm_project_storage_gate` is **RESTRICTIVE**, not permissive (confirmed `pg_policy.polpermissive=false`). Its `bucket_id <> 'project-files'` branch does **not** grant any object read independently. `crm_documents_confidentiality` and `crm_chunks_confidentiality` are likewise restrictive.
- `authenticated` has table-wide UPDATE rights, including `public.project_documents.storage_path`. Current `crm_private.document_guard` and `document_relationship_guard` do not freeze or validate object keys. Prior CRM GET resolved metadata under RLS then downloaded arbitrary `storage_path` using service-role. This constitutes a **verified authorization design flaw / confused-deputy possibility**, not a claim of completed real-world exfiltration.
- `app/(app)/company-library/actions.ts` created a **300-second signed URL**. Previously issued signed URLs are bearer capabilities: membership revocation alone does not revoke their token before expiry.

## 2. Code changes (draft branch only)

| Entry point | Change | Why |
|---|---|---|
| `lib/security/private-file-validation.ts` | Organization/project/contract object key assertions, extension allowlist and signature checks | Treat mutable storage paths and MIME headers as untrusted |
| `app/api/crm/documents/[id]/route.ts` | Caller RLS + explicit org/path/capability + auditable restricted access before privileged file download; size/MIME checks; attachment + no-store | Prevent unauthorized metadata and bytes / IDOR / confused deputy |
| `app/(app)/crm/actions.ts` | Validate contract upload extension/content before service-role transport | Reject spoofed MIME |
| `app/api/projects/files/route.ts` | Validate project upload extension/content | Reject spoofed MIME |
| `app/(app)/projects/page.tsx` | Validate project-intake upload file type/content and clean orphan storage objects | Close alternate upload bypass |
| `lib/projects/project-knowledge.ts` | Confirm worker-claimed file path is within expected organization+project before service-role download | Defend AI/background processing path |
| `lib/company-knowledge.ts` | Require company Storage object path to match current organization | Defend agent attachment/knowledge ingestion path |
| `app/(app)/company-library/actions.ts` | Replace 300-second bearer signed link with same-origin download route | Request-time revocation and no link leakage |
| `app/api/company-library/documents/[id]/route.ts` | Check owner + active membership + entitlement + caller-scoped RLS + Storage policy for **each** GET; no service-role | Revocable owner download |
| `app/api/privacy/export/route.ts` | Require active owner membership for organization export | Stop export after membership revocation |
| `supabase/migrations/20261107060000_w05_file_confidentiality.sql` | Proposed restrictive Storage policy blocks `object.sign` / `object.sign_many` on sensitive buckets; trigger freezes `storage_path` and org identity | Prevent new private signed URLs and forged DB object mapping |
| `scripts/validate-w05-*.mjs`, `package.json`, `.github/workflows/ci.yml` | Isolated JS, PostgreSQL/PGlite, HTTP fixture regressions and CI integration | Deterministic no-provider evidence |

**Known limitations:** Signature sniffing establishes magic headers / UTF-8 compatibility, not deep document structural validation or malware scanning. All new policies and code are untested against real Staging Storage API and browser JWT sessions; no claim of release parity.

## 3. Executed commands and observable evidence

### Read-only checks on production catalog
Executed via connected Supabase read-only SQL:
- `select id, public, file_size_limit, allowed_mime_types from storage.buckets order by id;`
- `select policyname, cmd, roles, qual, with_check from pg_policies where schemaname='storage' and tablename='objects' ...;`
- `select c.relname,p.polname,p.polpermissive,p.polcmd from pg_policy p ...;`
- `select has_table_privilege('authenticated','public.project_documents','UPDATE'), has_column_privilege('authenticated','public.project_documents','storage_path','UPDATE');`
- `select p.proname, pg_get_functiondef(p.oid) from pg_proc p ... where p.proname in ('document_guard','document_relationship_guard');`
All catalog reads completed. No customer records or file bytes retrieved.

### Automated PR checks
- Command: `npm run test:w05` — `node --experimental-strip-types scripts/validate-w05-file-confidentiality.mjs` + `node scripts/validate-w05-storage-rls.mjs` + `node scripts/validate-w05-file-http.mjs`.
- PGlite isolated data: two synthetic organizations, authorized own-object SELECT, denied foreign select, denied `object.sign` and `object.sign_many`, denied revoked own select, unchanged public media policy, denied wrong-org/wrong-project INSERT and redirected UPDATE.
- HTTP synthetic mocked handler fixtures: project/contract GET 401/404/503/200, RLS metadata missing, foreign-tenant object key, missing contract capability, audit fail-closed, MIME mismatch, valid bytes, Company Library revoked/nonowner/authorized reads.
- Prior PR run [CI 42344898078](https://github.com/rythm2237/Rythm-company-os/actions/runs/42344898078) at head `f409ae2d` **passed build and CRM browser jobs** (before new Company Library HTTP changes).
- Later [CI 42345287199](https://github.com/rythm2237/Rythm-company-os/actions/runs/42345287199) passed first two W05 subtests, then failed on malformed regex in newly added HTTP **test harness**, fixed in subsequent commit. It is **not evidence of application security failure**.
- Most recent CI and browser/build outcomes must be read from GitHub checks before any PR acceptance; do not infer pass from test definitions.

## 4. Acceptance criteria — current state

| Required criterion | Status | Outstanding verification |
|---|---|---|
| AC1: Unauthorized principals cannot retrieve restricted bytes or metadata | **PARTIAL / NOT VERIFIED** | Synthetic SQL/API regression covers focused paths. Need real staging user/member/foreign tenant + direct Storage API + AI artifact + exports HTTP tests |
| AC2: Revoked access and expired URL behavior verified | **PARTIAL / NOT VERIFIED** | Isolated membership revocation and signing denial covered. Need staging browser/token revocation & expired/reused signed-link tests; previously issued links cannot be forcibly revoked by RLS alone |
| AC3: Audit evidence shows successful authorized and denied cases | **PARTIAL / NOT VERIFIED** | CI test assertions show both in isolated fixture. Need real staging runtime audit evidence, sanitized request IDs, positive/negative browser sessions |

**W05 status: NOT FINISHED, NOT ACCEPTED FOR RELEASE** while above cases remain unverified.

## 5. Staging-only, no-paid-provider acceptance runbook
1. First obtain explicit cost approval for any required Supabase staging reactivation; review W02/W03 accepted fixtures; use isolated synthetic identities and disposable documents only. Never use real customer documents or production data.
2. Apply W05 migration to dedicated staging after reviewing existing key formats; exercise direct Storage SELECT/list/download/sign/sign-many as owner/member/outsider/foreign org, verify project documents and knowledge RLS, and verify public media unchanged.
3. Browser/session: owner downloads private contract and Company Library synthetic file (status 200, expected hash, filename, `no-store`); foreign tenant and same-tenant unauthorized member get 404/denied and no metadata. Test direct object reference by known foreign UUID/path. Test authenticated and unauthenticated access.
4. Revoke owner or member access; retry **previously obtained internal URL**; check deny. For any historical signed URL, verify expiry/old-link reuse; if immediate retroactive invalidation is required, relocate/delete the object or rotate the signing credentials with an explicit disruption plan.
5. Verify MIME spoofing, invalid bytes, size/mismatch, audit logging with no file content in logs, source document retention policy, and service-role route restrictions.
6. Verify the full CI build, lint, typecheck, CRM browser regression and W02/W03 tenant matrix; sanitize fixture data and restore capacity states after any staged run.

## 6. Deployment / rollback discipline
- PR remains **Draft**, branch `security/w05-file-confidentiality`. No merge, production deployment, production migrations, customer data access, external AI calls or costs authorized/performed.
- **Before deploy**: owner reviews migration history parity, legacy document key shapes, operational effect of disabling private signed URLs, backup plan, active entitlements, affected functions, and a change window.
- **If branch not merged:** close PR/delete branch; no production rollback necessary.
- **If approved and released later:** revert application via reviewed commit or deployment rollback, and use a separately approved compensating SQL migration to drop `w05_no_signed_private_downloads`, `w05_project_document_storage_guard` and `crm_private.project_document_storage_boundary()` only after confirming the old file-download behavior cannot reopen the confused-deputy flaw. Never roll back the security boundary blindly.

## 7. Human-review checklist
- [ ] Owner verifies all changed paths and migration SQL against current deployments and all bucket policies.
- [ ] Release manager accepts upstream W02/W03 evidence and resolves missing schema-history parity.
- [ ] QA provides sanitized real staging positive/negative/expired/revoked/download tests for all five private buckets.
- [ ] Security confirms no signed-token issuance, actor impersonation, AI tool privilege escalation or content leak through exports.
- [ ] Review `npm ci` dependency audit warning independently; dependency remediation is outside W05.
- [ ] CI, lint, typecheck, build and browser tests pass on **final head**.
- [ ] Owner separately authorizes merge, migration and Production deployment (none implied).

## 8. Staging provider execution, CDN revocation finding and response — 2026-11-07

> This section **supersedes the earlier inactive-Staging / no-live-evidence status** in sections 1–4. W05 remains **NOT ACCEPTED**, pending the final live authenticated application/preview matrix and independent human review.

### Environment, scope and new implementation

- Verified FREE Supabase plan; reused an existing active-project slot by temporarily pausing `ai roadmap` and restoring Staging `viqjdgohtxqkrdgwtull`. No new billed project/branch or external model-provider call.
- Re-scoped the existing 22 W01-specific Vercel Preview variables **temporarily** to `security/w05-file-confidentiality`, including encrypted Staging-only Supabase service credentials. Explicit Staging URL verified; agent execution/external actions disabled and AI budget zero. Production variables/deployment unchanged. **All variables must be scoped back to W01 before acceptance**.
- Real Staging W05 migration: `20261107063748_w05_file_confidentiality_staging`; Staging-only private-bucket parity migration added missing `company-knowledge` and `agent-artifacts` buckets/policies with matching Production limits (all five private). New follow-up migration `20261107070000_w05_block_cached_private_downloads.sql` applied **only on Staging** as `w05_block_cached_private_downloads_staging`. Supabase-generated migration versions are not aligned with repository migration names; reconcile before Production deployment.
- Added `w05_no_private_authenticated_direct_get` RESTRICTIVE SELECT RLS policy to block `object.get_authenticated` on all five sensitive buckets in addition to the previous sign/sign_many prohibition. This prevents a caller from establishing **new** cached direct private downloads; cannot invalidate already populated CDN objects by itself.
- Refactored four private backend fetch paths: Company Library GET, Company Library ingestion, agent knowledge retrieval, and agent attachment loader. They retain request-time owner/tenant/agent ACL and use service-role **transport only after** checking metadata and object key. Alternative CRM customer-profile extraction now validates the document's organization/project/contract path and MIME signature before privileged download.
- Real CI inventory `scripts/w05-inventory-private-storage.mjs` found **70 source matches** (including tests and public media). Relevant direct company-knowledge and agent-attachment server download sites were individually reviewed. No new direct authenticated private object GETs should be introduced.

### Genuine Staging REST/Storage and DB evidence

- An isolated **real Supabase Auth/Storage** run created three temporary verified synthetic JWT users and ten synthetic text/PDF objects, spanning three roles and two of the existing synthetic tenant organizations; exercised all five private buckets via real HTTP APIs. Real own-object authorized bytes, foreign-tenant denials, member vs owner restrictions, and authenticated signed-URL issuance denials **PASS across all five buckets** in the executed scenarios. Real authenticated direct GET to project-files and ai-workspace-private was denied even before the new policy.
- **Found a critical negative case before fix:** The test reported that a previously authenticated `agent-attachments` download still succeeded immediately after a membership update request. The test did **not** independently re-read the update poststate, so this is a failing revocation assertion and consistent with Supabase's documented private CDN caching behavior, **not proof of a confirmed verified post-revocation leak**. Official context: https://supabase.com/docs/guides/storage/cdn/smart-cdn and Supabase's private bucket revocation troubleshooting article. The test did not reach post-revoke signed-link checks, and must not be represented as fully passed.
- Subsequent **real PostgreSQL** checks on Staging PASS: `object.get_authenticated` returns **zero** objects in all five sensitive buckets for a temporarily activated owner; owner `object.list` continues to see only own attachment metadata; cross-tenant list denied; `object.sign` denied; owner `storage.objects` INSERT to agent-artifacts still succeeds (rolled back). Other W05 document identity trigger tests previously passed.
- A separate *genuine Supabase HTTP expiry test* created one synthetic text object, minted a short-lived service-side signed URL and retrieved its original bytes with HTTP **200**, then after expiry observed HTTP **400**, byte equality **true** and cleanup **true**. This validates expiration under that tested TTL, not instant revocation of earlier bearer links.
- Observed sanitized real Storage runtime log aggregates on Staging, including successful/denied GET operations and blocked signing POSTs. No private document bytes, raw credentials or tokens were included in the report.
- A W05 Vercel Preview branch alias was temporarily permitted for anonymous negative API probes: CRM GET returned **401/no-store**, Company Library GET **404/no-store**, AI Workspace GET **401**. The temporary alias bypass and share link were revoked and SSO protection was verified restored.
- Both temporary Staging Edge QA endpoints were redeployed to inert, JWT-required handlers (`w05-staging-acceptance` v3; `w05-staging-expiration` v2); first endpoint anonymous invocation verified HTTP 401. No provider calls/paid browser runs.

### Status / mandatory release gates

| Acceptance | Current interpretation |
|---|---|
| AC1 unauthorized private bytes/metadata | **STRONG PARTIAL; NOT VERIFIED END-TO-END**. Real all-five-bucket REST Storage/tenant matrix and new PostgreSQL RLS gates pass. New updated app/server endpoints lack a positive+negative current-preview real-authenticated browser/HTTP test after final code commit. |
| AC2 revoked/expired behavior | **STRONG PARTIAL; NOT VERIFIED END-TO-END**. Real short-lived signed URL expiry passes; SQL revocation denies metadata; caller-direct GET blocked by updated RLS; reauthorized app proxy revoked-session E2E and already-cached legacy URL behavior remain unverified. |
| AC3 authorized+denied runtime audit evidence | **PARTIAL**. Real Storage HTTP statuses and RPC/CI assertions observed; sanitized app-level positive/negative CRM and Company Library download audit evidence still needed. |

**Must not merge/release** pending app-level logged-in tests, latest SHA CI/build + security review, original Vercel variable-scope and Supabase capacity restoration, W02/W03 draft dependency review, schema migration ledger parity, and explicit Production release authorization.

## 9. Final W05 Staging acceptance — 2026-11-07 (SUPERCEDES earlier incomplete E2E notes)

**Verified application commit:** `c0fbbdeae0e2a13947586bdca64ae718ed15124c`, deployed READY in Preview `dpl_4ceM5HikH5MERu1inNKtJfHNddAD`; configured exclusively against Staging `viqjdgohtxqkrdgwtull`. GitHub CI [run 42365932986](https://github.com/rythm2237/Rythm-company-os/actions/runs/42365932986) passed BOTH `build` and `crm-browser` jobs (including W05 mock HTTP guards, real PGlite policies, typecheck, lint and build).

### Real, live and rerunnable acceptance evidence

The Staging-only acceptance harness exercised **existing** synthetic `@example.test` identities belonging to two tenant organizations. The three selected identities (owner A, operator A, owner B) were temporarily activated, and their previously banned status, active-organization profile settings, memberships and entitlement states were restored afterward. No production identity was touched, no external AI action was executed, and all synthetic test files and document rows were removed.

On the **actual Next.js Vercel Preview**, via real Supabase Auth JWT session cookies and real Storage HTTP:

1. **PASS** CRM authorized owner returns HTTP `200` with original synthetic PDF bytes.
2. **PASS** CRM authorized bytes exactly match the uploaded test object.
3. **PASS** Company Library authorized owner returns HTTP `200`.
4. **PASS** Company Library authorized bytes exactly match the uploaded test object.
5. **PASS** CRM cross-tenant owner returns HTTP `404`.
6. **PASS** Company Library cross-tenant owner returns HTTP `404`.
7. **PASS** Company Library active same-tenant operator returns HTTP `404`.
8. **PASS** Anonymous CRM access returns HTTP `401`.
9. **PASS** Anonymous Company Library access returns HTTP `404`.
10. **PASS** Membership update to `inactive` independently read back from the real database.
11. **PASS** Previously authorized CRM JWT after membership revocation returns HTTP `401`.
12. **PASS** Previously authorized Company Library JWT after membership revocation returns HTTP `404`.

**Result:** `12/12 PASS`, including bytes and time-of-check/time-of-use denial. This supersedes the earlier false-negative Company Library test, where the synthetic profile lacked its required active organization. This rerun used existing seeded identities with explicitly set active organization.

### Immutable positive and negative file access audit

W05 now includes `lib/security/private-file-audit.ts` and server-side grant/deny Audit before byte release in both routes. An Audit insert failure for a permitted download **fails closed**. Audit entries omit storage paths, signed URLs and file contents; they contain only tenant, actor, resource, result and a bounded reason code. The real Staging `public.audit_events` table produced **five** minimal immutable events during the final test:

- `private_file.access_granted`: CRM 1, Company Library 1;
- `private_file.access_denied`: CRM `not_found` 1, Company Library `not_found` 1 and `forbidden` 1.

Unauthenticated requests have no confirmed tenant/user context and deliberately do not create tenant-attributed `audit_events`; their actual HTTP denial status was independently asserted above. Existing confidential CRM resources still use `crm_log_sensitive_access` in addition to the W05 generic file audit.

### Storage, legacy bearer URLs and remaining release constraints

- All five private buckets were tested in real Supabase Storage HTTP with synthetic files across tenant roles. A new restrictive RLS policy blocks new direct authenticated `object.get_authenticated` on the five private buckets and bans user signing, while backend authorized per-request file proxy continues to work. The provider CDN can still serve previously cached objects or previously minted signed bearer URLs until their respective TTL. No retroactive revocation guarantee is claimed.
- A genuine short-lived signed bearer returned `200` before expiry and `400` after expiry; synthetic content and cleanup verified. Real Staging SQL tested immutable object path identity, tenant filtering, signing denial, and preserved authorized object uploads.
- The original Staging schema lacked two private buckets; a **Staging-only** private-bucket parity migration added `company-knowledge` and `agent-artifacts` with correct private policies. These buckets already existed in Production. The W05 follow-up schema migration `20261107070000_w05_block_cached_private_downloads.sql` was applied **only to Staging**.
- **Do not deploy directly to Production:** Staging's Supabase-generated W05 migration timestamps differ from repo filenames. Migrations, W02 PR #438 and W03 PR #440 dependencies require separate human release review. Neither the W05 migration nor branch has been merged/applied on Production. Explicit owner approval is required for Production release.

### Cleanup exception (transparent)

A preliminary test incorrectly attempted the unsupported organization role `member`, then left one synthetic `w05final-…@example.invalid` Auth account. Its `organization.context_selected` audit row is immutable and foreign-keyed to the user, so hard deletion was rejected. Its temporary membership/profile were removed and the account **was banned for 100 years**. It has **zero** active organization memberships and cannot sign in. The final successful 12/12 run used existing synthetic users instead, created **no** new Auth identities and returned all 437 seeded `@example.test` users to banned status. Do not disable audit immutability to erase test evidence. Any permanent soft-deletion policy for the quarantined account is a separate privacy/security governance action.

### W05 decision

**W05 security functionality: STAGING ACCEPTED in the explicitly tested scope — AC1 PASS, AC2 PASS for new authenticated app downloads and expiry test, AC3 PASS with immutable app Audit.** Signed/cached objects already issued before deployment remain a documented TTL-bound residual risk. **Release status: NOT DEPLOYED / requires migration-ledger reconciliation, W02/W03 integration review and explicit Production approval.** It is safe to submit the W05 PR for code review, not to auto-merge it.
