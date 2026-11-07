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
