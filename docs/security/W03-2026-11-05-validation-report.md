# W03 — tenant isolation implementation and verification

Status: **PASS for the executed mandatory high-risk matrix; ready for human review.** Full-inventory and production security are not certified. No automatic owner acceptance, merge or production approval.

This report supersedes the narrower 2026-11-04 execution summary. It distinguishes authenticated HTTP/REST/Storage, SQL RLS, isolated actual handlers and unexecuted surfaces. Counts are executed cases, not a claim that every possible route/input combination is secure.

## Resolved baseline

- Repository: `rythm2237/Rythm-company-os`; actual main and published production commit: `995888ae6f7077f70527bbc95f74efd584115955`, rechecked on 2026-11-05. Historical audit commit `8ba2f605f9fc926ab5428284f125589540a16ff0` was not assumed live.
- Production alias `rythm-os.com` resolves to READY deployment `dpl_GqWEucPScpnLAhyc1BFsv1VBDSLR`. Production Supabase remains `dezbacyuvsdrlpmmpjht`; no customer data, schema, RLS, deployment or release was modified.
- Public production `/api/health` at `2026-11-05T20:14:34.898Z`: status `ok`, agent execution **enabled**, external actions **disabled**. Vercel management flag inventory still returns 403; no credential extraction or alternate identity was used. The two effective public runtime switches are evidenced separately in `W03-production-baseline-2026-11-05.json`.
- Staging is exclusively `viqjdgohtxqkrdgwtull`. W01 restored public schemas and migration registry did not include global policy/provider/agent-level reference seeds or Storage policies/buckets. Fixture restoration is explicitly staging-only and copied from existing repository migrations.
- Branch: `test/w03-tenant-isolation-evidence`; draft PR [440](https://github.com/rythm2237/Rythm-company-os/pull/440). Tested application commit for the final supplemental run: `e61f0dc4432c3b2a7e917d35788de7aff61aab8b`.

## Confirmed violations and changes

| Boundary | Reproduction | Fix and code reference |
|---|---|---|
| Personal workspace memory/project | Authenticated A owner POST with B's personal project returned 201; independent SQL found the invalid relation | `app/api/ai-workspace/resources/[kind]/route.ts:11`: validate project in the caller's workspace and reject archived/missing/failed lookups before privileged INSERT; runtime commit `2724e6c99a86fb026b212952665f071361d7bd88` |
| Privileged project worker | Six controlled foreign-project claim payloads read real staging B/C context and reached the intercepted provider boundary | `lib/projects/project-work-v2.ts:20`: validate project/execution/agent/action relationships before context reads, scope context and mutations by organization, reject boundary failures without evaluating the foreign project; runtime commit `24c69b33e30465ceae445209b6e94a7c8b030fd3` |
| Execution proposal context | Actual authenticated POST persisted a denied A execution with a B project reference | `lib/integrations/execution-gateway.ts:262`: resolve every optional project/meeting/session/agent reference in the caller's organization before even recording a denied proposal; same runtime commit |
| Project child relationships | Actual authenticated REST accepted six decision-memory and six task rows with own organization and a foreign project; rollback-only SQL also accepted foreign action/agent parents | `supabase/migrations/20261104190228_w03_project_tenant_relationships.sql:4`: six composite tenant foreign keys, including task execution/project consistency |
| Agent memory and attachment relationships | Rollback-only authenticated SQL accepted A memory/B agent, A attachment/B agent and A memory/B attachment | `supabase/migrations/20261104192628_w03_agent_memory_attachment_tenant_relations.sql:4`: three composite tenant foreign keys; nullable source deletion preserves organization |

The two proposed production migration files use `NOT VALID` to enforce new writes without silently repairing historical customer data. All **nine** constraints were independently validated on staging after synthetic-only repair. Production preflight/validation remains a separate owner-authorized release action.

The staging-only repair retained audit parents: six synthetic memories and six synthetic tasks were rebound to their own project, and three denied synthetic execution references were cleared. Original invalid IDs are preserved in `W03-run28-independent-poststate.json`. Membership activation needed for trigger consistency existed only inside one transaction and was restored to inactive before commit; banned Auth users were never unbanned.

## Exact executions and evidence

| Execution | Result and scope |
|---|---|
| `node scripts/fixtures/w03-staging.mjs setup` | Fresh 19 real password-authenticated identities, 20 memberships, three synthetic organizations: A/B same advertising template, C software; six personas per organization plus shared executive/operator |
| `node scripts/fixtures/w03-live.mjs` — run [41896185001](https://github.com/rythm2237/Rythm-company-os/actions/runs/41896185001), commit `db83b800e88f85b9f9e581dadd5e9e829ba4bc98` | Core's 3,086 cases passed. Combined result 4,480 pass / 13 failed records; 12 failures were overly narrow invoice error expectations, one was the aggregate assertion. Job reached its 35-minute limit; quarantine and artifact upload completed. This is **not** recorded as a successful run |
| `node scripts/fixtures/w03-live.mjs --extended-only` — run [42100571332](https://github.com/rythm2237/Rythm-company-os/actions/runs/42100571332), commit `e61f0dc4432c3b2a7e917d35788de7aff61aab8b` | **PASS: 2,583 / 0 failures**, phase `finished`, job and quarantine successful; includes strict invoice rejection message and new native agent-memory/file/logo/ledger tests. Artifact `13450700925`, ZIP SHA-256 `6cda07f5c9d379e71c842198cab5f5ec97ed2ca91a4fd9428923173c7c824687`, independently verified after download |
| Execute `scripts/w03-active-sql-matrix.sql`, replacing old namespace with `42100571332-1` | PASS: 57; 37 foreign pairs see zero projects, 20 legitimate memberships see one |
| Execute `scripts/w03-membership-boundary.sql`, same substitution | PASS: 259 negative root organization, membership and finance-grant mutations; zero affected rows |
| Execute `scripts/w03-all-org-read-matrix.sql`, same substitution | PASS for executed reads: 8,493 cases / 149 relations / 5,513 foreign cases / zero foreign rows; 39 relations have positive fixtures. Empty relations are not certified merely because zero rows were returned |
| Execute `scripts/w03-finance-transaction-matrix.sql`, substitute `__W03_RUN__` with `42100571332-1` | PASS: 168 cases, including 37 each foreign READ/INSERT/UPDATE/DELETE and 20 role-sensitive own reads; zero-value void ledger fixtures; ROLLBACK |
| Execute `scripts/w03-agent-memory-matrix.sql`, same substitution | PASS: 372; 37 each foreign CRUD per memory/attachment table, 20 own reads per table, 36 foreign-parent INSERT/UPDATE denials; metadata-only attachment fixtures; ROLLBACK |
| Execute `scripts/w03-cross-parent-boundary.sql`, same substitution | PASS: 60; 54 foreign-parent denials and six authorized controls; ROLLBACK |
| `node scripts/validate-w03-worker.mjs` | PASS: actual worker, three own controls and six denied foreign project payloads; local read adapter; provider and writes intercepted. The live harness additionally tests agent/action/execution substitutions against real staging reads |
| `node scripts/validate-w03-execution-references.mjs` | PASS: actual execution gateway; four foreign references denied before registry/ledger, four own controls, inconsistent context and failed lookup controls |
| `node scripts/validate-w03-project-relationships.mjs` | PASS: actual migration SQL in Postgres/PGlite; 18 INSERT/UPDATE denials; authorized parents, SET NULL and cascade behavior verified |
| `npm run typecheck` | PASS locally after runtime changes |
| `npm run lint` | PASS locally; zero errors, 28 existing warnings |
| `npm run build` | PASS locally; 111 static pages; prebuild regressions and 11 postbuild lifecycle scenarios passed |
| Full CI [42100193770](https://github.com/rythm2237/Rythm-company-os/actions/runs/42100193770) on `e61f0dc` | PASS, including build/typecheck/lint, CRM browser regression and all added W03 regressions |
| `git diff --check` | PASS |

Raw sanitized SQL results are in `W03-run30-sql-evidence.json`. Full case artifacts and SHA-256 bindings are retained with the respective run evidence. All six SQL suites roll back; their totals are not added to HTTP counts as though they were independent HTTP requests.

## Failure triage

- Run 27: own private AI file upload returned 503 because the W01 restore lacked `ai-workspace-private`. Restore the existing migration's private bucket; no permissive authenticated policy was added to this bucket.
- Run 28: 972 passing / 76 failed records. Exactly 21 confirmed boundary failures: six worker, six decision-memory, six task and three persisted execution-parent cases. Fifty-four chat checks used unauthorized mode `auto` on accounts allowing only `fast`; the existing 403 was correct. One aggregate failure record. Preserve the original artifact rather than relabeling it green.
- Run 29: invoice INSERT/UPDATE correctly rejected foreign customers with P0001 `Customer unavailable`, before the composite FK. Verify the actual trigger definition and preserve the row poststate; accept only this exact authorization-related message or 23503. No invoice runtime/security code was changed.
- The new cross-parent SQL suite initially had an ambiguous PL/pgSQL variable/column in its final aggregate assertion. Qualify `pc.denied`, rerun all suites and preserve the passing results. No runtime/schema change resulted from this harness defect.
- An initial rollback-only agent probe could not create its fixture because the restored database lacked the canonical `associate` level row. Insert the existing migration's reference row inside the rollback-only probe; no agent provisioning/authority gate was disabled.
- A same-second staging migration registry version collision rolled back a validation-only attempt. The subsequent attempt succeeded and all nine constraint states were checked. No production operation occurred.

## Scope and safety limits

- Real Auth tokens never leave the protected runner; service keys are never placed in code, evidence, browser, report or client bundles. No billable model/provider call, real message, payment, real customer data access or global queue dispatch occurred.
- Core/supplemental HTTP runs exercise actual local Next handlers against staging Auth/PostgREST/Storage. They are not a claim of published Vercel preview parity.
- Governed meeting POST tests use actual handler code and real staging Auth/RLS with an in-memory zero-budget entitlement/runtime adapter. Own requests reach the existing CEO/state guards; foreign requests are denied before the intercepted provider. The database entitlement and CEO closure/approval state are never promoted.
- Worker tests control the claim payload and intercept all writes/provider calls; they do not claim jobs from the global queue. Only context reads hit the real staging database.
- Coverage is per listed method/parameter; the full 101-file API inventory contains public, disabled, provider-signed and other unexecuted paths. Do not infer an all-input/all-route or production security certification from this matrix.
- Published preview/staging-binding parity and Vercel management flag inventory remain unverified. W02 fixture/environment capability was reused; no owner release acceptance is inferred.
- Supabase security advisors still report existing items: 33 no-policy information findings; warnings for two mutable search paths, eight anon-executable and 52 authenticated-executable definer functions, and leaked-password protection. These findings are not silently declared remediated by this PR.

## Acceptance, restoration and rollback

| Acceptance criterion | Result | Evidence / limit |
|---|---|---|
| 1. Zero unauthorized cross-tenant reads/writes in the executed matrix | **PASS** | Core 3,086 passing cases and supplemental 2,583 passing cases; all SQL suites pass; do not add overlapping controls as unique cases |
| 2. Direct-object and API tests cover high-risk surfaces | **PASS for the enumerated mandatory surfaces** | Real-token HTTP/REST and controlled files/exports cover CRM, contracts, projects/tasks, finance, notifications, private memory/files, execution proposals, meetings, role switching, worker context and privileged RPC boundaries. Exact route/method coverage is in `w03-api-coverage.json`; this is not a full 101-route certification |
| 3. Every confirmed failure has sanitized reproduction and passing regression | **PASS** | Original run 25/28 artifacts and independent SQL probes; run 26/29 core plus run 30 fixed regressions; actual migration and handler regressions in CI |

Owner scope/release review remains pending. No merge or production deployment is authorized by this report.

Independent quarantine: 19/19 fresh users banned, 20/20 memberships inactive, zero active grants, three canceled projects; 228/228 historical W03 users banned and zero active W03 memberships. Replay cost is zero; all nine staging tenant constraints are validated.

Restoration **verified**: production ACTIVE_HEALTHY; staging INACTIVE; `ai roadmap` (`dqpdyschjpbdhhotmojs`) ACTIVE_HEALTHY and `SELECT 1 AS health` returned 1. Fresh and historical fixture quarantine was independently verified before pausing staging. Exact evidence: `W03-restoration-2026-11-05.json`.

Rollback: before release, leave main/production unchanged and close/revert the feature PR if rejected. If an owner later approves a production release, rollback requires reverting its application commit and a separately reviewed database rollback: drop dependent nine W03 foreign keys first, then their five composite unique constraints only if unreferenced. This removes security protection and was not executed. Do not delete customer or audit rows to force rollback. Staging fixes and quarantined synthetic audit history may remain while the project is paused.

Human sign-off checklist:

- [ ] Review reproductions and passing evidence for each confirmed violation.
- [ ] Confirm the executed matrix and explicitly assess remaining API/provider/preview scope; no blanket full-inventory claim.
- [ ] Review `NOT VALID`, historical-data preflight, parent deletion semantics, lock impact and staged/production migration differences.
- [ ] Confirm W02/release dependencies and staging-only environment binding.
- [ ] Check final quarantine and original project-state restoration.
- [ ] Give separate explicit approval before merge, production schema/RLS changes, migration or deployment.
