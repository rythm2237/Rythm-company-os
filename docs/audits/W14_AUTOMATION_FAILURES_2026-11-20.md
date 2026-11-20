# W14 — Automation & Scheduler Failure Audit (pilot, not released)

Audit performed 2026-11-20 using **read-only, aggregated/sanitized** production Supabase queries and the actual GitHub/Vercel baseline.

## Verified baseline

- GitHub `main` at start: `639562d2f29ed8fd3ac0b0d65b0e6176fe9d3b8a`.
- Live `rythm-os.com` Vercel production deployment: `dpl_77nDMst8oTrsQrCJZV5D6bSokvie`, commit `639562d2...`, READY.
- Supabase production project `dezbacyuvsdrlpmmpjht`: ACTIVE_HEALTHY. Migrations include `20261119131828_w13_dispatch_resilience_20261119`; latest observed `20261120005153_w11_20261119174000_crm_relationship_invariants`.
- Supabase staging project `viqjdgohtxqkrdgwtull` **INACTIVE**; no hosted W14 failure injection was run.
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

Code-only offline commands (PR CI, **results must be checked**):
```bash
npm ci
npm run test:w14
npm run typecheck
npm run lint
npm run build
```

`npm run test:w14` injects synthetic transient/permanent faults, checks retry limits, tests a disposable in-memory PostgreSQL partial unique index and failed/skipped terminal records, and asserts the manual auth/scheduler contract. This does **not** prove a hosted staging failure injection.

**Open, must not misreport as passed:**
1. Real hosted staging scheduler failure injection, authorization-denied manual trigger, and UI readback with isolated synthetic data (staging Supabase is inactive; no cost/activation approval).
2. Reauthorize read-only Google Search Console if desired. This requires a separately authorized Production provider action and is not part of this PR.
3. Vercel Flags inventory is blocked by account authorization (403); verify through appropriate authorized owner session if launch depends on feature flags.
4. Reassess generic 2026-11-15 failure if sanitized request traces are available; do not infer its root cause.

### Rollback and review
No W14 database migration or Production deployment was performed. Before release: review PR diff and CI results; check platform-admin-only access, `Human CEO` approval block, no external message/charge/replay, handler retry allowlist, and per-status Admin UI counts. If unmerged, close PR and delete feature branch. If ever deployed after separate owner approval, revert its merge commit and redeploy the last tested production SHA (no schema rollback necessary).

**Owner sign-off:** PENDING. **W14 launch status:** NOT YET ACCEPTED.
