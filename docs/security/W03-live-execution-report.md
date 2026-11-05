# W03 live tenant isolation evidence

> Historical report. Superseded by [2026-11-05 validation report](W03-2026-11-05-validation-report.md), which includes additional confirmed fixes, real-token file/agent/ledger tests and final replay evidence.

Date: 2026-11-04. This record supersedes the execution gaps in `W03-2026-11-01.md`; historical reports remain historical evidence. This is a finite security test matrix, not release authorization or proof of every possible route/input combination.

## Baseline and execution binding

- Actual `main`: `995888ae6f7077f70527bbc95f74efd584115955`, rechecked on 2026-11-04. Historical audit `8ba2f605f9fc926ab5428284f125589540a16ff0` is its parent.
- Production alias `rythm-os.com`: READY deployment `dpl_GqWEucPScpnLAhyc1BFsv1VBDSLR`, URL `rythm-company-60u20efsw-ytalashti-7156s-projects.vercel.app`, same main SHA. A preview was not substituted for production.
- Production database `dezbacyuvsdrlpmmpjht` remained active. Only migration metadata was inspected: latest registered production migration `20261023125317 crm_connected_records`.
- Allowlisted staging `viqjdgohtxqkrdgwtull`: W01 restored schema with nine migration registry entries ending `20261026043457 w01_private_qa_evidence`. A restored schema baseline is not chronological or byte-for-byte production migration parity.
- W02 dependency: successful run [41221322661](https://github.com/rythm2237/Rythm-company-os/actions/runs/41221322661), SHA `3b6a30ac97512014b10f3cc91ee3d9935efbd6d9`; historical 3 organizations, 19 users, 20 memberships subsequently quarantined. W03 uses fresh identities, not reactivated W02 users.
- Core matrix SHA: `945b039cfa3b11983b1cf3384f20ae840bafe06a`; memory fix and expanded regression SHA: `2724e6c99a86fb026b212952665f071361d7bd88`, branch `test/w03-tenant-isolation-evidence`, draft [PR #440](https://github.com/rythm2237/Rythm-company-os/pull/440).
- Workflow [41825010580, attempt 2](https://github.com/rythm2237/Rythm-company-os/actions/runs/41825010580/attempts/2), job `126561315863`. Real authenticated Supabase REST/Auth/Storage traffic and a real Next.js HTTP server on the isolated runner, bound exclusively to staging. Not a published Vercel preview test.
- Secrets remain in the protected `w02-staging` environment. No provider keys were fetched into this workspace. Agent/external execution flags were explicitly false and model API keys empty in the test process. Effective Vercel flag listing returned 403 and remains unverified, including a repeated scoped read on 2026-11-04 using the exact project/team IDs. The endpoint explicitly reports no permission to list project flags and no known automatic fix. No configured Vercel CLI fallback is available; no alternate identity, environment secret extraction or protection bypass was attempted.

## Changes and boundaries

Confirmed violation fixed on this branch: the service-role memory resource handler accepted a project UUID owned by another personal workspace. It now checks project ID, authenticated workspace ID and non-archived state before inserting memory. Missing/foreign/archived/query-error references return 404. Own-project and personal-scope creation remain allowed. No database migration or production change was made. Test harnesses, manual workflow, CI regressions and sanitized evidence accompany the fix.

| Code path | Boundary / added evidence |
| --- | --- |
| `scripts/fixtures/w03-blueprint.mjs` | Fresh run/attempt namespaced synthetic identities; A/B same selected Advertising template, C selected Software template; native owner/executive/operator roles, six personas per company plus one shared user |
| `scripts/fixtures/w03-staging.mjs:303` | Allowlisted staging setup and exact-identity quarantine; retains immutable audit parents; cancels projects before deactivating managers |
| `scripts/fixtures/w03-live.mjs:19` | Independent password-authenticated sessions, server-side session cookies and real HTTP requests |
| `scripts/fixtures/w03-live.mjs:33` | Positive controls and sentinel rows in CRM, contracts, finance, projects, tasks, notifications, knowledge/memory and file metadata |
| `scripts/fixtures/w03-live.mjs:61` | Per-persona foreign READ/INSERT/UPDATE/DELETE, role context, direct-object HTTP, Storage bytes/signing and privileged RPC negatives |
| `scripts/fixtures/w03-live.mjs:96` | Background dispatcher rejects user JWT; owner-only CSV export and foreign sentinel exclusion |
| `scripts/fixtures/w03-live.mjs:102` | Shared user switches companies with executive/operator roles bound to the selected company |
| `app/api/ai-workspace/resources/[kind]/route.ts:10` | Caller-bound project lookup before privileged memory INSERT; same-origin guard preserved |
| `scripts/validate-w03-workspace-memory.ts` | Actual handler with real NextRequest/same-origin guard, mocked database/auth adapters; denial before INSERT and valid controls |
| `scripts/validate-w03-document-boundary.ts` | Isolated real download handler regression: denial before privileged storage and authorized positive bytes |
| `scripts/w03-active-sql-matrix.sql` | Real staging SQL with authenticated role/subject claims, positive membership controls and strict 57-case cardinality; transaction rolled back |
| `lib/auth/organization-context.ts:95` | Active membership fallback; authenticated selected organization at lines 108/124/138 |
| `lib/auth/api-organization-context.ts:3` | Owner API guard |
| `app/api/crm/documents/[id]/route.ts:9` | RLS metadata and sensitive audit before privileged download |
| `app/api/projects/files/route.ts:29` | Tenant/object filter before privileged upload |
| `app/api/projects/control/route.ts:11` | Tenant/object authorization before mutation |
| `app/api/crm/customers/export/route.ts:9` | Owner/organization-bound CSV query |
| `app/api/privacy/export/route.ts:78` | Owner and explicitly selected organization check |
| `supabase/migrations/20261022153241_shared_enterprise_crm.sql:271` | Restrictive document/Storage policies; private project file bucket |

## Exact executions

Run commands below only with server-side staging environment variables, never production values. Do not paste values in a terminal recording or commit them.

| Command / operation | Result |
| --- | --- |
| `npm ci --ignore-scripts --no-audit --no-fund` | PASS locally, 399 packages |
| `node --check scripts/fixtures/w03-live.mjs` | PASS |
| `node --check scripts/fixtures/w03-staging.mjs` | PASS |
| `npx eslint scripts/fixtures/w03-blueprint.mjs scripts/fixtures/w03-staging.mjs scripts/fixtures/w03-live.mjs` | PASS |
| `node --import tsx scripts/validate-w03-document-boundary.ts` | PASS |
| `npm run typecheck` | PASS locally on tested SHA |
| `npm run typecheck`, `npm run lint`, `npm run build` | PASS on exact tested SHA in CI run [41345426044](https://github.com/rythm2237/Rythm-company-os/actions/runs/41345426044); existing lint warnings remain |
| `npm run test:enterprise-crm` | Earlier branch validation PASS; embedded PostgreSQL/PGlite with real CRM migrations; not substituted for staging |
| `npm run test:crm-sales` | Earlier branch validation PASS; isolated API handlers |
| `npm run test:tenant-email` | Earlier branch validation PASS |
| `W03_FIXTURE_RUN=41342662942 node scripts/fixtures/w03-staging.mjs quarantine-partial` | PASS in attempt 2 |
| `W03_FIXTURE_RUN=41343124808 node scripts/fixtures/w03-staging.mjs quarantine-partial` | PASS in attempt 2 |
| `node scripts/fixtures/w03-staging.mjs setup` | PASS in attempt 2; 3 organizations, 19 users, 20 memberships |
| `node scripts/fixtures/w03-live.mjs` | Core run 41825010580 attempt 2 PASS: 2,324 checks, zero failures; expanded fixed run 41831048886 PASS: 3,086 checks, zero failures |
| `node scripts/fixtures/w03-staging.mjs quarantine-partial` | Core run PASS; independent SQL: 19/19 banned users, 20/20 inactive memberships, 0 live grants, 3 canceled projects. Expanded fixed run PASS; SQL verifies 19/19 banned, 20/20 inactive, 0 live grants, 3 canceled projects, 0 fresh invalid memory associations. All 152 historical W03 users are banned |
| Execute `scripts/w03-active-sql-matrix.sql` through staging SQL connection | PASS: 37 forbidden actor/company pairs see 0 projects; 20 legitimate memberships see exactly 1; 57-case assertion passed, ROLLBACK |
| `node --import tsx scripts/validate-w03-workspace-memory.ts` | RED before fix: foreign project returned 201; GREEN after fix including same-origin, unauthenticated, foreign/error/archived denial and own/personal positive controls |
| `npm run test:ai-workspace` | PASS after fix |
| `npx eslint app/api/ai-workspace/resources/\[kind\]/route.ts scripts/validate-w03-workspace-memory.ts scripts/fixtures/w03-live.mjs` | PASS after fix |
| `npm run typecheck` | PASS after fix |
| `npm run lint` | PASS after fix: 0 errors, 28 existing warnings |
| `npm run build` | PASS after fix: 111 static pages; postbuild passed 11 lifecycle regression scenarios; existing warnings only |
| Execute `scripts/w03-all-org-read-matrix.sql` against staging | PASS: 149 relations (146 tables, 3 views), 8,493 subject/organization/relation cases, 5,513 foreign cases with zero foreign rows; 27 relations have positive rows; ROLLBACK |
| Execute `scripts/w03-membership-boundary.sql` against staging | PASS: 259 negative authority cases; 37 each root organization READ/UPDATE/DELETE, foreign membership INSERT/UPDATE/DELETE, finance grant INSERT. Zero affected rows; ROLLBACK |
| `git diff --check` | PASS |

The SQL supplement uses database-assigned authenticated role/claims and is explicitly separate from the real password-authenticated HTTP tokens. Both evidence types are required and neither is mislabeled as the other.

## Failures investigated and sanitized reproduction

One confirmed object-authorization violation was found; the initial core matrix did not cover it. Test/environment failures were not converted into passing authorization results:

1. Run `41343124808`: cloned CRM account name caused unique constraint `23505`. Reproduce by copying a seeded account unchanged with a new UUID; this tests uniqueness rather than authorization. Fix: unique business names/numbers in forged inserts; require `42501` for those inserts. Historical successful regression run `41343517626`: 1,482 checks, zero failures, persisted in `W03-run19-evidence.json`.
2. Run `41344861512`: repeated quarantine tried to re-cancel an already canceled project after manager deactivation. Fix: skip rows already canceled. Later quarantine passed, retaining audit parents.
3. Run `41345115329`: roadmap mutation body omitted required `roadmapId`, returning 400 before object authorization. Fix: provide syntactically valid required fields; 400 is never counted as foreign-object denial. Corrected code is the tested SHA above.
4. Run `41825010580`, attempt 1: REST readiness passed during restore, then Auth `/admin/users` returned database shutdown errors `57P03`/`57P01` at 2026-11-04 12:00:43 UTC. No fresh fixture setup or isolation matrix ran. Auth logs establish a transient restore connection failure; no auth row or schema was modified. Re-running the failed job after restore completed passed pre-quarantine and fresh setup. Attempt 2 passed 2,324 checks and quarantine. The final workflow now requires three consecutive successful REST and Auth-admin readiness probes without logging response bodies.

5. Run `41827224252`: workspace own-create returned 403 before authorization because NextURL normalizes `127.0.0.1` to `localhost`. Fix the loopback test URL/hostname to `localhost`; do not weaken the application Origin guard. Evidence: `W03-run23-origin-failure.json`.
6. Run `41829527832`: task seeding failed with P0001. Staging has zero global completion policy rows; its progress trigger requires a completion policy. Fix only synthetic fixture preparation: a policy scoped to each exact W03 organization, all default evidence/acceptance gates retained, and canceled execution/task rows. No global reference seed, migration, completion approval or agent job was performed. Subsequent run passed task seeding. Evidence: `W03-run24-fixture-failure.json`.
7. **Confirmed BOLA, run `41830366705`, SHA `eb04a831ccd0e6d4cb3c5fc6c75a03fc7f2dbfb7`:** authenticated A owner POSTed `/api/ai-workspace/resources/memories` with `{"projectId":"<B personal-workspace project UUID>","title":"W03-FORGED","content":"synthetic foreign project reference"}` and a valid same-origin session. Own-project positive controls had passed. Expected 404; actual 201. Exact-fixture SQL independently found one memory whose `workspace_id` differed from its referenced project's workspace. The memory itself remained in A's workspace; no foreign content read or overwrite of B's existing project was demonstrated. The artifact has two failed records (the failed assertion plus catch summary), representing one reproduced violation. All identities were then quarantined. Evidence: `W03-run25-memory-reproduction.json` and artifact `13323132237`, digest `sha256:7f9898fbc753f7510f9600dced9678d96be525b14949890cad12798a9d77e03c`. Fix commit: `2724e6c99a86fb026b212952665f071361d7bd88`; isolated regression passes; full live regression passed 54 foreign project-insert cases, with zero invalid memory associations afterward.

8. Initial run `41342662942`: Auth health was reachable before PostgREST schema readiness, so setup failed before the matrix. Readiness was changed to probe authenticated REST, then strengthened to consecutive REST/Auth-admin probes in the final workflow. Fresh setup subsequently passed; no missing-table error was treated as an authorization denial.
9. Run `41343124808` cleanup initially lacked the recovered `state.users` map and failed its owner login identity assertion. Fix: populate the exact verified user map before login/quarantine, and skip login for identities already banned. Repeated pre-quarantine in later runs passed; final independent SQL confirms all 152 W03 users banned. This was fixture cleanup logic, not an application tenant-isolation fix.

Reproduction for the security matrix: dispatch `.github/workflows/w02-live-staging.yml` on the W03 branch with `confirm_staging_only=W03-STAGING-ONLY`, using the protected environment and allowlisted staging. Identity namespaces incorporate both run ID and attempt. Never substitute production or reuse banned accounts. For SQL reproduction, update the SQL file's exact fixture run/attempt namespace while users are still active; an empty or incomplete set fails the cardinality assertion.

## Scope and unresolved verification

- Same-template evidence means identical `selected_template_key` on separate pending synthetic entitlements; full template provisioning/agent cloning was not invoked and is not verified by this matrix. Human CEO and commercial activation gates were preserved.
- Named high-risk data surfaces are exercised through twelve organization-bound tables plus private workspace memory: `projects`, `project_executions`, `project_task_runs`, `crm_accounts`, `project_contracts`, `finance_invoices`, `company_memory`, `company_knowledge`, `project_decision_memory`, `action_items`, `notifications`, `project_documents`, plus `aiw_memories` and its personal workspace/project boundary.
- The broad SQL READ sweep covers every current organization_id table/view in staging. Of 149 relations, 27 contain same-tenant positive fixture rows; the other 122 lack populated positive controls and their zero/error results are not sufficient proof of isolation. No authenticated organization-scoped table with disabled RLS and direct CRUD privilege was found in a separate catalog check.
- Remaining work before W03 can close: classify untested routes by tenant/identity boundary; add populated fixtures and actual-token negatives for remaining high-risk handlers and privileged worker payloads; exercise full same-template provisioning through the canonical approval gates; resolve the scoped Vercel flag read denial and verify published configuration/parity. Preserve budget restrictions and do not replace those missing runs with generic 401/403 smoke checks.
- HTTP coverage is finite and recorded per case. The 101-route inventory preserves NOT_RUN entries; passing selected project/CRM/export/dispatcher routes does not prove all other routes or all request methods.
- External provider calls, real billing, email sending, AI model execution, production destructive tests and customer data are excluded. Zero synthetic AI budget and disabled execution are deliberate.
- Production/staging migration-byte parity, effective published flags and published Vercel preview behavior remain unverified. A pass of this staging matrix is not a claim of production security or deployment approval.

## Acceptance and review

Expanded fixed live execution: run [41831048886](https://github.com/rythm2237/Rythm-company-os/actions/runs/41831048886), SHA `2724e6c99a86fb026b212952665f071361d7bd88`, job `126578026036`, SUCCESS: 3,086 checks, zero failures; setup, matrix, quarantine and artifact upload all passed. Full CI [41830869348](https://github.com/rythm2237/Rythm-company-os/actions/runs/41830869348) passed both build and CRM browser jobs on this exact fix SHA, including both W03 isolated regressions.

| Mandatory criterion | Decision and evidence |
| --- | --- |
| 1. Zero unauthorized cross-tenant reads/writes in executed matrix | **PASS on fixed branch matrix.** 3,086 real token REST/HTTP checks, 57 active project SQL controls, 8,493 broad READ cases and 259 authority cases passed. Pre-fix memory violation is explicitly preserved and does not count as a passing case. |
| 2. Direct-object and API tests cover high-risk surfaces | **FAIL acceptance gate / coverage incomplete for the requested all-paths scope.** The enumerated twelve organization tables, personal workspace memory, 16 route files, real file/export cases, role switching, service-only RPC and dispatcher user-token rejection passed. Additional high-risk handlers such as AI chat/files, execution actions and privileged worker payload handling have not had the complete live foreign-object matrix. In total 85 route files and unlisted methods/parameters remain NOT_RUN, and 122 SQL relations lack positive fixtures. |
| 3. Failures have sanitized reproduction and passing regression | **PASS.** One reproduced memory reference authorization flaw, saved red HTTP artifact plus independent SQL post-state, minimal runtime guard and passing actual-handler/54-case live regression. Fixture/readiness/origin failures are separately recorded with successful later execution. |

The executed branch matrix passes, but **W03 overall remains NOT ACCEPTED and is not finished** because criterion 2 is incomplete. No full-paths or production launch acceptance is claimed. Remaining route coverage, full template/agent provisioning and published configuration/parity gaps above remain open; human review cannot turn NOT_RUN cases into verified results.

### Final evidence

- `W03-run26-evidence.json`: all 3,086 sanitized per-case records and provenance; artifact `13324096968`, digest `sha256:fe1dc8a0ddd57168bedae95beba0d1b9dc41a4791df0a05fb79233551ccf10ad`, independently matched to the downloaded ZIP.
- `W03-run22-evidence.json`: earlier 2,324-case core matrix, artifact `13322280106`, independently verified digest `sha256:fc3049ea6facacf8e2af7dde1ca8ea632faf9626fe6c826d766f3a0199920f0a`.
- `W03-run25-memory-reproduction.json`: failing actual HTTP reproduction and one inconsistent synthetic memory association before the fix; its ZIP digest was independently matched too.
- `W03-active-SQL-evidence.json`, `W03-all-org-read-evidence.json`, `W03-membership-boundary-evidence.json`: separately executed SQL evidence; scripts enforce cardinality and ROLLBACK.
- `W03-quarantine-evidence.json`: independent post-run SQL counters, including all 152 W03 identities banned. Audit parents and synthetic bytes retained; no customer data was read or deleted.
- `w03-api-coverage.json`: exact listed methods/parameters and honest NOT_RUN inventory.

| Final live coverage | Passing cases |
| --- | ---: |
| Twelve organization tables, foreign READ / INSERT / UPDATE / DELETE | 444 each |
| Workspace memory foreign project INSERT / unchanged association / foreign READ / foreign DELETE noop | 54 each |
| Workspace memory direct table READ / INSERT / UPDATE / DELETE permission denial | 54 each |
| Foreign direct-object HTTP | 481: 103 returned 404, 378 returned 403 |
| Own file upload / exact byte download | 3 each |
| Foreign file HTTP upload / Storage upload / byte download / signed URL | 37 each |
| Owner CSV / foreign sentinel exclusion / nonowner export denial | 3 / 6 / 16 |
| Service-only agent RPC / dispatcher rejects user JWT | 37 / 19 |
| Foreign organization switch / shared role binding + context | 37 / 4 |

Project creation negatives accept only RLS 42501 or P0001 with the exact ownership-authorization message; arbitrary database errors are not authorization evidence. Foreign private-memory DELETE returns 200 as an idempotent noop; privileged post-state checks prove the foreign row survives.

### Project-state restoration

Verified 2026-11-04 13:07:55 UTC. Provider state matches the start of this session; a read-only `SELECT 1` against AI Roadmap returned 1 after health became active.

| Project | Original | During W03 | Final |
| --- | --- | --- | --- |
| Production Rythm `dezbacyuvsdrlpmmpjht` | ACTIVE_HEALTHY | ACTIVE_HEALTHY | ACTIVE_HEALTHY |
| Staging `viqjdgohtxqkrdgwtull` | INACTIVE | ACTIVE_HEALTHY | INACTIVE |
| AI Roadmap `dqpdyschjpbdhhotmojs` | ACTIVE_HEALTHY | INACTIVE | ACTIVE_HEALTHY |

Evidence: `W03-restoration-2026-11-04.json`. Production domain deployment and main were rechecked unchanged. No merge, production deployment or production schema/RLS change occurred.

Human review checklist:

- [ ] Confirm W02 dependency sign-off; its historical test pass does not imply human acceptance.
- [ ] Inspect run/attempt, tested SHA, artifact digest and per-case failures; compare matrix to the launch threat model.
- [ ] Review positive controls, same-template A/B, shared-user role binding, denied CRUD and unchanged foreign sentinels.
- [ ] Review synthetic file bytes, signed URL denial and CSV foreign sentinel exclusion.
- [ ] Review strict active SQL cardinality and post-run banned/inactive/revoked/canceled counts.
- [ ] Verify remaining NOT_RUN paths and environment/parity gaps before claiming every route or authorizing launch.
- [ ] Confirm temporary project-state restoration.
- [ ] Explicitly sign off acceptance; separately authorize any merge or production deployment.

Rollback: revert runtime fix commit `2724e6c99a86fb026b212952665f071361d7bd88` on the feature branch or delete the unmerged branch; reverting the guard reintroduces the reproduced memory reference flaw, so do not promote that rollback as secure. No production migration rollback is needed. Preserve immutable staging audit history; quarantined users and inactive memberships must remain disabled. Restore original project capacity state after execution: staging inactive, AI Roadmap active/healthy, production active/healthy. No merge, production deployment, production schema/RLS migration, real messages or charges are authorized by this report.
