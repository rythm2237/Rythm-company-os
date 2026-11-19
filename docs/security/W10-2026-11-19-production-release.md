# W10 — approved production release, 2026-11-19

**Released and verified.** The owner explicitly approved the ten production migration payloads, PR #457 merge and production deployment in this conversation. This report supersedes the earlier pre-release approval/HOLD status.

| Deploy result | Observed value |
| --- | --- |
| Production URL | https://rythm-os.com |
| Target / status | production / READY |
| Commit | `42c7d16ebad3dfefca40c51b73dd90f76383637b` |
| Deployment | `dpl_Bi7VX7umMmy1nWc7nnVwY2k3pBqQ` |
| Framework / build duration | Next.js / approximately 159 seconds |
| PR | [#457](https://github.com/rythm2237/Rythm-company-os/pull/457), merged by squash |
| Approved feature head | `33f7ea6ad32497e00e9569ce9a5dff85b43bdcf6` |
| Previous main / application fallback | `55a1377e348c2d9ac0082c8b1f3acbba26acbc45` / `dpl_5u6eirwziYrg3pk5gFbY89M4mH3f` |

Git comparison verified the production commit tree is **identical** to the approved feature tree `f22d58cd1539f46b6bfbff9c91791620c5f24c4c`. Subsequent evidence/harness corrections on the feature branch do not change the released application.

## Database and guarded rollout
Fresh SELECT-only preflight and the full captured application catalog matched the rehearsed baseline. A private affected-state definition backup and the five prior template arrays were captured. No customer rows, password or API key was exported.

The existing scheduler configuration and cron job were disabled temporarily without deleting/replacing the job or rotating its secret. There were zero queued dispatch HTTP requests and zero valid task/meeting leases. Deployment waited **339.8 seconds**, exceeding the existing 300-second request limit, before starting DDL.

All ten payloads in the [manifest](evidence/w10-2026-11-19-migration-manifest.json) applied successfully through managed Supabase migrations, source bodies unchanged. Each execution used transaction-local 5-second lock and 60-second statement limits. Those transaction wrappers were rehearsed offline before use. Ledger count is **210 → 220**; historical records were not rewritten.

| Source version | Managed applied version |
| --- | --- |
| 20261117125000 | 20261119092842 |
| 20261117125500 | 20261119092900 |
| 20261117130000 | 20261119092902 |
| 20261117140000 | 20261119092904 |
| 20261118120000 | 20261119092905 |
| 20261118123000 | 20261119092907 |
| 20261118133000 | 20261119092908 |
| 20261118144000 | 20261119092910 |
| 20261118145000 | 20261119092912 |
| 20261118150000 | 20261119092914 |

Five global Agency template specialization arrays now have the expected active bindings. Application tables retain RLS, the operating timeline remains security-invoker, and the W03 named tenant FK remains validated. Anonymous assignment is denied; authenticated users cannot execute the service-only completion RPC. Owner assignment still checks actual active membership, entitlement, enabled specialist and tenant.

A strict postflight comparison initially exposed a **rehearsal-environment creator mismatch**: three new routines in the clone were owned by its bootstrap role `web_user`, unlike production `postgres`. Production ownership and its legitimate creator default grants were not weakened to satisfy the test. The offline replay was corrected to use the observed migration actor and database owner `postgres`, then forward migrations, actual-role smoke and inverse checks passed again.

Every compared production catalog group now matches that corrected expected post-migration state, including definitions, owners and captured relation/function/column ACLs:
- Before hash: `149bcc6e7613aacd8fb814f500be406a1e892bfb03bb873a8014e8e995d1add0`.
- Expected **and actual** after hash: `da0301488002fbe81e6442f3439fb6e93e2020a7be81c3e3a3f090af2a3165ee`.

Only after schema verification was PR #457 merged. Vercel automatically built production from the resulting main commit; the live domain lookup confirms that exact commit and READY state.

## Post-deploy verification
[Main CI 44497512874](https://github.com/rythm2237/Rythm-company-os/actions/runs/44497512874), Production SEO Crawl and IndexNow completed successfully. The approved feature checks also passed before merge.

Read-only anonymous production smoke passed:
| Request | Result |
| --- | --- |
| Landing, templates, Agency signup selection | HTTP 200; Agency present and selection retained |
| `/api/health` | HTTP 200, status ok; database/provider/model configured |
| Dispatch, live project and roadmap APIs without authorization | HTTP 401 |
| `/crm` without authentication | HTTP 307 to `/login?next=%2Fcrm` |

No synthetic production account/tenant, billable model request, external message, real charge or customer workflow was created by release verification. The full authenticated journey/persistence/role evidence remains the previously accepted native disposable desktop/mobile run [44480348458](https://github.com/rythm2237/Rythm-company-os/actions/runs/44480348458).

At `2026-11-19T09:38:07.698381Z`, the original scheduler was restored: config enabled, same job ID 1, same active five-minute cadence and same command hash. Secret fields were not read or rotated. External actions remain disabled/locked and the agent execution switch remains enabled.

Post-deploy observability:
- Error scan: no error/fatal groups returned for this deployment in the queried 15-minute window. This is an initial scoped observation, not a guarantee of all future operations.
- Drains: not inspected or changed.
- Monitoring: health, guarded anonymous smoke and runtime error aggregates checked; no new monitoring service configured.

## Evidence, scope and rollback
[Structured production evidence](evidence/w10-2026-11-19-production-release.json) records payload/transaction hashes, managed versions, scheduler state, health, HTTP outcomes and CI IDs. Raw catalog definitions remain private; no credentials are included in evidence.

The application changes and line references remain documented in the [implementation report](W10-2026-11-19-implementation-report.md). The [catalog rehearsal report](W10-2026-11-19-hosted-schema-rehearsal.md) describes the PostgreSQL 17.5/WASM versus hosted 17.6 and managed-service exclusions; the actor correction above is additional fidelity, not a different product implementation. Full Vercel Flags inventory still returns 403; effective execution switches are observed. No new full customer-data backup/DR or production load test was performed.

Rollback is prepared, **not executed**: quiesce the scheduler; restore the previous application deployment; recheck current definitions/dependencies/template values; apply the previously rehearsed [inverse schema proposal](w10-release-schema-rollback-20261119.sql) through managed recovery if still compatible; verify and restore prior runtime state. Preserve customer/workflow rows and migration history. Do not blindly run an inverse against later unrelated schema changes.

| Original W10 acceptance criterion | Final result |
| --- | --- |
| Full Agency path without developer intervention | **PASS** — evidenced native synthetic desktop/mobile journey |
| Persisted records survive refresh and belong to the correct tenant | **PASS** — persisted reads, re-login and foreign-tenant denials in native staging |
| No critical navigation/state/permissions defects | **PASS within tested journey** — browser, role, approval and regression evidence; production guarded smoke/schema checks passed |

Human/operations checklist:
- [x] Owner accepted staged W10 evidence.
- [x] Owner separately authorized production migrations, PR merge and release.
- [x] Applied ten payloads and verified actual production schema/ACLs.
- [x] Published approved content and verified live alias/health/auth boundary.
- [x] Restored the scheduler and retained external-action locks.
- [x] Recorded release and rollback evidence.

No additional owner action is required to complete this authorized release.
