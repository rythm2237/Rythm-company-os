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
