-- Compatibility preload for Batch 2.1.6 Unified Workflow backend.
--
-- Why this exists:
-- 202608070011_unified_workflow_backend.sql defines record_company_event(...,
-- target_event_version smallint) but its initial convergence call passes the
-- literal `1`, which PostgreSQL resolves as integer. PostgreSQL does not apply
-- an implicit integer -> smallint cast during function overload resolution.
--
-- This overload is intentionally created BEFORE migration 011. Its PL/pgSQL
-- body is resolved when invoked, at which point migration 011 has already
-- created the canonical smallint overload. It delegates with an explicit cast.
-- No tables/data are changed by this preload migration.

create or replace function public.record_company_event(
  target_event_type text,
  target_organization_id uuid,
  target_project_id uuid,
  target_aggregate_type text,
  target_aggregate_id uuid,
  target_actor_type text,
  target_actor_user_id uuid,
  target_actor_agent_id uuid,
  target_correlation_id uuid,
  target_causation_event_id uuid,
  target_risk_level public.rythm_risk_level,
  target_payload jsonb,
  target_idempotency_key text,
  target_occurred_at timestamptz,
  target_event_version integer
)
returns uuid
language plpgsql
security invoker
set search_path = public
as $$
begin
  return public.record_company_event(
    target_event_type,
    target_organization_id,
    target_project_id,
    target_aggregate_type,
    target_aggregate_id,
    target_actor_type,
    target_actor_user_id,
    target_actor_agent_id,
    target_correlation_id,
    target_causation_event_id,
    target_risk_level,
    target_payload,
    target_idempotency_key,
    target_occurred_at,
    target_event_version::smallint
  );
end $$;

comment on function public.record_company_event(
  text,uuid,uuid,text,uuid,text,uuid,uuid,uuid,uuid,public.rythm_risk_level,jsonb,text,timestamptz,integer
) is 'Compatibility overload for Batch 2.1.6; delegates integer event_version to canonical smallint record_company_event overload.';
