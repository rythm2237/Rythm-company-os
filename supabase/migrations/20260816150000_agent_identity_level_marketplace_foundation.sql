create table if not exists public.agent_level_definitions (
  level_key text primary key,
  display_name text not null,
  rank_order smallint not null unique check (rank_order between 1 and 20),
  min_completed_evaluations integer not null default 0 check (min_completed_evaluations >= 0),
  min_average_score smallint not null default 0 check (min_average_score between 0 and 100),
  min_validated_experience_events integer not null default 0 check (min_validated_experience_events >= 0),
  requires_holdout boolean not null default false,
  requires_cross_functional boolean not null default false,
  requirements jsonb not null default '{}'::jsonb,
  description text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

insert into public.agent_level_definitions(level_key,display_name,rank_order,min_completed_evaluations,min_average_score,min_validated_experience_events,requires_holdout,requires_cross_functional,requirements,description)
values
('associate','Associate',1,0,0,0,false,false,'{"governance_pass_required":true}'::jsonb,'Configured AI Agent with defined role and governance boundaries; professional capability not yet independently established.'),
('specialist','Specialist',2,1,85,0,false,false,'{"governance_pass_required":true,"domain_benchmark_required":true}'::jsonb,'Demonstrated strong capability on at least one domain-specific benchmark with clean governance behavior.'),
('senior','Senior',3,3,85,3,true,false,'{"governance_pass_required":true,"consistency_required":true}'::jsonb,'Demonstrated repeatable domain performance across independent scenarios plus validated work evidence.'),
('lead','Lead',4,5,87,10,true,true,'{"governance_pass_required":true,"coordination_required":true}'::jsonb,'Demonstrated sustained expert performance, cross-functional coordination and validated operational outcomes.'),
('principal','Principal',5,8,90,25,true,true,'{"governance_pass_required":true,"adversarial_required":true,"novel_problem_required":true}'::jsonb,'Demonstrated exceptional specialist depth on holdout/adversarial work with a substantial validated experience record.'),
('director','Director',6,12,90,50,true,true,'{"governance_pass_required":true,"board_level_required":true,"multi_agent_leadership_required":true,"sustained_outcomes_required":true}'::jsonb,'Demonstrated executive-grade judgment, leadership/orchestration and sustained validated outcomes. Director is an evidence threshold, not a cosmetic title.')
on conflict (level_key) do update set display_name=excluded.display_name, rank_order=excluded.rank_order, min_completed_evaluations=excluded.min_completed_evaluations, min_average_score=excluded.min_average_score, min_validated_experience_events=excluded.min_validated_experience_events, requires_holdout=excluded.requires_holdout, requires_cross_functional=excluded.requires_cross_functional, requirements=excluded.requirements, description=excluded.description, updated_at=now();

create table if not exists public.agent_asset_profiles (
  agent_id uuid primary key references public.agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  canonical_name text not null,
  identity_version integer not null default 1 check (identity_version > 0),
  identity_locked boolean not null default true,
  current_level text not null default 'associate' references public.agent_level_definitions(level_key),
  level_score smallint check (level_score between 0 and 100),
  certification_status text not null default 'unverified' check (certification_status in ('unverified','provisional','verified','expired','revoked')),
  certification_version text,
  certified_at timestamptz,
  certified_by uuid references auth.users(id) on delete set null,
  last_assessed_at timestamptz,
  valuation_status text not null default 'not_ready' check (valuation_status in ('not_ready','data_building','eligible','valued')),
  valuation_readiness_score smallint not null default 0 check (valuation_readiness_score between 0 and 100),
  marketplace_eligible boolean not null default false,
  provenance jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_asset_profiles_org_idx on public.agent_asset_profiles(organization_id);
create index if not exists agent_asset_profiles_level_idx on public.agent_asset_profiles(current_level, certification_status);

create table if not exists public.agent_experience_events (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  event_type text not null check (event_type in ('benchmark','holdout','adversarial','task','project','meeting','decision_support','customer_outcome','training_validation')),
  source_type text,
  source_id text,
  outcome_status text not null default 'recorded' check (outcome_status in ('recorded','successful','mixed','failed','invalidated')),
  quality_score smallint check (quality_score between 0 and 100),
  counts_toward_experience boolean not null default false,
  evidence jsonb not null default '{}'::jsonb,
  occurred_at timestamptz not null default now(),
  validated_at timestamptz,
  validated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now()
);
create index if not exists agent_experience_events_agent_idx on public.agent_experience_events(agent_id, occurred_at desc);

create table if not exists public.agent_certification_requests (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  requested_by uuid not null references auth.users(id) on delete restrict,
  requested_level text references public.agent_level_definitions(level_key),
  status text not null default 'pending' check (status in ('pending','in_review','approved','rejected','cancelled')),
  evidence_snapshot jsonb not null default '{}'::jsonb,
  reviewer_id uuid references auth.users(id) on delete set null,
  final_level text references public.agent_level_definitions(level_key),
  final_score smallint check (final_score between 0 and 100),
  decision_reason text,
  requested_at timestamptz not null default now(),
  reviewed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create index if not exists agent_certification_requests_org_idx on public.agent_certification_requests(organization_id,status,requested_at desc);

create table if not exists public.agent_level_history (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  level_key text not null references public.agent_level_definitions(level_key),
  level_score smallint check (level_score between 0 and 100),
  certification_status text not null,
  assessment_basis jsonb not null default '{}'::jsonb,
  effective_at timestamptz not null default now(),
  superseded_at timestamptz,
  created_at timestamptz not null default now()
);
create index if not exists agent_level_history_agent_idx on public.agent_level_history(agent_id,effective_at desc);

create table if not exists public.agent_valuation_snapshots (
  id uuid primary key default gen_random_uuid(),
  agent_id uuid not null references public.agents(id) on delete cascade,
  organization_id uuid not null references public.organizations(id) on delete cascade,
  level_key text not null references public.agent_level_definitions(level_key),
  level_score smallint not null check (level_score between 0 and 100),
  experience_score smallint not null default 0 check (experience_score between 0 and 100),
  reliability_score smallint not null default 0 check (reliability_score between 0 and 100),
  governance_score smallint not null default 0 check (governance_score between 0 and 100),
  demand_score smallint not null default 0 check (demand_score between 0 and 100),
  valuation_index numeric(10,2),
  currency text,
  indicative_value numeric(14,2),
  methodology_version text not null default 'foundation-v1',
  status text not null default 'insufficient_evidence' check (status in ('insufficient_evidence','indicative','reviewed','certified')),
  evidence jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
create index if not exists agent_valuation_snapshots_agent_idx on public.agent_valuation_snapshots(agent_id,created_at desc);

create or replace function public.ensure_agent_asset_profile() returns trigger language plpgsql security definer set search_path=public as $$
begin
  insert into public.agent_asset_profiles(agent_id,organization_id,canonical_name,provenance)
  values(new.id,new.organization_id,coalesce(nullif(new.display_name,''),new.name),jsonb_build_object('origin','agent_registry','agent_code',new.agent_code))
  on conflict (agent_id) do nothing;
  return new;
end $$;
drop trigger if exists trg_agent_asset_profile on public.agents;
create trigger trg_agent_asset_profile after insert on public.agents for each row execute function public.ensure_agent_asset_profile();

insert into public.agent_asset_profiles(agent_id,organization_id,canonical_name,provenance)
select id,organization_id,coalesce(nullif(display_name,''),name),jsonb_build_object('origin','legacy_registry','agent_code',agent_code) from public.agents
on conflict (agent_id) do nothing;

update public.agents set display_name = case agent_code
 when 'A-101' then 'Daniel Hart' when 'A-102' then 'Noah Bennett' when 'A-103' then 'Lea Fischer' when 'A-104' then 'Mira Kovacs'
 when 'A-105' then 'Elias Reed' when 'A-106' then 'Clara Weiss' when 'B-001' then 'Avery Morgan' when 'T-001' then 'Rowan Clarke' else display_name end, updated_at=now()
where agent_code in ('A-101','A-102','A-103','A-104','A-105','A-106','B-001','T-001') and organization_id in (select id from public.organizations where upper(trim(name))='RYTHM');

with latest as (
 select distinct on (r.agent_code) r.agent_code,r.score,r.verdict,r.governance_violation,b.completed_at,b.id as batch_id
 from public.agent_evaluation_results r join public.agent_evaluation_batches b on b.id=r.batch_id where b.status='completed'
 order by r.agent_code,b.completed_at desc
)
update public.agent_asset_profiles p set
 canonical_name = case a.agent_code when 'A-101' then 'Daniel Hart' when 'A-102' then 'Noah Bennett' when 'A-103' then 'Lea Fischer' when 'A-104' then 'Mira Kovacs' when 'A-105' then 'Elias Reed' when 'A-106' then 'Clara Weiss' when 'B-001' then 'Avery Morgan' when 'T-001' then 'Rowan Clarke' else p.canonical_name end,
 current_level='specialist', level_score=l.score,
 certification_status=case when l.verdict='PASS' and not l.governance_violation and l.score>=85 then 'verified' else 'provisional' end,
 certification_version='level-framework-v1', certified_at=case when l.verdict='PASS' and not l.governance_violation and l.score>=85 then l.completed_at else null end,
 last_assessed_at=l.completed_at, valuation_status='data_building', valuation_readiness_score=20, marketplace_eligible=false,
 provenance=p.provenance || jsonb_build_object('canonical_identity','RYTHM','latest_benchmark_batch',l.batch_id,'level_basis','One domain benchmark establishes Specialist only; higher levels require independent evaluations and validated experience.'), updated_at=now()
from public.agents a join latest l on l.agent_code=a.agent_code
where p.agent_id=a.id and a.organization_id in (select id from public.organizations where upper(trim(name))='RYTHM');

insert into public.agent_experience_events(agent_id,organization_id,event_type,source_type,source_id,outcome_status,quality_score,counts_toward_experience,evidence,occurred_at,validated_at)
select a.id,a.organization_id,'benchmark','agent_evaluation_batch',b.id::text,'successful',r.score,false,jsonb_build_object('verdict',r.verdict,'governance_violation',r.governance_violation,'note','Benchmark evidence; does not count as validated real-world experience.'),b.completed_at,b.completed_at
from public.agent_evaluation_results r join public.agent_evaluation_batches b on b.id=r.batch_id join public.agents a on a.agent_code=r.agent_code and a.organization_id=b.organization_id
where b.status='completed' and b.completed_at=(select max(b2.completed_at) from public.agent_evaluation_batches b2 where b2.organization_id=b.organization_id and b2.status='completed')
and not exists(select 1 from public.agent_experience_events e where e.agent_id=a.id and e.source_type='agent_evaluation_batch' and e.source_id=b.id::text);

insert into public.agent_level_history(agent_id,organization_id,level_key,level_score,certification_status,assessment_basis)
select p.agent_id,p.organization_id,p.current_level,p.level_score,p.certification_status,jsonb_build_object('framework','level-framework-v1','reason','Current evidence supports Specialist: one independent domain benchmark >=85 with no governance violation. Senior+ requires additional holdout evaluations and validated operational experience.')
from public.agent_asset_profiles p join public.agents a on a.id=p.agent_id
where a.agent_code in ('A-101','A-102','A-103','A-104','A-105','A-106','B-001','T-001') and a.organization_id in (select id from public.organizations where upper(trim(name))='RYTHM')
and not exists(select 1 from public.agent_level_history h where h.agent_id=p.agent_id and h.level_key=p.current_level and h.level_score is not distinct from p.level_score);

alter table public.agent_level_definitions enable row level security;
alter table public.agent_asset_profiles enable row level security;
alter table public.agent_experience_events enable row level security;
alter table public.agent_certification_requests enable row level security;
alter table public.agent_level_history enable row level security;
alter table public.agent_valuation_snapshots enable row level security;

create policy "authenticated_read_level_definitions" on public.agent_level_definitions for select to authenticated using (true);
create policy "members_read_asset_profiles" on public.agent_asset_profiles for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=agent_asset_profiles.organization_id and m.user_id=auth.uid()));
create policy "members_read_experience" on public.agent_experience_events for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=agent_experience_events.organization_id and m.user_id=auth.uid()));
create policy "owners_request_certification" on public.agent_certification_requests for insert to authenticated with check (requested_by=auth.uid() and exists(select 1 from public.organization_members m where m.organization_id=agent_certification_requests.organization_id and m.user_id=auth.uid() and m.role='owner'));
create policy "members_read_certification_requests" on public.agent_certification_requests for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=agent_certification_requests.organization_id and m.user_id=auth.uid()));
create policy "members_read_level_history" on public.agent_level_history for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=agent_level_history.organization_id and m.user_id=auth.uid()));
create policy "members_read_valuation" on public.agent_valuation_snapshots for select to authenticated using (exists(select 1 from public.organization_members m where m.organization_id=agent_valuation_snapshots.organization_id and m.user_id=auth.uid()));
