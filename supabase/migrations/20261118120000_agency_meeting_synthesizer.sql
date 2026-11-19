-- Agency template Strategy Director can synthesize advisory meeting output.
-- Preserve active, same-tenant, explicit CEO authorization and two-participant gates.
create or replace function public.enforce_enabled_agents_before_session_run()
returns trigger
language plpgsql
security invoker
set search_path = ''
as $$
declare
  v_total integer;
  v_enabled integer;
  v_synthesizer integer;
begin
  if new.status = 'running' and old.status is distinct from 'running' then
    select
      count(*),
      count(*) filter (where a.enabled),
      count(*) filter (where a.enabled and a.agent_code in ('B-001','STRATEGY_DIRECTOR'))
    into v_total, v_enabled, v_synthesizer
    from public.meeting_agent_participants p
    join public.agents a
      on a.id = p.agent_id
     and a.organization_id = p.organization_id
    where p.session_id = new.id
      and p.organization_id = new.organization_id
      and p.explicitly_authorized_by_ceo = true;

    if v_total < 2 then
      raise exception 'At least two enabled CEO-authorized agents are required';
    end if;

    if v_enabled <> v_total then
      raise exception 'A selected meeting agent is paused';
    end if;

    if v_synthesizer < 1 then
      raise exception 'An enabled Executive Orchestrator or Strategy Director is required for governed meeting synthesis';
    end if;
  end if;

  return new;
end;
$$;
