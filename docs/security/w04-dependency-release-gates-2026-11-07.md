# W04 — verified upstream dependencies, release readiness and approval boundaries

**Review date:** 2026-11-07, Europe/Budapest. **Source:** connected GitHub PRs/QA artifacts and production-only read-only Supabase migration ledger. This is a **release readiness check**, not a production release authorization.

## W04 current status

| Gate | Decision | Verifiable source / limitation |
|---|---|---|
| W04 migration logic and exact 52-target catalog proof | **PASS IN STAGING** | `docs/security/w04-staging-evidence-2026-11-06.md` and `w04-rpc-runtime-coverage-2026-11-06.md`; 2 SQL migrations applied/reapplied successfully |
| W04 synthetic outsider/foreign-tenant access matrix | **PASS FOR EXECUTED SCENARIOS** | All 51 callable definer functions outsider-tested; all 29 first-org/Agent functions foreign-tenant-tested; not an exhaustive mathematical security proof |
| W04 seven public booking/contact positive/negative E2E tests | **PASS IN STAGING** | `scripts/w04-staging-public-booking-e2e.sql` and token lifecycle regression |
| Owner's approval of exact seven public `nail_2nya_*` exceptions | **APPROVED 2026-11-07** | Explicit owner answer in W04 conversation, captured in `w04-public-rpc-owner-exception-approval-2026-11-07.md` |
| W01 dependency, **accepted scope** | **ACCEPTED_SNAPSHOT_BASELINE** | PR #439 review and `docs/qa/W01_CLOSEOUT_REVIEW_20261028.json`; owner approved 2026-10-28, baseline 1000/1000 checks, real browser and backend PASS, cleanup confirmed |
| W01 exact Production catalog/migration history equivalence | **OPEN, EXCLUDED from W01 snapshot acceptance** | `docs/qa/W01_HISTORY_RECONCILIATION_FOLLOWUP.md`; no fake parity or rewritten ledger. This requires reconciliation before any claim of deployable schema parity |
| W02 actual three-tenant staging security and finance matrix | **PASS FOR DOCUMENTED SCENARIOS** | PR #438 and `docs/qa/W02-ISOLATED-THREE-TENANT-FIXTURES.md`; 3 organizations, 19 synthetic users, 20 memberships, 37 forbidden actor/tenant pairs, successful live workflow #41221322661 |
| W02 cleanup under **revised audit-preserving quarantine** | **PASS PER W02 EVIDENCE; follow-on repeatability not proved** | All 19 synthetic Auth users banned, zero active fixture membership/grant, three projects cancelled; immutable audit parent rows retained. NOT physical deletion; no second fresh-identity cycle evidenced. PR #438 remains draft and unmerged; don't infer owner acceptance of any broader W02 release |
| W03 tenant isolation prereq | **STAGING EVIDENCE PASS; DRAFT PR** | PR #440 documents successful real-token, API, RLS, SQL sweep and cleanup; still awaits separate human release review |
| Production migration-history/schema parity with staging | **NOT VERIFIED, RELEASE BLOCKER** | Production ledger read-only: **203** applied migration records. W04 staging previous verified ledger: **19** records including four W04/verification-only versions, and staging is now INACTIVE; `W01_HISTORY_RECONCILIATION_FOLLOWUP.md` tracks divergence. Matching 52 expected function signatures is not full schema-history parity |
| Latest W04 CI at last fully tested head | **SUCCESS** | Run #42267815475 on `a4b6326f965a9b18761095ac9e1adab5a15950d6`; any later documentation commit must be checked independently |
| Production migration / merge / deploy | **NOT AUTHORIZED** | Owner approved only the exact seven anonymous RPC exceptions. PR #441 must remain draft; no production DDL, billing or rollout |

## Preflight observations (without production changes)

- Production Supabase `dezbacyuvsdrlpmmpjht` current migration ledger has 203 records; latest migration is `20261023125317_crm_connected_records`.
- Production read-only catalog preflight confirmed **52/52** target signatures exist, all are `SECURITY DEFINER`, owned by `postgres`, and have explicit `search_path` configurations. It does **not** prove deployment equivalence or runtime safety of the future migration.
- `main` commit at time of W04 test `995888ae6f7077f70527bbc95f74efd584115955`; production remained untouched.
- W01's acceptance explicitly separates immutable schema-only snapshot and tested RLS deltas from exact historical migration parity. Do not silently turn that exclusion into an approval.
- W02's audit-preserving quarantine meets the documented revised AC3 after its live run, but its PR body contains stale pre-run language. Use the date-stamped latest QA appendix, not only the earlier PR summary.

## Precise disposition

**W04 security implementation & staged acceptance criteria:** PASS for the enumerated, repeatable tested vectors. **W04 owner-approved public exceptions:** PASS. **W04 production/release status:** **NOT ACCEPTED FOR DEPLOYMENT** because migration-history equivalence is unverified, upstream PRs are draft, and separate explicit authorization is required.

The remaining actions are to reconcile deployment-baseline differences without forging history or touching production, obtain release-specific review/authorization, then (only if separately approved) prepare and execute an ordered deployment plan with backup/preflight/rollback. No automatic merge or production migration is implied.
