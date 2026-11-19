# W01 migration provenance — updated 2026-10-26

**W01 NOT ACCEPTED. Historical replay remains FAIL.**

## Recovered original source

A read-only inspection of Production `supabase_migrations.schema_migrations`
confirmed 203 history entries and nonempty stored SQL for every entry. This
replaces the previous assumption that the missing source required another
database dump or credential rotation.

The three original payloads below were retrieved, reviewed, retained privately,
and verified against independently queried byte lengths and MD5 values:

| Version | Name | UTF-8 bytes | Source MD5 |
| --- | --- | ---: | --- |
| 20260916070836 | nail_2nya_booking_platform_foundation | 20842 | `9c61ef81b14e2b0e8291bf83450c0611` |
| 20260916071435 | nail_2nya_grant_hardening | 927 | `9b1665c6aa47509a190779023a6e563e` |
| 20260916071630 | nail_2nya_security_performance_hardening | 1710 | `09335c309099a96873f59ced6490f660` |

No recovered SQL was executed. No Production schema, rows, configuration or
migration history changed. Original source includes a business-profile bootstrap
INSERT; it is not automatically a safe schema-only replay. The private checkpoint
contains these three payloads and metadata only for the other 200 migrations,
without retrieving unrelated bootstrap/credential-management source.

## Repository reconciliation is still required

At branch head `c2735039273d62d5cf4baf86d94f487d09f5ddae`, the repository
contains 218 migration SQL files. Forty-one Production history names have no
exact filename-name match after removing the timestamp prefix. This is a name
comparison, **not proof of 41 independently missing schema changes**: renamed,
combined and rewritten source requires content review.

The foundation filename has no commit history at the queried default-branch
path, and commit-message search returned no matching foundation name. These
searches do not prove absence from every ref. The authoritative source was
instead recovered from the stored database migration history.

The known first replay failure is the absent booking foundation before
`20260927061000_2nya_booking_approval_notifications.sql` references
`public.nail_2nya_appointments`. Other known discrepancies include preflight
ordering, the invalid strategy-brief updated_at assignment, and data-specific
workforce/commercial seeds. Copying just three recovered files cannot establish
that all 203 deployed changes and 218 repository files form an equivalent path.

## Acceptance and next execution

- Snapshot baseline restoration and catalog verification already passed within
  the scopes in [cloud evidence](W01_CLOUD_VERIFICATION_20261026.json).
- Missing original source for the three booking migrations is now **RECOVERED**.
  This does not turn historical replay into PASS.
- Reconcile source identities/content, classify seed/runtime/secret operations,
  construct the reviewed replay path privately, and execute it from an empty
  initialized disposable Supabase runtime. Compare all catalog buckets and run
  tenant tests before accepting. Do not reconstruct dummy dependencies, rewrite
  Production history, or silently exclude schema changes.
- The Work runtime has no Docker/Postgres executable. The owner's existing
  Windows Docker container is not remotely controlled by Work.
- Cloud staging `viqjdgohtxqkrdgwtull` is INACTIVE, while `ai roadmap`
  `dqpdyschjpbdhhotmojs` is ACTIVE_HEALTHY per the owner's latest preference.
  The two-active-free-project limit prevents activating staging alongside
  Production and ai roadmap without a capacity change.
- Remaining live gates are the complete signed-in browser/SSR flow, a correctly
  signed expired access token, and privileged business flows using a dedicated
  staging-only server key configured securely. Never use the Production key or
  paste credentials into chat.

The retained original SQL/checkpoint stays private. No merge, Production
mutation, paid upgrade, or switch away from the active ai roadmap is performed.
