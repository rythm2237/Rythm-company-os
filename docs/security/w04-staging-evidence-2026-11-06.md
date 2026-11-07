# W04 staging execution evidence — 2026-11-06

## Environment / budget boundary

- Production unchanged: `rythm-os.com`, GitHub `main` `995888ae6f7077f70527bbc95f74efd584115955`, production Supabase ref `dezbacyuvsdrlpmmpjht` (**read-only inspection**).
- Test-only Supabase: `rythm-phase3-staging`, ref `viqjdgohtxqkrdgwtull`; initially INACTIVE, restored by temporarily pausing existing Free-tier `ai roadmap` (`dqpdyschjpbdhhotmojs`) without creating or purchasing services.
- **Important:** The reviewer must verify that staging has returned to INACTIVE and AI roadmap to ACTIVE_HEALTHY before sign-off; pause/restore are asynchronous.
- No third-party messages, mail, chargeable external APIs, real customer data or production migrations invoked.
- W02 fixture organizations A/B/C already existed and were quarantined (membership_status='inactive'); staged tests activated only synthetic rows in an explicit transaction and always issued ROLLBACK.

## Before and after

| Supabase Security Advisor category | Before | After two staging applications |
|---|---:|---:|
| `function_search_path_mutable` | 2 | 0 |
| `anon_security_definer_function_executable` | 8 | 7 (documented 2nya booking/contact exceptions) |
| `authenticated_security_definer_function_executable` | 52 | 51 |
| `rls_enabled_no_policy` | 33 | 33 (outside W04 scope; separately assess) |
| `auth_leaked_password_protection` | 1 | 1 (outside W04 scope) |

Actual staging migration ledger entries:
1. `20261106170735` `w04_rpc_security_definer_hardening` — **PASS**
2. `20261106171403` `w04_rpc_security_definer_idempotence_validation` — identical SQL reapplied, **PASS**.

The second application created a **staging-only** ledger record for repeatability evidence. Do not add the second version to production migration history.

## Performed tests (actual authorized staging SQL, not hypothetical)

| Executed query/script | Observed result | Limits |
|---|---|---|
| `pg_proc` inventory of 7 exact W04 function targets before apply | 7 present with expected signatures; 52 auth + 8 anon advisor warnings | Metadata check only |
| `scripts/w04-staging-catalog-assertions.sql` | PASS — both `proconfig` fixed; internal trigger no anon/auth EXECUTE; 7 public booking grants retained | Did not test valid booking paths |
| `scripts/w04-staging-negative-rpc.sql` | PASS — classifier remains deterministic under caller-controlled path; production approval nondelegatable; synthetic counter 100 -> 101 with `p_limit=1`, request denied | No production requests |
| `scripts/w04-staging-cross-tenant.sql` | PASS — synthetic A owner cannot execute B builder draft or search B knowledge; inactive B member denied active-entitlement lookup | Requires W02 A/B fixture; contains one-by-one subset only |
| `scripts/w04-staging-sensitive-knowledge.sql` | PASS — A ordinary member sees `internal` only; A owner sees `internal` and `confidential` in synthetic Agent's search | Other nested RPCs remain untested |
| `scripts/w04-staging-public-booking-negatives.sql` | PASS — anonymous invalid UUID/token cannot read, cancel, or subscribe for booking | **Valid and expired real booking token positive/negative scenarios NOT RUN**; creating appointments could fire push triggers |
| Post-test SELECT of fixed synthetic UUIDs and fixture membership status | PASS — zero synthetic Agent/knowledge/draft/rate-limit leftovers, zero active W02 fixture memberships | Only exact test IDs covered |
| Security Advisor after apply and reapply | PASS — 0 search-path warnings and public-only approved technical surface retained | Live staging only; production remains on historical baseline |

The first two attempts to apply the staging migration failed with SQL syntax errors due to an incorrectly escaped regex and a duplicated SQL segment generated during text replacement. Both failed atomically; inspection showed the two approval helper `proconfig` values remained NULL. The source migration was corrected and then applied **twice successfully**. The offline checker now requires the complete anchored regex and exactly one transaction `commit;`.

Earlier `scripts/w04-staging-cross-tenant.sql` runs failed due to intentionally deactivated W02 actor memberships and a JWT claim persisting within the transaction after `RESET ROLE`. The test was corrected to activate only synthetic memberships transactionally, clear the JWT claim before postgres-only fixture setup, and succeeded on rerun. The stage did not retain synthetic changes.

## Residual acceptance blockers

- The per-RPC register lists all 52 reachable definer RPCs; **not all 52** received live negative caller/tenant tests. There is no proof yet of universal absence of unauthorized execution.
- The seven `anon` booking/contact entrypoints are deliberate *technical* exceptions; **owner approval** remains outstanding.
- The amended `nail_2nya_subscribe_customer_push` expiry predicate is present in deployed staging source but **valid vs expired synthetic booking token** live tests are outstanding because appointment INSERT triggers could dispatch an external push.
- W01 and W02 full acceptance records and schema/migration drift reconciliation are not completely verified by this W04 run.
- `get_flags` on Vercel returned 403; published feature flags could not be inspected.
- Production Security Advisor will still report its historical warnings because **no production deploy/migration was authorized or performed**.
- Final GitHub CI must pass at the latest branch head, not merely the prior green commit.

## Rollback and release

Staging test transactions self-reverted. W04 security migration modifies only function definitions/config/grants; no table rows are rewritten by the migration itself. For a staging-specific rollback, use pre-W04 `pg_get_functiondef` snapshots and restore both search_path settings, trigger grants and the previous four function bodies under an approved change plan; note that restoring unsafe rate limit, knowledge, entitlement and booking-token behavior reopens documented defects. Preferred rollback is a forward corrective migration, not reopening PUBLIC execution.

**Not approved for production, not merged, not release accepted.** Owner sign-off checklist: review all 52 RPCs; approve public booking exceptions; complete full negative-caller/tenant matrix and valid/expired public booking token tests; verify staging infrastructure restored; review green latest CI; authorize production separately.

## Subsequent W04 validation — complete runtime coverage vectors (2026-11-06)

This section **supersedes** the earlier first-run note that valid/expired public booking tests were not executed, and narrows the earlier scope limitation regarding the 52 original routines.

**Second migration:** `20261106180000_w04_explicit_pg_temp_for_definers.sql` applied on staging successfully as version `20261106180314`, and reapplied successfully under verification version `20261106180432`. Only the originally reviewed **52** functions were targeted: append `pg_temp` LAST without rearranging existing trusted namespaces, or use `pg_catalog, pg_temp` for formerly empty search paths. Catalogue inspection confirmed 51/51 authenticated-executable definer paths, 7/7 anonymous-executable paths, and the internal trigger path have `pg_temp` last; the revoked direct execute grant remains revoked. The two pure INVOKER approval helpers also remain pinned.

**Full additional staging suite, rerun after this migration:**
- `w04-staging-catalog-assertions.sql` — PASS;
- `w04-staging-negative-rpc.sql` — PASS;
- `w04-staging-cross-tenant.sql` — PASS;
- `w04-staging-sensitive-knowledge.sql` — PASS, including authenticated ordinary member, owner, and trusted service_role;
- `w04-staging-public-booking-negatives.sql` — PASS;
- `w04-staging-booking-token-lifecycle.sql` — PASS, valid/expired/incorrect/cross-appointment tokens under public `anon`;
- `w04-staging-52-rpc-outsider-matrix.sql` — PASS, **51/51** callable routines invoked (37 rejection exceptions, 14 negative/limited/public results);
- `w04-staging-29-rpc-cross-tenant-matrix.sql` — PASS, **29/29** functions with first-org/Agent arguments invoked by A owner against existing synthetic B Agent/org (28 rejections, one false entitlement; no mutation);
- `w04-staging-public-booking-e2e.sql` — PASS, all **7** anonymous booking/contact operations through an actual disposable synthetic service, date, slot, booking, customer, push subscription and contact message. Valid token get/push/cancel worked; wrong and expired tokens rejected on privileged operations.

All test-only INSERT/UPDATE changes were reverted via `ROLLBACK` and outward notification triggers were suppressed in those scripts using `SET LOCAL session_replication_role=replica`. Post-suite inspection found **zero** synthetic bookings, services, profiles, hours, contacts, push subscriptions, Agents, and zero active W02 fixture memberships. No production or customer mutations occurred.

The Security Advisor still reports `anon_security_definer_function_executable: 7` and `authenticated_security_definer_function_executable: 51` by design; these count **function exposure**, not confirmed vulnerabilities. No mutable-search-path warnings remain. Outside W04 scope: 33 INFO rows for RLS-enabled tables without policies and 1 authentication password-leak protection warning.

**Detailed 52-row evidence matrix:** `docs/security/w04-rpc-runtime-coverage-2026-11-06.md`. This documents the exact covered caller/input vectors without claiming every imaginable negative case.

**Still requires owner action before release:** explicit acceptance of seven justified public booking/contact exceptions; reconciliation of W01/W02 acceptance and staging/production migration histories; separate approval to merge/deploy/apply production schema. W04 technical staged vectors PASS, but **W04 official launch status remains NOT ACCEPTED** pending those gates. GitHub CI for the latest branch head and project restore status must be confirmed after the last documentation/checker commits.

## 2026-11-07 — subsequent owner exception decision

**Owner-approved:** the exact seven intentionally anonymous booking/contact `nail_2nya_*` RPCs listed in `docs/security/w04-public-rpc-owner-exception-approval-2026-11-07.md`. The owner's confirmation is **not** approval to merge or release to Production. Previous text in this report saying that these seven public exceptions are awaiting owner decision described the state **before 2026-11-07** and is superseded for this gate only.

The release preflight and W01/W02 evidence reconciliation are tracked in `docs/security/w04-dependency-release-gates-2026-11-07.md`: W01 owner-accepted **snapshot scope** and W02's documented stage AC1/AC2/updated-quarantine AC3 results are supported; **exact migration-history parity is still unverified**. PR #441 remains draft; no production migration, deploy or main-branch merge is authorized.
