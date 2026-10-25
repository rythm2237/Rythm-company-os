# W01 — immutable release baseline and isolated staging runbook

Owner: RYTHM Human CEO. Status: **PARTIAL / NOT SIGNED OFF** (2026-10-25).
Scope: Foundation only; production is read-only. W02 depends on an independently verified W01 staging boundary.

## Observed production baseline (not an assumption)

| Resource | Read-only finding |
| --- | --- |
| GitHub | rythm2237/Rythm-company-os, main = 8ba2f605f9fc926ab5428284f125589540a16ff0 |
| Vercel project | prj_zDgN04lvSuAEzkLr5MzQSohmwYoB (rythm-company-os), Next.js |
| Live alias | https://rythm-os.com resolves to dpl_DkyZXAywZnoEtvRRmvmyXSg67MaF, READY, target production |
| Live deployment SHA | 8ba2f605f9fc926ab5428284f125589540a16ff0 |
| GitHub CI | https://github.com/rythm2237/Rythm-company-os/actions/runs/39990393502, completed/success |
| Supabase production | dezbacyuvsdrlpmmpjht, ACTIVE_HEALTHY, eu-west-1, PostgreSQL 17.6 |
| Read-only public schema fingerprint | 4cb5f82d276c88fe4cc6e9cadc3fdb72 (4022 inventory lines) |
| Public tables and RLS | 214 public tables, all 214 RLS-enabled; not proof of tenant-policy correctness |
| Candidate staging | viqjdgohtxqkrdgwtull (rythm-phase3-staging), INACTIVE; migration introspection timed out |
| Vercel custom environments | none reported for the project |
| Vercel feature flags | cannot enumerate: 403 forbidden; do NOT infer values |
| W02 previews | exist on test/w02-isolated-multitenant-fixtures; not a verified isolated staging environment |

All versioned source evidence is in docs/qa/W01_BASELINE_SNAPSHOT.json. It contains only project identifiers, git SHAs, metadata, and migration names, **no customer records or secrets**. The git commit containing it is content-addressed release evidence. The snapshot is point-in-time; recapture read-only live metadata for subsequent releases.

### Drift finding: history != physical schema

GitHub main has 218 SQL files under supabase/migrations; Supabase's migration history reports 203 records. Exactly 15 match both migration version and name. There are 203 repository version+name items absent from recorded history and 188 database version+name entries absent from repository names; 162 names match without requiring matching version, and 57 repository names / 41 DB names do not have name matches. This is a **migration-history mismatch**, not evidence of differing physical schema.

**Seed safety finding:** supabase/migrations/202608050002_seed_company.sql embeds a fixed historical Human CEO Auth user UUID and inserts organization, membership and agent seed rows. It is **not suitable as an unchanged synthetic staging fixture**. Never copy/authenticate that original identity or assume a git-migration replay is safe. Prefer data-less Supabase dashboard branching from verified production migration history, then inspect whether any migration inserts production-linked identities; sign off on a sandbox-specific sanitization method without modifying production or the canonical migration archive. Explicitly attest synthetic_seed_verified=true only after verification. Do not execute all 218 repository SQL files against an existing database to 'repair' history. Never rewrite production migration history as a shortcut. Compare the independent catalog fingerprint and migration ordering on a disposable branch first; document aliases/renames and out-of-band applications.

### Code and safety reference points

- README.md: current MVP description and release discipline
- .github/workflows/ci.yml: baseline build, tests and browser smoke; original GitHub CI succeeded
- package.json: typecheck, lint, build, regression npm scripts
- supabase/migrations/: source SQL inventory (218)
- docs/PRODUCTION_RUNBOOK.md: operational kill switches and approval discipline; contains older MVP-specific instructions, **not** an authorization for a new Production migration
- .env.example: public vs server-only configuration
- vercel.json: scheduler at /api/admin/automation/dispatch; staging must suppress autonomous and external side effects
- docs/qa/W02-ISOLATED-THREE-TENANT-FIXTURES.md on W02 branch: synthetic fixtures and specific negative authorization cases

## Fully offline, repeatable checks available now

From a Git checkout at the audited branch root with Node.js 22:

~~~bash
node --check scripts/qa/verify-w01-baseline.mjs
node scripts/qa/verify-w01-baseline.mjs docs/qa/W01_BASELINE_SNAPSHOT.json
node scripts/qa/verify-w01-baseline.mjs --self-test
sha256sum docs/qa/W01_BASELINE_SNAPSHOT.json scripts/qa/verify-w01-baseline.mjs
~~~

The script validates the checked-out migration files against the source snapshot, the frozen production/branch SHA, reported history-drift counts, and nine **in-memory** staging safety rejection cases. **Offline PASS does NOT mean staging boot, schema parity, runtime flags, data isolation, or authorization have passed.** The dedicated GitHub workflow reports those checks without live credentials, changes or chargeable APIs.

For the existing application CI (requires full repository checkout, Node 22 and npm dependencies, with external calls disabled):

~~~bash
npm ci
npm run typecheck
npm run lint
npm run test:phase2:rls
npm run test:tenant-email
npm run test:enterprise-crm
npm run test:crm-sales
npm run build
~~~

The main-branch CI was confirmed green via GitHub; these commands have **not** been individually executed in the local assistant environment for this branch. A successful Preview build must not be confused with an isolated test environment.

## Human-controlled staging provisioning (BLOCKED until reviewed)

1. Obtain **separate owner approval and a confirmed price/budget** before restoring the inactive Supabase project or creating a Supabase development branch/project. The existing staging candidate may have old or real data; **do not assume it is clean**. Prefer a fresh branch with production **schema only, no production data** if billing and scope are approved. Record its unique ref; amend the W01 snapshot and test allowlist in a reviewable branch if a new ref is selected.
2. Validate the intended GitHub branch, exact SHA, Vercel project/team/target and staging Supabase project **before** editing any environment variable. Configure Preview/staging with its own publishable key, service secret only in backend/CI secure secret storage, and staging URL. Restrict Vercel Preview access; keep every production credential absent. Do not copy Production environment variables wholesale. Verify the resolved runtime Supabase ref, not just a UI label.
3. Configure staging-only values: RYTHM_ENV=staging, RYTHM_AGENT_EXECUTION_ENABLED=false, RYTHM_EXTERNAL_ACTIONS_ENABLED=false, RYTHM_MONTHLY_AI_BUDGET_USD=0. Disable all external/email/SMS/payment/webhook dispatches, third-party connector writes and autonomous schedulers; do not configure live Stripe, Resend, or billable AI provider keys. Staging cron endpoints must fail closed; do not call a production automation endpoint for smoke tests.
4. Ensure a separate staging auth redirect/URL setup, storage boundary, storage buckets, session cookies, and strict RLS. Never import production user/customer data. Seed ONLY deterministic fake identities, companies, projects and finance grants. The W02 fixture branch has a draft 3-company isolation setup; run it **only after this W01 gate has independent evidence**.
5. Discover installed Supabase CLI commands with supabase --help, supabase db --help, supabase migration --help. Apply/replay reviewed schema through a clean disposable local or staging target **only**. Check exact migration history against the production snapshot and compare read-only pg_catalog fingerprint; investigate any failure rather than overwriting migration history. Record execution logs with credential redaction.
6. Obtain an isolated Vercel Preview URL, deploy only after verifying no Production Supabase ref or live provider keys can reach it; boot it and perform smoke on the staging URL only. Authenticated tests must use normal user tokens, **never** service-role tokens to claim RLS passes.
7. Produce staging attestation JSON outside Git containing: version=1; staging.ref/status/url; independent pg_catalog fingerprint and inventory line count; migrations (version/name pairs); preview_url/runtime_supabase_ref; boolean flags for synthetic-only, synthetic_seed_verified, all outbound actions disabled, live-smoke pass and evidence review. The checker intentionally fails if the attestation is absent, mismatched, or claims to use production. Never include secret values, tokens, passwords or actual customer data.
8. Compare against the pinned manifest (see below), run negative multi-tenant scenarios plus teardown/repeatability on staging only, and retain logs/screenshots/CI URLs with content hashes in a reviewer-approved evidence store. Record any design/intent vs implementation differences. Keep Human CEO approval gates and scoped finance grants enforced.
9. Before W01 signoff, rerun read-only GitHub main/deployment alias checks, migration-history list, and physical schema inventory on BOTH environments; attach time, SHA, source, checksum and branch. Do not assume a 2026-10-25 snapshot still represents a later deployment.

~~~bash
node scripts/qa/verify-w01-baseline.mjs docs/qa/W01_BASELINE_SNAPSHOT.json --staging /secure/path/staging-attestation.json
# Only if live staging was independently verified and W01 signed off:
npm run test:w02
node scripts/fixtures/w02-staging.mjs roundtrip
~~~

The two W02 commands exist on the separate W02 branch, **not** on W01/main. Do not run them from a checkout that lacks the files. No production migration, billing configuration change or live message is authorized by this document.

## Production fingerprint read-only SQL (run in both databases)

The SQL hashes object names/column types, RLS and policy expressions, and function definitions **inside the database**; it returns only a fingerprint and inventory count, not rows or function bodies. This covers public schema, **not** auth/storage/internal schemas, runtime flags, triggers, grants, configuration, seed content or actual RLS enforcement. Add those independent audits before launch.

~~~sql
WITH inventory AS (
 SELECT concat_ws('|','T',n.nspname,c.relname,c.relkind::text,c.relrowsecurity::text) AS line
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
 UNION ALL
 SELECT concat_ws('|','C',n.nspname,c.relname,a.attname,
   pg_catalog.format_type(a.atttypid,a.atttypmod),a.attnotnull::text)
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='public' AND c.relkind IN ('r','p','v','m')
   AND a.attnum>0 AND NOT a.attisdropped
 UNION ALL
 SELECT concat_ws('|','P',schemaname,tablename,policyname,permissive,
   cmd,coalesce(qual,''),coalesce(with_check,''))
 FROM pg_policies WHERE schemaname='public'
 UNION ALL
 SELECT concat_ws('|','F',n.nspname,p.proname,
   pg_get_function_identity_arguments(p.oid),md5(pg_get_functiondef(p.oid)))
 FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
 WHERE n.nspname='public'
)
SELECT md5(string_agg(line, E'\n' ORDER BY line)) AS public_schema_fingerprint_md5,
       count(*) AS inventory_line_count, current_setting('server_version')
FROM inventory;
~~~

## Acceptance and owner sign-off

| Criterion | Finding | Status |
| --- | --- | --- |
| AC1 Production/main/staging SHA + schema drift documented | Prod/main resolved; preview W02 SHA known; no independently deployed staging SHA/schema; migration-history difference documented | **PARTIAL / FAIL** |
| AC2 Safe isolated staging verified without real data | Inactive staging candidate; no custom Vercel environment; no successful staging DB boot or synthetic live verification | **FAIL / BLOCKED** |
| AC3 Reproducible baseline and CI commands | Commands and fail-closed offline checker recorded; new CI must complete for branch and results reviewed | **PENDING CI** |

Reviewer must separately confirm: cost approval, synthetic-only project, staging credentials scope, exact migration and physical schema parity, preview isolation, external-action locks, tenant RLS under normal user roles, finance access gates, W02 fixture cleanup, immutable SHA/CI evidence, and explicit Human CEO signoff. **No signoff has been granted.**

## Rollback / containment

- No production rollback is needed because W01 changes only its feature branch documentation and tests.
- Close W01 draft PR and delete feature branch to undo repository changes; no Production alias or schema is touched.
- If an authorized staging environment is later created, stop background jobs and disable external actions; remove ONLY synthetic fixtures from staging with the vetted teardown procedure. Never delete production data or append-only audit records to 'clean' test traces.
