# Migration-history reconciliation follow-up

Status: OPEN. Owner-approved separation from W01 snapshot-baseline acceptance on 2026-10-28.

W01 is accepted for its verified immutable schema-only snapshot, documented staging restrictions, tested contract-policy candidate, normal-user authorization/browser/backend evidence and cleanup. Exact Production migration-history reconstruction is excluded from that acceptance.

Known differences:
- Production has 203 migration records; staging retains 9 records.
- Repository contains 218 original migration files. Diagnostic replay uses 24 reviewed supplemental inputs, quarantines four live-data seeds and replays 238 disposable copies.
- Diagnostic replay passes with 214 RLS tables and 1000 behavioral checks, but its catalog fingerprint differs from Production.
- Current staging has explicit safety and two contract-policy deltas; equality must not be inferred from table counts or green CI.

Remaining work:
1. Reconcile source payloads, aliases, combined migrations and ordering against all 203 original records.
2. Review schema-only projections and seed exclusions independently; retain sensitive originals privately.
3. Rebuild an isolated disposable database without Production customer/Auth rows or outbound execution.
4. Compare actual physical catalog inventories and explain every remaining difference.
5. Run normal-user authorization tests and retain exact source/checksum/CI evidence.
6. Obtain separate signoff for any claim of exact historical reconstruction.

Do not forge migration history, overwrite the original snapshot, weaken the strict checker to report false parity, or modify Production to make the comparison pass. This follow-up grants no Production migration, merge or promotion authorization.
