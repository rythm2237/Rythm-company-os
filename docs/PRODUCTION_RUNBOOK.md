# RYTHM Company OS Production Runbook

## Release sequence

1. Merge only after CI build succeeds.
2. Apply `supabase/migrations/202608060002_production_hardening.sql`.
3. Verify `/api/health` reports Supabase configured and external actions locked.
4. Configure Vercel variables:
   - `OPENAI_API_KEY`
   - `RYTHM_DRY_RUN_MODEL`
   - `RYTHM_AGENT_EXECUTION_ENABLED=false`
   - `RYTHM_EXTERNAL_ACTIONS_ENABLED=false`
   - `RYTHM_AGENT_TIMEOUT_MS=45000`
   - `RYTHM_AGENT_MAX_RETRIES=1`
   - `RYTHM_INPUT_COST_PER_MILLION_USD` and `RYTHM_OUTPUT_COST_PER_MILLION_USD` using the current model's official pricing.
5. Open `/readiness`; verify all checks except the environment and database execution switches pass.
6. Create one low-risk T-001 run with a small budget cap.
7. Set `RYTHM_AGENT_EXECUTION_ENABLED=true` and redeploy.
8. Enable the database dry-run policy from `/readiness` with conservative limits.
9. Execute only the queued T-001 validation run and inspect result, tokens, estimated cost, and audit events.
10. Keep all specialist agents paused and keep external actions disabled.

## Kill switches

- Primary: set `RYTHM_AGENT_EXECUTION_ENABLED=false` in Vercel and redeploy.
- Secondary: set Dry-run execution to Disabled on `/readiness`.
- External action lock: keep `RYTHM_EXTERNAL_ACTIONS_ENABLED=false`.

Any one of the first two switches stops new controlled executions. The validation endpoint also refuses to run if external actions are enabled.

## Incident response

1. Disable both execution switches.
2. Do not delete or edit audit events; they are append-only.
3. Record the affected run ID, approval ID, timestamps, model, token counts, cost estimate, and error code.
4. Review the latest deployment and database migration history.
5. Resolve the root cause in a branch and require a successful CI build.
6. Re-enable only with a new low-risk T-001 validation run.

## Budget controls

Budget enforcement exists at four layers:

- organization monthly budget;
- per-run budget;
- request-time monthly reservation check;
- post-run estimated-cost check.

Pricing variables must be updated whenever the configured model or its official pricing changes.

## Current scope

The production-hardened foundation permits only owner-triggered, low-risk, dry-run execution by `T-001 — Runtime Validation Agent`. It does not permit autonomous scheduling, specialist-agent execution, controlled-live execution, tools, browsing, messaging, or external writes.
