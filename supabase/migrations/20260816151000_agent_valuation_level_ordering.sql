create or replace function public.agent_professional_index(p_level text, p_score integer)
returns integer
language sql
immutable
strict
as $$
  select (d.rank_order::integer * 1000) + greatest(0, least(coalesce(p_score,0),100))
  from public.agent_level_definitions d
  where d.level_key=p_level;
$$;

comment on function public.agent_professional_index(text,integer) is 'Non-monetary ordering index. Level rank dominates in-level score: e.g. Senior 80 > Specialist 96. Must not be presented as a market price.';

create or replace view public.agent_professional_standing as
select
  p.agent_id,
  p.organization_id,
  p.canonical_name,
  p.current_level,
  d.display_name as level_display_name,
  d.rank_order,
  p.level_score,
  public.agent_professional_index(p.current_level,coalesce(p.level_score,0)) as professional_index,
  p.certification_status,
  p.valuation_status,
  p.valuation_readiness_score,
  p.marketplace_eligible,
  p.last_assessed_at
from public.agent_asset_profiles p
join public.agent_level_definitions d on d.level_key=p.current_level;
