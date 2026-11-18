# W13 — Dispatcher 502 resilience (draft, staging-first)

## Verified baseline (2026-11-18)

- `main`: `55a1377e348c2d9ac0082c8b1f3acbba26acbc45`; production Vercel deployment `dpl_5u6eirwziYrg3pk5gFbY89M4mH3f` reports READY at this SHA.
- Vercel Hobby runtime logs for 2026-10-19 and 2026-10-21 are outside retention; the Vercel historical log API returned a retention error, not a negative finding.
- Supabase project `dezbacyuvsdrlpmmpjht` was ACTIVE_HEALTHY and scheduler configuration showed enabled with a five-minute cadence.
- `cron.job_run_details` recorded 288 **succeeded schedule invocations** on each of October 19, 20 and 21. These are database job outcomes, **not** HTTP response status/502 proof.
- Existing `supabase/migrations/20260912206000_project_os_database_scheduler.sql:36-40` sets pg_net HTTP timeout to 290,000 ms; `app/api/projects/dispatch/route.ts:19` sets Vercel maxDuration to 300 s. This is a plausible timeout window, not a proven historical root cause.
- The route invokes many independent, partly AI-backed and side-effecting stages; existing task/meeting workers already use tenant-bound claim leases, retries, and existing external-action gateway idempotency.

## Changes in this feature branch (not applied to production)

1. A service-only, atomic singleton lease prevents overlapping scheduled handler executions; it is owned by a newly generated UUID trace. A missing migration fails closed instead of dispatching without the lock.
2. The read-only scheduler-authorization lookup and the deduplicating execution-health maintenance RPC receive at most three attempts with 120/240 ms bounded backoff on transient errors. **The completion-health RPC is intentionally NOT retried**: it resolves and reinserts monitoring events. The whole dispatch, claims, AI tasks, proposals, approvals, and external action gateways must never be automatically replayed.
3. Each step logs a generated trace identifier, fixed step label, duration and sanitized status/error code. No exception bodies, tokens, customer content or organization IDs are placed in the new logs.
4. A durable global health state records `healthy | degraded | failed`, sanitized failure labels and consecutive failure count without customer data; a degraded response returns 503, not a misleading 200.
5. One task, meeting, approved proposal bridge and governed tool execution are claimed per scheduler tick; knowledge and connection setup are bounded; supervisor, proposal reconciliation and lifecycle continuation batches are capped. The preexisting approval and tenant filters are unchanged.
6. Excess work is deferred instead of starting new jobs after the dispatch budget is exhausted. Running jobs are **not** aborted by `Promise.race`, which would risk duplicate side effects.
7. Existing worker durable retry queues and supervisor reconciliation remain the dead-letter/recovery mechanism for business operations. W13 does not create a new unreviewed replay queue.

## Commands / gates

- `npm run test:w13`: synthetic HTTP 502/503/504 retry and backoff; rejection of permanent 401; trace redaction; offline PGlite SQL migration, atomic lease ownership, expiry and state recovery; source integration guards for task/meeting claims and proposal idempotency keys; actual compiled dispatch route under mocked 502/overlap with no duplicate synthetic task or gateway actions.
- `npm run typecheck`
- `npm run lint`
- `npm run build` (includes `test:w13` in prebuild).
- Vercel preview and GitHub CI are **not** equivalent to a real staging injection or production deployment.

## Pending acceptance evidence

1. Run the migration against a **disposable already-authorized staging database**, not production. Verify `anon` and `authenticated` cannot execute lease RPCs.
2. With synthetic authorized fixtures, inject a 502 response into an explicitly idempotent maintenance upstream call and verify 3-attempt cap, backoff, `traceId`, 503 when exhausted and recovered health after success. The offline handler injection is committed; hosted staging injection remains pending.
3. Send two *authorized synthetic* scheduler invocations simultaneously; verify only one acquires the lease, the other returns 202, and no duplicate project proposals, task outcomes or external actions occur.
4. Correlate `X-Trace-Id`, runtime logs, lease health status and queue state. Check that log/alert payloads contain no credentials, raw upstream errors, customer records or prompts.
5. Verify scheduler continues at its five-minute cadence and workload drains without exceeding 300 s. Production load/noisy testing is prohibited.
6. Confirm W01 dependency and Human CEO separate production approval before any merge/deployment/migration.

## Rollback / safe release

- **Before merge:** close draft PR and delete feature branch if rejected; no production rollback necessary.
- **After a separately approved release:** revert route and bounded-claim code to the prior tested commit and redeploy the approved rollback build. The additive `project_dispatch_runtime` table and RPCs can remain inert; remove later only with a separate reviewed migration after ensuring no active invocations.
- Never apply W13 production migration before the compatible application rollout is approved and staged. Never leave a partially upgraded route depending on absent RPCs.
- The only production data inspected during this task were noncustomer scheduler metadata, migration listings, and aggregated historical log counts.

## Gate assessment (as authored, before CI)

- **AC1 — bounded unknown**: supported by source and logged limitations; exact 2026-10-19/21 HTTP root cause remains unproven.
- **AC2 — retry / idempotency regression**: pending CI and independently instrumented staging; offline synthetic tests alone do not establish production exactly-once semantics.
- **AC3 — trace-only alert**: implemented as structured log call and response header; runtime correlation and notification delivery pending staging.
