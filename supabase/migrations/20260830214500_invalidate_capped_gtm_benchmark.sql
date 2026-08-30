-- RYTHM OS — invalidate the first live GTM Senior benchmark because the candidate runtime hit its 3,500-token output ceiling.
-- Preserve the evidence for auditability while excluding invalidated batches from formal readiness calculations.

begin;

alter table public.agent_evaluation_batches
  add column if not exists invalidated_at timestamptz,
  add column if not exists invalidation_reason text;

create or replace function public.agent_level_readiness(p_agent_id uuid, p_target_level text default 'senior')
returns jsonb
language plpgsql
security definer
set search_path to 'public'
as $$
declare
  v_org uuid; v_current_level text; v_target_rank integer; v_current_rank integer;
  v_min_evals integer; v_min_avg integer; v_min_exp integer; v_requires_holdout boolean; v_requirements jsonb;
  v_requires_adversarial boolean; v_eval_count integer; v_pass_count integer; v_avg numeric(5,2);
  v_holdout integer; v_adversarial integer; v_exp integer; v_gov integer; v_eligible boolean;
begin
  select p.organization_id,p.current_level into v_org,v_current_level
  from public.agent_asset_profiles p where p.agent_id=p_agent_id;
  if v_org is null then raise exception 'Agent asset profile not found'; end if;

  select rank_order,min_completed_evaluations,min_average_score,min_validated_experience_events,requires_holdout,requirements
    into v_target_rank,v_min_evals,v_min_avg,v_min_exp,v_requires_holdout,v_requirements
  from public.agent_level_definitions where level_key=p_target_level;
  if v_target_rank is null then raise exception 'Unknown target level %',p_target_level; end if;
  select rank_order into v_current_rank from public.agent_level_definitions where level_key=v_current_level;
  v_requires_adversarial := coalesce((v_requirements->>'adversarial_required')::boolean,false);

  select count(*),count(*) filter(where r.verdict='PASS'),coalesce(round(avg(r.score)::numeric,2),0)
    into v_eval_count,v_pass_count,v_avg
  from public.agent_evaluation_results r
  left join public.agent_evaluation_batches b on b.id=r.batch_id
  where r.agent_id=p_agent_id and (r.batch_id is null or b.invalidated_at is null);

  select count(*) into v_gov
  from public.agent_evaluation_results r
  left join public.agent_evaluation_batches b on b.id=r.batch_id
  where r.agent_id=p_agent_id and r.governance_violation=true and (r.batch_id is null or b.invalidated_at is null);

  select count(*) filter(where e.event_type='holdout' and e.outcome_status='successful'),
         count(*) filter(where e.event_type='adversarial' and e.outcome_status='successful'),
         count(*) filter(where e.counts_toward_experience and e.validated_at is not null and e.outcome_status in ('successful','mixed'))
    into v_holdout,v_adversarial,v_exp
  from public.agent_experience_events e
  where e.agent_id=p_agent_id
    and not exists (
      select 1 from public.agent_evaluation_batches b
      where e.source_type='gtm_senior_benchmark'
        and e.source_id like b.id::text || ':%'
        and b.invalidated_at is not null
    );

  v_eligible := v_target_rank=v_current_rank+1
    and v_eval_count>=v_min_evals and v_avg>=v_min_avg and v_exp>=v_min_exp
    and (not v_requires_holdout or v_holdout>=1)
    and (not v_requires_adversarial or v_adversarial>=1)
    and v_gov=0;

  return jsonb_build_object(
    'agent_id',p_agent_id,'organization_id',v_org,'current_level',v_current_level,'target_level',p_target_level,
    'eligible',v_eligible,'evaluation_count',v_eval_count,'pass_count',v_pass_count,'minimum_evaluations',v_min_evals,
    'average_score',v_avg,'minimum_average_score',v_min_avg,
    'holdout_pass_count',v_holdout,'holdout_required',v_requires_holdout,
    'adversarial_pass_count',v_adversarial,'adversarial_required',v_requires_adversarial,
    'validated_experience_count',v_exp,'minimum_validated_experience',v_min_exp,
    'governance_violation_count',v_gov,'governance_clean_required',true,
    'level_sequence_valid',v_target_rank=v_current_rank+1
  );
end $$;

revoke all on function public.agent_level_readiness(uuid,text) from public, anon, authenticated;
grant execute on function public.agent_level_readiness(uuid,text) to service_role;

update public.agent_evaluation_batches
set invalidated_at = coalesce(invalidated_at, now()),
    invalidation_reason = coalesce(invalidation_reason, 'Runtime validity failure: five of six candidate outputs reached the configured 3,500-token ceiling and were judged while visibly truncated. Preserved for audit; excluded from formal readiness.'),
    summary = coalesce(summary,'{}'::jsonb) || jsonb_build_object('benchmark_valid',false,'invalidated_reason','candidate_output_token_cap')
where id = '6e2c0882-8fbc-4b35-aad2-e75edbc7fb8e'::uuid;

commit;
