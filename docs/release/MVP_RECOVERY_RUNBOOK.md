# RYTHM Company OS — MVP Recovery Runbook

Purpose: provide a conservative, auditable recovery procedure for MVP incidents without bypassing Human CEO authority or corrupting governed history.

## Recovery principles

1. Preserve evidence first. Do not delete failed sessions, decisions, approvals, actions, workflow events or audit history to make the UI look clean.
2. Stop consequential progression if integrity is uncertain. External actions remain disabled.
3. Prefer retry/resume only for transient failures and only through idempotent governed runtime paths.
4. Never recreate a valid meeting turn, decision, approval or action merely because a request timed out.
5. Use correlation IDs and the Operations Health incident surface to converge repeated failures into one diagnosable incident.
6. Database/schema recovery is migration-forward. Applied migrations are not edited in place after Production use.

## Incident triage

Owner opens `/operations/health` and records:

- incident severity;
- affected organization/project/session/entity;
- correlation ID if available;
- last known valid state;
- whether any consequential decision was already finalized;
- whether audit/workflow history is intact.

If organization isolation, authorization, audit integrity or consequential authority is in doubt, classify the incident as Critical and stop progression until verified.

## Application recovery

### Failed/aborted meeting runtime

- Reload the governed meeting.
- Confirm valid persisted turns are present.
- Use Continue/Retry only for the missing transient step.
- Confirm no duplicate valid turn was created.
- Keep Chair closure under the Human CEO.

### Decision/approval/action error

- Verify the authoritative record before retrying the UI command.
- If the record already exists, navigate to it rather than recreating it.
- If an approval is required, do not bypass it by directly changing the action state.

### Project progress mismatch

- Compare Project Operating View, workflow traceability and Project Pulse history.
- Treat project/domain records as authority; timeline/event projections are evidence/read models, not authorization.
- Do not rewrite append-only history to repair a projection.

## Deployment recovery

- Identify the last known-good Production deployment.
- If the new release is unusable and data/schema compatibility allows it, roll application traffic back to the last known-good deployment.
- Do not roll back the database by deleting applied migrations.
- If a new additive migration introduced a defect, fix forward with a new migration and document the incident.
- Re-run CI/build before returning the corrected application to Production.

## Database/configuration recovery contract

The repository contains the canonical ordered Supabase migrations under `supabase/migrations/`. Vercel contains runtime environment configuration/secrets. These two assets must be treated as separate recovery domains.

For an MVP database recovery event:

1. preserve/export the affected database state using the database provider's available backup/export mechanism before destructive action;
2. restore to a safe recovery target or replacement environment using the provider-supported recovery mechanism;
3. apply repository migrations in canonical order only where required for that target;
4. validate organization membership/RLS before exposing application traffic;
5. validate append-only audit/workflow history;
6. validate Owner login and one read-only project/meeting trace;
7. reconfigure required runtime environment variables without copying secrets into the repository;
8. run the production smoke checklist before reopening governed work.

The exact provider backup mechanism depends on the active Supabase plan/configuration and must be confirmed in the provider dashboard at incident time. The application must not assume point-in-time recovery exists unless it is actually enabled.

## MVP recovery drill record — 2026-08-08

Non-destructive recovery drill completed at application/governance level:

- Production Operations Health loaded successfully.
- Owner authority check passed.
- Organization RLS check passed.
- Anonymous organization-table access check passed.
- Audit append-only control passed.
- Incident register was available and showed no open incident at validation time.
- Meeting retry/resume behavior had previously been exercised after aborted/empty-output runtime failures without duplicating valid turns.
- Forward-fix migrations were exercised during MVP implementation for meeting runtime/schema defects rather than rewriting applied history.
- Production deployments were repeatedly validated after CI/build and additive migrations.

This MVP drill validates the application recovery contract and governance controls. It does not claim that a destructive full database restore was performed in Production. A destructive restore drill is intentionally avoided for the live MVP environment and should be performed in a dedicated staging/recovery environment before broader commercial scale.