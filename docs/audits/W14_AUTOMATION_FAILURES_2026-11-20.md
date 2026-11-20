# W14 — Automation & Scheduler Failure Audit (pilot acceptance verified; release evidence below)

Audit performed 2026-11-20 using **read-only, aggregated/sanitized** production Supabase queries and the actual GitHub/Vercel baseline.

## Verified baseline

- GitHub `main` at start: `639562d2f29ed8fd3ac0b0d65b0e6176fe9d3b8a`.
- Live `rythm-os.com` Vercel production deployment: `dpl_77nDMst8oTrsQrCJZV5D6bSokvie`, commit `639562d2...`, READY.
- Supabase production project `dezbacyuvsdrlpmmpjht`: ACTIVE_HEALTHY. Migrations include `20261119131828_w13_dispatch_resilience_20261119`; latest observed `20261120005153_w11_20261119174000_crm_relationship_invariants`.
- Supabase staging project `viqjdgohtxqkrdgwtull` was temporarily restored for hosted W14 tests; its automation tables were confirmed present and tenant-isolated. After successful tests and cleanup it was paused again, and `ai roadmap` restoration was requested. The original state must be confirmed before final closure.
- The oldest 108 automation task runs, ordered by `created_at,id`: **97 succeeded, 7 failed, 4 skipped**. Current snapshot: **160 succeeded, 11 failed, 4 skipped** across 175 runs.
- All 175 sampled ledger rows are terminal; 0 missing starts, 0 missing finishes, 0 reversed timestamps, 0 attempts above 1. These are snapshot findings, not a guarantee for future runs.
- Search Console integration record: `status=error`, `enabled=true`, Vault reference exists, last verified on 2026-10-04; task incorrectly remained `configuration_status=ready`.
- Vercel Flags enumeration blocked (403); no Flags setting was changed or assumed.

## The seven historical failures, individually classified

All event dates/times below are UTC; each has `attempt=1`, with no in-row retry evidence. Errors were classified using sanitized patterns only.

| UTC start | Handler / trigger | Duration | Root cause / evidence |
| --- | --- | ---: | --- |
| 2026-09-10 16:46:47 | `core_web_vitals` / manual | 60,153 ms | Provider timeout/aborted request. Later manual runs succeeded; transient, not proof of permanent repair. |
| 2026-09-11 19:12:07 | `authority_monitoring` / manual | 1,624 ms | Crawly backlink payload lacked expected summary: historic schema/data assumption. Current adapter treats missing summary as `LIVE_NO_DATA` rather than crashing. |
| 2026-09-11 19:15:25 | `authority_monitoring` / manual | 1,224 ms | Crawly domain-authority payload lacked expected authority summary. Current adapter accepts absent summary as unavailable evidence. |
| 2026-09-18 05:32:44 | `search_index_monitoring` / scheduled | 693 ms | Google OAuth refresh/authorization failed; requires reconnect. |
| 2026-09-26 05:32:41 | `search_index_monitoring` / scheduled | 459 ms | Google Search Console integration disconnected after credential error. |
| 2026-10-11 05:33:10 | `search_index_monitoring` / scheduled | 908 ms | Google OAuth refresh/authorization failed again; requires reconnect. |
| 2026-10-18 05:33:01 | `search_index_monitoring` / scheduled | 989 ms | Google Search Console integration disconnected. |

The **four skipped** manual attempts had explicit provider-configuration summaries: 2026-09-10 `core_web_vitals`, `search_index_monitoring`, `authority_monitoring`; and 2026-09-11 `authority_monitoring`. No automatic retries were recorded.

### Four additional, later failures
`search_index_monitoring` failed on 2026-10-25, 2026-11-01 and 2026-11-08 (same disconnected integration). Its 2026-11-15 failure stored only the generic text `Automation execution failed.`; **root cause unverified**, and should not be inferred from neighboring failures.

## Failure modes confirmed in code and remediation

- `lib/admin/automation/executor.ts`: previously returned a skip without a run for disabled tasks and duplicate-active triggers; unvalidated writes could hide terminal-state problems. W14 records duplicate/disabled/approval/provider skips with explicit reason, checks writes, and preserves a terminal status.
- `lib/admin/automation/google-monitoring.ts`: provider may be disconnected despite a task flagged ready. W14 adds a read-only provider state preflight to avoid repeated known-permanent failures.
- `lib/admin/automation/executor.ts`: previously allowed successful run statuses when system/SEO health checks failed or an Agency SEO batch contained failed sites. W14 records failed checks as failures, never retries the Agency SEO notification-producing task.
- `lib/admin/automation/retry-policy.ts`: classifies provider/auth/network failures into sanitized codes. Only `system_health`, `seo_site_health`, `ai_usage_cost` and `security_health` can auto-retry for transient errors, max two retries and bounded backoff; provider/quota-bearing tasks are never retried automatically.
- `app/api/admin/automation/dispatch/route.ts`: failures now return HTTP 503 instead of success-shaped HTTP 200, with numeric failed/skipped counts, no sensitive errors.
- `app/(app)/admin/automation/page.tsx`: all-time failures/skips shown, latest incidents visible, full run history navigable by page, messages redacted. Access remains platform-admin-gated.
- `app/(app)/admin/actions.ts`: manual action requires platform admin; failed manual result renders error feedback.

## Validation and release gates

All checks below ran on the feature branch, not Production.

- **CI: PASS** — [workflow 44766717203](https://github.com/rythm2237/Rythm-company-os/actions/runs/44766717203) includes `npm ci`, `npm run test:w14`, `npm run typecheck`, `npm run lint`, `npm run build` and regressions. Verify final CI after the documentation-only commit.
- **W13 dependency: PASS** — [workflow 44766717255](https://github.com/rythm2237/Rythm-company-os/actions/runs/44766717255), includes W06 backend-boundary regression.
- **W14 Hosted Staging: PASS** — [workflow 44766717276](https://github.com/rythm2237/Rythm-company-os/actions/runs/44766717276), second attempt, 2026-11-20; first attempt failed while Staging was `RESTORING`.
- Hosted tests used the actual service-role authenticated Staging Automation tables and synthetic task fixtures only. Verified: one injected transient failure followed by recovery on attempt 2, permanent two-attempt stop with sanitized `DATABASE_UNAVAILABLE` ledger, concurrent duplicate trigger recorded `skipped/already_running`, disabled and approval-required skips, anonymous RLS denial, scheduler 401/503, authenticated/manual server-action boundary, six terminal run records and timestamps.
- Hosted test fixture cleanup succeeded, and direct Staging SQL confirmed **0** remaining `w14-synthetic-%` tasks.
- No historical or customer record was replayed; no third-party provider request, message, payment or AI billable invocation occurred.

**Acceptance criteria**: (1) seven historical root causes categorized — PASS; (2) synthetic failure/retry tests — PASS; (3) no silent skipped/failed result — PASS for the implemented runtime and staged failure/skip scenarios. Browser-level rendered UI check with a real administrator session is not separately evidenced; keep it an operational follow-up rather than claiming it was done.

**Known follow-ups outside the W14 release boundary**:
1. Google Search Console must be reauthorized by an owner for live read-only monitoring. The W14 runtime treats disconnected provider as a visible skip, not an unbounded failure.
2. Vercel Flags inventory remains unavailable due to 403 authorization; W14 code has no new flag migration.
3. The 2026-11-15 generic Search Index failure remains historically unclassified beyond the generic ledger message; do not invent its original root cause.

### Rollback and review
No W14 database migration or Production deployment was performed. Before release: review PR diff and CI results; check platform-admin-only access, `Human CEO` approval block, no external message/charge/replay, handler retry allowlist, and per-status Admin UI counts. If unmerged, close PR and delete feature branch. If ever deployed after separate owner approval, revert its merge commit and redeploy the last tested production SHA (no schema rollback necessary).

**Owner sign-off:** Authorized in the 2026-11-20 follow-up message to close and release W14 subject to tests. **W14 branch acceptance:** PASS. **Production launch:** independently verify merge, deployment, smoke checks and restoration of paused unrelated project before marking finished.
