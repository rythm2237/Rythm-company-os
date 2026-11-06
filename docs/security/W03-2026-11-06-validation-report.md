# W03 — tenant isolation execution, 2026-11-06

Status: **PASS for all three mandatory acceptance criteria in the executed matrix; ready for human review.** This is branch evidence, not owner acceptance or a production release. The November 5 report remains the detailed record for the earlier fixes and regression suites.

## Verified baseline

- Repository `rythm2237/Rythm-company-os`, branch `test/w03-tenant-isolation-evidence`, draft PR [440](https://github.com/rythm2237/Rythm-company-os/pull/440).
- Actual main and published production SHA: `995888ae6f7077f70527bbc95f74efd584115955`; READY production deployment `dpl_GqWEucPScpnLAhyc1BFsv1VBDSLR`, alias `rythm-os.com`. Rechecked through GitHub and Vercel on November 6; historical audit SHA was not assumed live.
- Production Supabase `dezbacyuvsdrlpmmpjht`, latest migration `20261023125317 crm_connected_records`. Read-only migration metadata only; no customer records were queried.
- Public production health at `2026-11-06T07:46:02.818Z`: status `ok`, agent execution enabled, external actions disabled. Management flag inventory was previously denied 403 and was not bypassed. See `W03-production-baseline-2026-11-06.json`.
- Tests bind exclusively to staging `viqjdgohtxqkrdgwtull`. Original states: staging INACTIVE, AI Roadmap `dqpdyschjpbdhhotmojs` ACTIVE_HEALTHY. The owner authorized a temporary capacity swap and restoration; final original-state restoration is verified below.

## Additional confirmed violation and fix

`POST /api/agents/GTM-STRAT-001/benchmark` accepted an attacker-controlled `runId`. Its catch handler used a service client to mark that batch failed using only its ID, even after authentication failed. The real handler, compiled with synthetic identity/persistence adapters, changed a tenant B batch from `running` to `failed` for an anonymous request. No production mutation was attempted.

Runtime fix `d698a981bfc0399fe19a3afb6b7035310ffab56e`:

- `app/api/agents/[code]/benchmark/route.ts:156`: capture the organization only after active-owner and agent authorization succeeds, for both finalize and scenario paths.
- `app/api/agents/[code]/benchmark/route.ts:109`: reuse that authorized context during finalization.
- `app/api/agents/[code]/benchmark/route.ts:305`: skip privileged error bookkeeping without authorized context; bind any error update to both batch ID and the authorized organization.
- `scripts/validate-w03-benchmark-boundary.mjs`: anonymous and authorized-other-company mutations denied; an authorized own-company failure still persists; provider boundary never reached.
- Live run 31 independently verifies 60 actual HTTP/no-mutation cases plus three final batch sentinels using anonymous requests and 19 real identities.

Sanitized reproduction and green evidence: `W03-benchmark-error-reproduction.json`, `W03-run31-route-evidence.json`. Earlier workspace memory, worker context, execution reference and nine composite-FK changes remain in the branch; see the November 5 report and its exact code references. No production migration or schema change was applied.

## Executed evidence

| Command or run | Result | Scope |
|---|---|---|
| `node scripts/fixtures/w03-live.mjs` core matrix; run 26, and core portion of run 29 | 3,086 core cases passed | Actual tokens, HTTP, REST, Storage, exports, CRM, finance, projects/tasks, notifications, personal memory and role switching; run 29 overall was not green |
| `node scripts/fixtures/w03-live.mjs --extended-only`; run 30 `42100571332` | 2,583 passed, zero failures | Real Auth/RLS, controlled files and exports, extended routes, native agent metadata/Storage; includes explicitly adapted worker and governed-meeting handlers |
| `node scripts/fixtures/w03-live.mjs --routes-only`; run 31 `42180458687`, SHA `d698a98` | 981 passed, zero failures | 46 additional API files; benchmark poststate, SaaS tokens denied 2nya administration, platform/cron checks, OAuth state/entitlement denials, inbound signatures, disabled billing, guest and avatar boundaries |
| `node scripts/fixtures/w03-live.mjs --public-only`; run 39 `42185764245`, SHA `61e46d6` | 182 passed, zero failures | 26 additional API files; 43 CRM opportunity stage cases, 62 outbound email cases, existing-member invitations, session-bound public intake, public contracts, middleware and disabled-runtime checks |
| `node scripts/fixtures/w03-live.mjs --oauth-only`; run 40 `42186490762`, SHA `c31a865` | 1,782 passed, zero failures (1,680 OAuth + 60 runtime + 42 setup controls) | Real identities and caller RLS with in-memory entitlement/runtime adapters, intercepted provider exchange; no actual provider authorization or spend |
| `node scripts/validate-w03-oauth-boundary.mjs` | 196 isolated actual-handler cases passed | 14 connect/callback pairs, real signing/cookies, foreign integration, same-user company changes, user/role/entitlement changes, tampering, missing cookies and expiry; synthetic DB/auth in this standalone mode |
| `node scripts/validate-w03-benchmark-boundary.mjs` | Passed; pre-fix execution failed as expected | Actual vulnerable/fixed route, synthetic auth/DB, own failure control |
| `node scripts/validate-w03-egress-guard.mjs` | Passed | Localhost succeeds; production Supabase, model API and email provider fail before I/O |
| SQL active/project and membership suites on run 33, rollback-only | 57 positive/negative project cases; 259 negative authority mutations passed | Foreign READ zero rows; membership INSERT/UPDATE/DELETE, organization UPDATE/DELETE and finance grant INSERT affected zero rows |
| SQL `w03-all-org-read-matrix.sql` on run 33, rollback-only | 8,493 cases on 149 relations; 5,513 foreign cases, zero foreign rows | Empty relations are explicitly not positive-control proof; this sweep complements the populated run 30 evidence |
| Earlier six staging SQL suites, including finance, agent memory and cross-parent mutations | Passed | Raw results retained in `W03-run30-sql-evidence.json`; nine composite tenant constraints validated in staging |
| Vault write RPC permission metadata | `anon=false`, `authenticated=false`, `service_role=true` | No secret value read or written; see `W03-vault-rpc-acl-2026-11-06.json` |
| `npm run typecheck` | Exit 0 | Local, current branch |
| `npm run lint` | Exit 0, 28 existing warnings, zero errors | No new warning introduced |
| `npm run build` | Exit 0, 111 pages; 11 postbuild lifecycle regressions passed | Local build after runtime fix; log `/tmp/w03-nov6-build.log` |
| Full CI `42185940981` on `c31a865` | PASS | Typecheck, lint, build and repository regression checks, including new W03 handler and egress tests |

Wave counts include repeated positive setup controls; they are not a deduplicated total. All artifacts are sanitized and include original run/commit IDs and archive digests. HTTP is a real local Next server against staging, not a published-preview or production-parity assertion.

## Coverage interpretation and safeguards

All 101 API route files have at least one executed HTTP contract or authorization case: 29 earlier, 46 in run 31, 26 in run 39. This is an inventory accounting statement, not exhaustive coverage of every method, parameter or state. `w03-api-coverage.json` records the exact depth. OAuth callbacks exercised over HTTP with invalid state are distinguished from the real-Auth/RLS adapted-handler wave with signed state. Public routes and disabled capabilities are distinguished from tenant authorization tests.

Each fresh wave uses 19 independently authenticated synthetic identities and 20 memberships across three companies. A/B share an advertising template; C uses the software-company template. Personas cover owner, executive/admin, project manager/operator, member/operator, finance restricted, finance authorized, and one shared user with executive role in A and operator role in B. Database entitlements remain pending. Active zero-budget entitlement objects used by adapted handlers exist only in memory; no CEO gate or production entitlement was promoted.

The server egress guard allows only localhost and the exact staging Supabase host. Run 39 proves that two public media checks, the public production push-key read, and the Next package-version check were blocked before I/O. Synthetic email fixtures remain unapproved drafts in inactive draft-only mailboxes; their poststate remains unsent. Existing-member invitation tests target already existing synthetic Auth users, preflight the same directory page used by the handler, preserve their operator membership, and disable the synthetic company-wallet access afterward. No invitation email, provider purchase, charge, model call, production dispatch or customer mutation was executed.

## Test infrastructure failures retained

These are not reclassified as successful jobs or application isolation violations:

- Run 32: 42 setup controls, then `P0001` when a service client attempted to insert a cancelled agent run. Fixed the fixture to use owner-authenticated blocked runs with human approval required and budget zero.
- Run 34: 42 controls, then `P0001` when a service client attempted to set runtime policy. Fixed the fixture to preserve the authenticated owner/updater. Execution remains disabled.
- Run 33: 175 controls passed, then the test expected environment-policy 503 from an anonymous meeting request; middleware correctly requires authentication first. Run 39 separates anonymous 401 from owner environment-policy 503 and passes both.
- Runs 35 and 37: 181 controls passed; an overly exact egress assertion rejected the correctly blocked media host and/or the additional correctly blocked Next version check. Run 39 records the blocked hosts and passes the meaningful safety checks.
- Run 36: 104 controls passed, then a direct RLS adapter queried a nonowner membership before selecting its active company. The login fixture now selects each identity's actual home organization through the real authorized RPC. A rollback-only SQL probe verified the membership becomes visible afterward.
- Run 38: 240 controls passed, then the shared identity was still in B when the next provider expected its A home context. The fixture restores A after every explicitly tested A/B role-switch cycle. Run 40 passes the complete cycle for all 14 providers.

Original sanitized artifacts are retained; no failure was fixed by broadening database privileges, bypassing RLS, activating entitlement, weakening the network guard or changing a production policy.

## Acceptance and release review

| Mandatory acceptance criterion | Current result |
|---|---|
| 1. Zero unauthorized cross-tenant reads/writes in executed matrix | **PASS** — zero unauthorized cross-tenant rows or mutations in the final executed matrix; all confirmed branch violations regressed |
| 2. Direct-object and API tests cover high-risk surfaces | **PASS** — direct-object and API checks cover the mandatory high-risk surfaces; all 101 HTTP files accounted with explicit depth |
| 3. Every confirmed violation has sanitized reproduction and passing regression | **PASS** — sanitized reproductions and passing regressions retained for the benchmark and earlier confirmed violations |

Independent final quarantine: **418/418 historical W03 identities banned**, zero active synthetic memberships, grants, integrations, agents or company-wallet access; zero stored fixture Vault credentials; zero uncancelled fixture projects or claimable runs; runtime cost **0.000000 USD**. All nine staging tenant foreign keys are validated. The final three entitlements remain pending. Exact proof: `W03-quarantine-2026-11-06.json`.

Original project states restored and verified: production ACTIVE_HEALTHY, staging INACTIVE, AI Roadmap ACTIVE_HEALTHY; `SELECT 1 AS restored_health` returned 1 on AI Roadmap. Exact proof: `W03-restoration-2026-11-06.json`. Main, production schema/RLS and published deployment are unchanged. W02 fixture infrastructure was used and tested; owner acceptance of W02 and production release remains an explicit review item, not an assumption.

Remaining verification limits: Vercel management flag inventory permission is unavailable (effective public runtime switches were verified); real external-provider authorization/delivery, published-preview parity, all unlisted input/method combinations and positive controls for empty relations were not executed. These are not marked verified. No remaining access or implementation blocker prevents review of the mandatory executed matrix. Production still contains the pre-PR code until the owner separately approves a release.

Rollback before release: main and production are unchanged; reject or revert the feature PR. Do not revert only the security fix into a deployed branch without owner review. If a later production release is separately approved, application rollback is a revert of that release commit; schema rollback requires dropping the nine dependent W03 foreign keys before their five supporting composite unique constraints, only after dependency review. This removes tenant protections and has not been executed. Do not delete historical or customer rows to force rollback.

Human sign-off checklist:

- [ ] Review the additional benchmark error-path fix and sanitized reproduction.
- [ ] Review each coverage classification and the full final OAuth artifact; do not treat disabled/public/empty relations as positive tenant controls.
- [ ] Confirm nine staging constraints, original-state restoration and zero active synthetic identities/grants/connections.
- [ ] Confirm W02 release dependency acceptance and the effective production flag configuration.
- [ ] Preflight historical production rows before approving or validating any `NOT VALID` migration.
- [ ] Give separate explicit approval for merge, production deployment and production migration. No such approval is claimed by this report.
