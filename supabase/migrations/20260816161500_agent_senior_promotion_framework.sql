create table if not exists public.agent_promotion_assessments (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  target_level text not null references public.agent_level_definitions(level_key),
  requested_by uuid references auth.users(id) on delete set null,
  status text not null default 'pending' check (status in ('pending','running','eligible','blocked','approved','rejected','failed')),
  evaluation_count integer not null default 0,
  average_score numeric(5,2),
  holdout_pass_count integer not null default 0,
  adversarial_pass_count integer not null default 0,
  validated_experience_count integer not null default 0,
  governance_violation_count integer not null default 0,
  readiness jsonb not null default '{}'::jsonb,
  decision_reason text,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_promotion_assessments_agent_idx on public.agent_promotion_assessments(agent_id,created_at desc);
create index if not exists agent_promotion_assessments_org_idx on public.agent_promotion_assessments(organization_id,status,created_at desc);

create or replace function public.agent_level_readiness(p_agent_id uuid, p_target_level text default 'senior')
returns jsonb
language plpgsql
security definer
set search_path=public
as $$
declare
  v_org uuid;
  v_current_level text;
  v_target_rank integer;
  v_current_rank integer;
  v_min_evals integer;
  v_min_avg integer;
  v_min_exp integer;
  v_requires_holdout boolean;
  v_eval_count integer;
  v_avg numeric(5,2);
  v_holdout integer;
  v_adversarial integer;
  v_exp integer;
  v_gov integer;
  v_eligible boolean;
begin
  select p.organization_id,p.current_level into v_org,v_current_level
  from public.agent_asset_profiles p where p.agent_id=p_agent_id;
  if v_org is null then raise exception 'Agent asset profile not found'; end if;

  select rank_order,min_completed_evaluations,min_average_score,min_validated_experience_events,requires_holdout
    into v_target_rank,v_min_evals,v_min_avg,v_min_exp,v_requires_holdout
  from public.agent_level_definitions where level_key=p_target_level;
  if v_target_rank is null then raise exception 'Unknown target level %',p_target_level; end if;
  select rank_order into v_current_rank from public.agent_level_definitions where level_key=v_current_level;

  select count(*),coalesce(round(avg(r.score)::numeric,2),0),count(*) filter(where r.governance_violation)
    into v_eval_count,v_avg,v_gov
  from public.agent_evaluation_results r
  where r.agent_id=p_agent_id and r.verdict='PASS';

  select count(*) filter(where e.event_type='holdout' and e.outcome_status='successful'),
         count(*) filter(where e.event_type='adversarial' and e.outcome_status='successful'),
         count(*) filter(where e.counts_toward_experience and e.validated_at is not null and e.outcome_status in ('successful','mixed'))
    into v_holdout,v_adversarial,v_exp
  from public.agent_experience_events e where e.agent_id=p_agent_id;

  v_eligible := v_target_rank=v_current_rank+1
    and v_eval_count>=v_min_evals
    and v_avg>=v_min_avg
    and v_exp>=v_min_exp
    and (not v_requires_holdout or v_holdout>=1)
    and v_adversarial>=1
    and v_gov=0;

  return jsonb_build_object(
    'agent_id',p_agent_id,
    'organization_id',v_org,
    'current_level',v_current_level,
    'target_level',p_target_level,
    'eligible',v_eligible,
    'evaluation_count',v_eval_count,
    'minimum_evaluations',v_min_evals,
    'average_score',v_avg,
    'minimum_average_score',v_min_avg,
    'holdout_pass_count',v_holdout,
    'holdout_required',v_requires_holdout,
    'adversarial_pass_count',v_adversarial,
    'adversarial_required',true,
    'validated_experience_count',v_exp,
    'minimum_validated_experience',v_min_exp,
    'governance_violation_count',v_gov,
    'governance_clean_required',true,
    'level_sequence_valid',v_target_rank=v_current_rank+1
  );
end $$;

revoke all on function public.agent_level_readiness(uuid,text) from public,anon;
grant execute on function public.agent_level_readiness(uuid,text) to authenticated,service_role;

alter table public.agent_promotion_assessments enable row level security;
create policy "members_read_promotion_assessments" on public.agent_promotion_assessments for select to authenticated using (
  exists(select 1 from public.organization_members m where m.organization_id=agent_promotion_assessments.organization_id and m.user_id=auth.uid())
);
create policy "owners_request_promotion_assessments" on public.agent_promotion_assessments for insert to authenticated with check (
  requested_by=auth.uid() and exists(select 1 from public.organization_members m where m.organization_id=agent_promotion_assessments.organization_id and m.user_id=auth.uid() and m.role='owner')
);

update public.agent_level_definitions
set requirements = requirements || '{"adversarial_required":true,"validated_real_world_experience_required":true,"promotion_is_review_gated":true}'::jsonb,
    updated_at=now()
where level_key='senior';
