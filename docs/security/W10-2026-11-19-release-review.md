# W10 final release review — 2026-11-19

## Decision
**Application and targeted production catalog: PASS. Direct production release: HOLD.**

The owner explicitly accepted W10 evidence and requested the final release review in this conversation. This accepts the tested staging journey; it does not authorize merge, production DDL, production migration or deployment. PR #457 remains draft and unmerged.

The remaining technical release gate is a rehearsal of the ten exact W10 migration payloads against a disposable copy of the **current hosted schema**. The successful W10 E2E used a documented scoped reconstruction. A read-only catalog check reduces compatibility uncertainty; it cannot prove the outcome of executing DDL/triggers on an exact hosted baseline. Do not claim full historical schema parity from the results below.

## Current baseline
- Branch reviewed: `ef2c31145c750c7cdba981c20d47eae0cf5fc12e`; unchanged application code after fully tested `360323df0c1815e2fdbe41f28a8c1c0c0478d850`.
- Main and live deployment remain `55a1377e348c2d9ac0082c8b1f3acbba26acbc45`, deployment `dpl_5u6eirwziYrg3pk5gFbY89M4mH3f` READY. Main is an ancestor of the branch; PR mergeable.
- Production PostgreSQL 17.6; **210** migration ledger entries, latest `20261107200646_w05_block_cached_private_downloads_production_20261107`. W10's ten migrations are not applied.
- W03 tenant composite constraints are present and validated; W08 is the main baseline.
- Latest source checks: CI [44482571640](https://github.com/rythm2237/Rythm-company-os/actions/runs/44482571640), public entry [44482571594](https://github.com/rythm2237/Rythm-company-os/actions/runs/44482571594), disposable staging [44482571520](https://github.com/rythm2237/Rythm-company-os/actions/runs/44482571520), provider availability [44482571492](https://github.com/rythm2237/Rythm-company-os/actions/runs/44482571492): all SUCCESS. Last disposable run deliberately has paid AI disabled; the actual model-backed full proof remains [44480348458](https://github.com/rythm2237/Rythm-company-os/actions/runs/44480348458).
- Production health observed at `2026-11-19T08:13:37.221Z`: ok, provider/model configured, agent execution enabled, external actions disabled/locked. The scheduler is enabled, points to the production domain, has a configured secret hash, and its active cron runs every five minutes. No dispatch or provider request was triggered.
- Vercel Flags inventory still returns 403; no installed Vercel Flags SDK/import was found in application/package sources. Relevant execution switches are environment-backed and observable in health. Full flag inventory remains unverified; no CLI fallback is installed. Do not infer an empty flag inventory.
- No customer rows, scheduler credentials, keys or secret values were read into evidence.

## Read-only catalog preflight: PASS
Executed [scripts/w10-release-catalog-preflight.sql](../../scripts/w10-release-catalog-preflight.sql) through the Supabase connector, production project `dezbacyuvsdrlpmmpjht`.

| Check | Result |
| --- | --- |
| 109 required columns across 14 relations | No missing column |
| 11 existing callable/trigger interfaces needed by the migrations | No missing function |
| 12 workflow relations and two contract policies | Present |
| All checked physical workflow tables retain RLS | PASS |
| Operating timeline security_invoker | true |
| Named W03 task/agent composite FK | Present and validated |
| Five Agency template rows/version 1.0 | Present with empty prior specialization arrays |
| Five active target specialization mappings | Present |
| Seven overwritten routine signatures/return types | Compatible with proposed replacements |
| Owner assignment/capacity unique keys | Existing composite primary keys |
| Entitlement, meeting, session, action lifecycle triggers | Enabled and bound |
| Owner assignment RLS | Existing Owner-write policies retained |

Captured current catalog has service-role EXECUTE on `is_org_owner`; the isolated ACL regression deliberately denies it to exercise the stricter failure case. This confirms a real baseline difference; do not describe isolated ACLs as byte-for-byte production parity.

Detailed metadata and results: [release preflight evidence](evidence/w10-2026-11-19-release-preflight.json). It contains schema/catalog information, not production customer rows.

No exact hosted schema export is present in the repository/workspace. The runtime has no injected PostgreSQL connection, management token, pg_dump or Supabase CLI. The connected SQL catalog endpoint provides read-only checks but is not a PostgreSQL dump/restore connection. A server-side authorized schema-export connection or an existing sanitized schema-only baseline is needed for the remaining rehearsal; never paste connection strings or passwords into chat.

## Safe prepared release sequence — not executed
1. Recheck branch/main/deployment/ledger and run the read-only preflight again. Refuse stale or changed routine signatures, RLS, policies, template versions or FK names.
2. Obtain a current schema-only export through an authorized server-side database connection and replay the exact W10 migration payloads on a disposable isolated clone. Preserve the hosted baseline; do not rewrite production migration history or run broad `db push --include-all` against the divergent ledger. Repeat the installed-schema authorization tests. Run a synthetic Owner/viewer/foreign-tenant smoke on that clone. Provider use must remain within the existing authorized cumulative budget or stay mocked.
3. Review the resulting clone proof, current recoverable backup and the exact ordered [migration checksum manifest](evidence/w10-2026-11-19-migration-manifest.json). **Stop if any rehearsal or restore prerequisite fails.**
4. Obtain separate explicit owner authorization for production migration, merge and deployment. This conversation has not granted it.
5. Under that approval, quiesce scheduled workers and wait for active leases before applying the ten reviewed payloads in manifest order, with bounded locks and managed migration ledger records. Do not create customer success records or auto-approve Human CEO gates.
6. Deploy the reviewed application commit after schema changes; verify deployment SHA, health, new RPC ACLs, RLS and a non-billable smoke. Never trigger broad production dispatch as a smoke test.
7. Restore the previously captured scheduler/runtime state only after checks pass. Preserve external-actions lock and original Human CEO gates.

The ten files are the only W10 database deltas. A single direct merge triggers Vercel application deployment but does not install them. **Do not merge first and expect the application to work against the old schema.**

## Rollback preparation
[Captured inverse schema proposal](w10-release-schema-rollback-20261119.sql) restores the seven actual prior routine bodies, prior contract policy expressions, prior direct authenticated grants and prior Agency template specialization arrays, then removes the three new RPC/helper functions without CASCADE. It is a review artifact, **not executed or validated against an exact hosted clone**. It preserves workflow/customer rows and migration history; it is not a substitute for a recoverable backup.

Before any use: recheck catalog drift, dependency changes and templates; quiesce workers, restore previous app, rehearse inverse SQL on the clone and obtain explicit approval. If a forward migration transaction fails, roll that transaction back. Do not blindly delete workflow records or rewind migration history.

## Commands and limits of this review
- `git ls-remote origin refs/heads/main refs/heads/pilot/w10-agency-e2e`: exact heads above.
- `git fetch origin main pilot/w10-agency-e2e`; isolated detached review worktree created; existing worktrees preserved.
- `git merge-base --is-ancestor origin/main HEAD`: PASS.
- `git diff --name-only 360323df0c1815e2fdbe41f28a8c1c0c0478d850 HEAD`: only CI/public-browser harness and evidence/docs changes.
- `git diff --check origin/main HEAD` found one extra EOF blank line in the leased-meeting migration. Removed that blank line only; SQL semantics unchanged.
- `node --import tsx scripts/validate-w10-meeting-lifecycle.ts`: PASS after whitespace cleanup, actual PostgreSQL role/lease/minutes/immutability negative cases.
- `curl -fsS --max-time 20 https://rythm-os.com/api/health`: PASS, sanitized health only.
- Catalog metadata queries are SELECT-only. One scheduler metadata probe used an incorrect column name and failed; corrected to the actual `dispatcher_base_url`, then passed. No write occurred.
- No new provider calls, cost, production DDL, customer mutation, runtime flag change, merge or deployment.

## Sign-off status
- [x] Owner accepted the W10 staging evidence (conversation 2026-11-19).
- [x] Final source checks and targeted live catalog preflight reviewed.
- [ ] Exact hosted schema clone forward/inverse rehearsal and synthetic role smoke.
- [ ] Current recovery prerequisites and hosted runtime release review.
- [ ] Separate explicit production migration/merge/deployment approval.

W10 journey acceptance remains PASS in its documented test scope. The release HOLD is an operational deployment gate, not a claim that the tested journey failed.
