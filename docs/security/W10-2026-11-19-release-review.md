# W10 final release review — 2026-11-19

## Decision
**Technical W10 gates: PASS. Ready for a separately owner-approved, controlled production rollout.**

The owner accepted W10 staging evidence and authorized completion of the remaining rehearsal. The missing-schema-export HOLD is now resolved by the [live-catalog forward/inverse rehearsal](W10-2026-11-19-hosted-schema-rehearsal.md). Merge, production migration and deployment remain unapproved; PR #457 stays draft and unmerged.

| Release check | Result |
| --- | --- |
| Actual full Agency journey, desktop and Pixel 7 | PASS — native Supabase/Playwright run [44480348458](https://github.com/rythm2237/Rythm-company-os/actions/runs/44480348458); actual final quantitative documents, refresh/re-login, tenant and Human CEO boundaries |
| Source build/typecheck/lint/security/browser regressions | PASS — [CI 44486944611](https://github.com/rythm2237/Rythm-company-os/actions/runs/44486944611) at reviewed head `ed0bc4a`; public entry and disposable schema checks also SUCCESS |
| Live production catalog preflight | PASS — 109 columns, 11 existing interfaces, 12 workflow relations, RLS/invoker/FK checks and five active template bindings |
| Captured application catalog equality before migration | PASS — 251 tables, 296 functions, 1531 constraints, 360 policies, 153 triggers, indexes/types/views and captured ACLs |
| Ten checksum-pinned forward migrations on that clone | PASS — all exact payloads applied; five specialization changes and new RPC ACLs asserted |
| Installed actual-schema Owner/viewer/foreign/service smoke | PASS — tenant visibility, assignment denials, leased meeting lifecycle, persisted atomic completion and immutability |
| Inverse schema and affected template configuration | PASS — captured catalog and ACL equality restored; synthetic users/tenants rolled back |
| Live source drift during rehearsal | No drift — full captured source and supporting catalogs re-read unchanged |
| Production change / publication | NOT EXECUTED; separate owner approval required |

## Current baseline and boundaries
Main/live remain `55a1377e348c2d9ac0082c8b1f3acbba26acbc45`, READY deployment `dpl_5u6eirwziYrg3pk5gFbY89M4mH3f`. Production ledger has 210 entries, latest `20261107200646_w05_block_cached_private_downloads_production_20261107`; W10 payloads are not applied. W03 tenant constraints are validated; W08 is the current main baseline. The tested application source remains `360323df0c1815e2fdbe41f28a8c1c0c0478d850`; subsequent changes are evidence/harness and EOF whitespace only.

Production health is ok: execution enabled, provider/model configured, external actions disabled/locked. Existing database cron is enabled every five minutes. It was not invoked or changed. AI roadmap capacity was not paused during this phase; its earlier restored state was preserved. No new AI or paid-branch cost occurred.

Vercel Flags inventory returned 403. The app has no installed Vercel Flags SDK/import, and relevant execution switches are environment-backed and observed in health. Full control-plane inventory remains unverified; this is not misrepresented as an empty flag inventory.

The rehearsal is an exact equality check of the enumerated application catalog, not a physical copy of all managed Supabase services. It uses PostgreSQL 17.5/WASM against a 17.6 source; managed network/cron/vault/realtime services, transport login, existing customer data and sequence current values are not replayed. Native Auth/API/mobile evidence comes from the separate real Supabase journey. See the rehearsal report for complete limits. No new performance/load claim or fresh full customer-data backup/DR claim is made.

## Concrete release sequence — requires explicit owner approval
1. Recheck main, feature head, deployment, migration ledger, read-only preflight and source drift. Stop on any unexpected delta. Capture the affected routine/policy/grant/template state again, confirm the applicable backup/recovery prerequisites and keep credentials server-side.
2. Quiesce the existing scheduler through its governed administrative path, wait for active worker leases, and preserve its prior settings. Do not trigger broad dispatch or inspect real customer content as a smoke.
3. Apply only the ten exact payloads in the [ordered checksum manifest](evidence/w10-2026-11-19-migration-manifest.json), using managed migration records and bounded locks. Do not rewrite historical migration history or run broad `db push --include-all`. Stop and recover from any intermediate failure.
4. After successful schema verification, merge the exact reviewed PR head and deploy the application. A merge alone can trigger Vercel but does not install Supabase migrations; schema must precede the app.
5. Verify deployment SHA/health, new RPC ACLs, RLS and a non-billable smoke. Preserve external-action locks and all Human CEO gates.
6. Restore the captured prior scheduler/runtime state after checks pass, then record production evidence. Never claim deployment from a branch test.

## Rollback
The [captured inverse SQL](w10-release-schema-rollback-20261119.sql) has now been executed on the catalog-equivalent offline clone and restored every compared source definition/grant and the five template arrays. No customer/workflow table is dropped. The three new functions are removed without CASCADE; migration history is preserved.

For an approved production rollback: quiesce workers; restore the previous application deployment; recheck catalog drift/dependencies; apply the reviewed inverse through managed recovery only if still compatible. Stop if new dependent objects or changed template values make the captured inverse stale. Before any release, closing the unmerged PR is sufficient; production has no W10 changes to undo.

## Evidence and sign-off
- [Original implementation and journey report](W10-2026-11-19-implementation-report.md).
- [Initial read-only preflight](evidence/w10-2026-11-19-release-preflight.json) records the earlier pre-rehearsal HOLD; the latest verdict is this report.
- [Rehearsal evidence](evidence/w10-2026-11-19-hosted-schema-rehearsal.json) and extraction/replay scripts preserve reproducible commands and catalog fingerprint without committing private definition payloads.
- [x] Owner accepted W10 staging evidence.
- [x] Final code/test and targeted live catalog review.
- [x] Captured live application-schema forward/inverse rehearsal and synthetic real-role smoke.
- [ ] Explicit owner approval for the ten production migration payloads, PR #457 merge and production deployment.
- [ ] Just-in-time operator baseline/recovery/quiescence checks and actual post-release verification, only after that approval.

All three original W10 acceptance criteria remain PASS within the evidenced synthetic journey. Technical review completion is not owner approval or an automatic production release.
