-- RYTHM Company OS — Master-level professional competency + Company Library foundation
-- Additive/backward-compatible. "Master-level" is an internal capability benchmark, not an academic credential.

alter table public.agents
  add column if not exists professional_competency_level text not null default 'foundation',
  add column if not exists mastery_status text not null default 'pending',
  add column if not exists mastery_benchmark_version text,
  add column if not exists mastery_verified_at timestamptz,
  add column if not exists mastery_basis jsonb not null default '{}'::jsonb;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='agents_professional_competency_level_check') then
    alter table public.agents add constraint agents_professional_competency_level_check check (professional_competency_level in ('foundation','advanced','master'));
  end if;
  if not exists (select 1 from pg_constraint where conname='agents_mastery_status_check') then
    alter table public.agents add constraint agents_mastery_status_check check (mastery_status in ('pending','verified','failed'));
  end if;
end $$;

create table if not exists public.role_mastery_benchmarks (
  id uuid primary key default gen_random_uuid(),
  role_family text not null,
  benchmark_key text not null,
  title text not null,
  version text not null,
  level_label text not null default 'Master-level Professional Competency Benchmark',
  required_competencies text[] not null default '{}',
  required_methods text[] not null default '{}',
  required_qa_rules text[] not null default '{}',
  requires_role_specific_specialization boolean not null default false,
  notes text,
  last_verified_at timestamptz not null default now(),
  next_review_at timestamptz,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique(role_family, benchmark_key, version)
);

alter table public.role_mastery_benchmarks enable row level security;
drop policy if exists role_mastery_benchmarks_authenticated_read on public.role_mastery_benchmarks;
create policy role_mastery_benchmarks_authenticated_read on public.role_mastery_benchmarks for select to authenticated using (active=true);
revoke insert, update, delete, truncate on public.role_mastery_benchmarks from anon, authenticated;
grant select on public.role_mastery_benchmarks to authenticated;

create table if not exists public.agent_mastery_assessments (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  agent_id uuid not null references public.agents(id) on delete cascade,
  benchmark_id uuid not null references public.role_mastery_benchmarks(id),
  status text not null check (status in ('verified','failed')),
  professional_level text not null check (professional_level in ('advanced','master')),
  evidence jsonb not null default '{}'::jsonb,
  assessed_at timestamptz not null default now(),
  unique(agent_id, benchmark_id)
);
create index if not exists agent_mastery_assessments_org_agent_idx on public.agent_mastery_assessments(organization_id,agent_id);
alter table public.agent_mastery_assessments enable row level security;
drop policy if exists agent_mastery_assessments_org_read on public.agent_mastery_assessments;
create policy agent_mastery_assessments_org_read on public.agent_mastery_assessments for select to authenticated using (public.is_org_member(organization_id));
revoke insert, update, delete, truncate on public.agent_mastery_assessments from anon, authenticated;
grant select on public.agent_mastery_assessments to authenticated;

insert into public.knowledge_source_registry
(id,source_name,publisher,base_domain,canonical_url,source_type,authority_level,allowed_role_families,allowed_topics,freshness_class,enabled,notes,last_verified_at,next_review_at)
values
('50000000-0000-0000-0000-000000000001','Executive Core Qualifications','U.S. Office of Personnel Management','opm.gov','https://www.opm.gov/policy-data-oversight/senior-executive-service/executive-core-qualifications/','government','primary',array['general'],array['executive leadership','strategic thinking','resource management','results','people leadership'],'moderate',true,'Used as an executive competency reference; RYTHM does not represent Agents as U.S. federal executives.',now(),now()+interval '90 days'),
('50000000-0000-0000-0000-000000000002','Strategic Management I','MIT OpenCourseWare','ocw.mit.edu','https://ocw.mit.edu/courses/15-902-strategic-management-i-fall-2006/','university','high',array['general'],array['strategic management','corporate strategy','competitive positioning','value creation'],'stable',true,'Graduate-level strategy reference used for competency coverage, not an academic credential.',now(),now()+interval '365 days'),
('50000000-0000-0000-0000-000000000003','Analysis Function Standard','UK Government Analysis Function','analysisfunction.civilservice.gov.uk','https://analysisfunction.civilservice.gov.uk/policy-store/government-functional-standard-analysis/','government','primary',array['analytics'],array['analysis','research','evidence','quality assurance','decision support'],'moderate',true,'Professional analysis standard used for research/intelligence competency coverage.',now(),now()+interval '90 days'),
('50000000-0000-0000-0000-000000000004','AI Risk Management Framework','National Institute of Standards and Technology','nist.gov','https://www.nist.gov/itl/ai-risk-management-framework','government','primary',array['technology'],array['AI risk','testing','evaluation','validation','trustworthiness','governance'],'moderate',true,'Primary AI assurance and risk-management reference.',now(),now()+interval '60 days'),
('50000000-0000-0000-0000-000000000005','NIST AI Resource Center','National Institute of Standards and Technology','airc.nist.gov','https://airc.nist.gov/','government','primary',array['technology'],array['AI TEVV','testing','evaluation','verification','validation'],'moderate',true,'Operational AI TEVV reference.',now(),now()+interval '60 days')
on conflict (canonical_url) do update set
  source_name=excluded.source_name,publisher=excluded.publisher,base_domain=excluded.base_domain,source_type=excluded.source_type,
  authority_level=excluded.authority_level,allowed_role_families=excluded.allowed_role_families,allowed_topics=excluded.allowed_topics,
  freshness_class=excluded.freshness_class,enabled=true,notes=excluded.notes,last_verified_at=excluded.last_verified_at,next_review_at=excluded.next_review_at,updated_at=now();

insert into public.role_specializations
(id,role_family,specialization_key,title,version,knowledge_content,source_ids,qa_rules,freshness_class,last_verified_at,next_review_at,active)
values
('40000000-0000-0000-0000-000000000016','general','executive_orchestration','Executive Orchestration & AI Chief of Staff','1',
 '[{"domain":"executive orchestration","competencies":["translate CEO intent into prioritized operating questions","coordinate specialist agents without erasing dissent","separate decision, delegation, escalation and information needs","manage executive cadence, dependencies and follow-through"]},{"domain":"executive judgement","methods":["decision framing","option comparison","owner/deadline assignment","assumption and risk register","pre-mortem","executive synthesis"]},{"domain":"leadership quality","principles":["results orientation","resource discipline","strategic thinking","people and coalition awareness","clear accountability"]}]'::jsonb,
 array['50000000-0000-0000-0000-000000000001'::uuid],
 '["preserve independent specialist disagreement before synthesis","never substitute Agent authority for Human CEO authority","state decision owner, assumptions, trade-offs and next actions","do not invent company facts or commitments"]'::jsonb,
 'moderate',now(),now()+interval '90 days',true),
('40000000-0000-0000-0000-000000000017','general','strategy_corporate_development','Strategy & Corporate Development','1',
 '[{"domain":"strategy formulation","competencies":["industry and competitive analysis","customer value proposition","capability and resource analysis","corporate versus business strategy","strategic option design"]},{"domain":"corporate development","methods":["strategic fit assessment","scenario analysis","value creation logic","portfolio logic","assumption testing","implementation roadmap"]},{"domain":"execution","principles":["link strategy to measurable outcomes","distinguish durable advantage from short-term performance","test strategic coherence across market, capabilities, economics and organization"]}]'::jsonb,
 array['50000000-0000-0000-0000-000000000002'::uuid],
 '["show alternatives before recommendation","identify assumptions and disconfirming evidence","separate corporate, business and functional strategy","connect recommendations to value creation and implementation"]'::jsonb,
 'stable',now(),now()+interval '365 days',true),
('40000000-0000-0000-0000-000000000018','analytics','research_intelligence','Research & Intelligence','1',
 '[{"domain":"research design","competencies":["translate decision questions into research questions","source evaluation","evidence triangulation","quantitative and qualitative reasoning","uncertainty communication"]},{"domain":"intelligence analysis","methods":["hypothesis generation","alternative explanations","confidence grading","source provenance","gap analysis","bias checks"]},{"domain":"decision support","principles":["make analytical limitations explicit","distinguish observation from inference","retain traceability from conclusion to evidence"]}]'::jsonb,
 array['50000000-0000-0000-0000-000000000003'::uuid],
 '["cite or identify provenance for material factual claims","label evidence, inference and assumption separately","report uncertainty and missing evidence","test at least one plausible alternative explanation for consequential conclusions"]'::jsonb,
 'moderate',now(),now()+interval '90 days',true),
('40000000-0000-0000-0000-000000000019','technology','ai_runtime_assurance','AI Runtime Assurance & Systems Validation','1',
 '[{"domain":"AI assurance","competencies":["risk identification across the AI lifecycle","test design","evaluation criteria","verification and validation","runtime failure analysis","trustworthiness assessment"]},{"domain":"TEVV","methods":["test-evaluate-verify-validate","risk-based test prioritization","adversarial and edge-case testing","regression checks","observability review","incident evidence capture"]},{"domain":"governance","principles":["govern, map, measure and manage AI risks","separate model quality from system safety","treat tool use, permissions and external actions as distinct control surfaces"]}]'::jsonb,
 array['50000000-0000-0000-0000-000000000004'::uuid,'50000000-0000-0000-0000-000000000005'::uuid],
 '["reproduce failures before declaring a fix","test both expected success and fail-closed behavior","record test conditions, observed result and residual risk","never infer production safety from a single successful run"]'::jsonb,
 'moderate',now(),now()+interval '60 days',true)
on conflict (id) do update set role_family=excluded.role_family,specialization_key=excluded.specialization_key,title=excluded.title,version=excluded.version,
 knowledge_content=excluded.knowledge_content,source_ids=excluded.source_ids,qa_rules=excluded.qa_rules,freshness_class=excluded.freshness_class,
 last_verified_at=excluded.last_verified_at,next_review_at=excluded.next_review_at,active=true,updated_at=now();

insert into public.role_mastery_benchmarks
(id,role_family,benchmark_key,title,version,required_competencies,required_methods,required_qa_rules,requires_role_specific_specialization,notes,last_verified_at,next_review_at,active)
values
('60000000-0000-0000-0000-000000000001','design','design_mastery','Design Mastery','1',array['visual hierarchy','layout and composition','typography','color and contrast','accessibility','brand fidelity'],array['design critique','responsive review','visual QA'],array['safe margins','readability','identity fidelity'],false,'Internal professional competency benchmark; not an academic degree.',now(),now()+interval '180 days',true),
('60000000-0000-0000-0000-000000000002','marketing','marketing_mastery','Marketing Mastery','1',array['audience and positioning','channel strategy','measurement','experimentation','message-market fit'],array['campaign planning','funnel analysis','measurement design'],array['claim accuracy','measurement integrity'],false,'Internal professional competency benchmark; not an academic degree.',now(),now()+interval '90 days',true),
('60000000-0000-0000-0000-000000000003','analytics','analytics_mastery','Analytics Mastery','1',array['problem framing','evidence quality','quantitative reasoning','uncertainty','decision support'],array['structured analysis','validation','scenario analysis'],array['traceability','assumption labeling','reconciliation checks'],false,'Internal professional competency benchmark; not an academic degree.',now(),now()+interval '180 days',true),
('60000000-0000-0000-0000-000000000004','legal','legal_mastery','Legal & Regulatory Mastery','1',array['issue spotting','jurisdiction awareness','source hierarchy','risk classification','escalation'],array['legal issue analysis','control mapping','current-law verification'],array['no invented legal authority','material claims require authoritative support'],false,'Internal professional competency benchmark; not legal qualification or authority to practice law.',now(),now()+interval '30 days',true),
('60000000-0000-0000-0000-000000000005','technology','technology_mastery','Technology & AI Systems Mastery','1',array['systems reasoning','security and reliability','testing','failure analysis','technical governance'],array['test design','root cause analysis','regression validation'],array['reproducibility','fail-closed verification'],false,'Internal professional competency benchmark; not an academic degree or certification.',now(),now()+interval '60 days',true),
('60000000-0000-0000-0000-000000000006','general','general_role_mastery','Role-specific Executive/Professional Mastery','1',array['professional judgement','structured problem solving','decision communication','risk awareness'],array['decision framing','option analysis','quality review'],array['role boundary','uncertainty disclosure'],true,'General-family Agents require a trusted role-specific specialization before Master-level can be verified. Internal benchmark only.',now(),now()+interval '180 days',true)
on conflict (id) do update set title=excluded.title,version=excluded.version,required_competencies=excluded.required_competencies,required_methods=excluded.required_methods,
 required_qa_rules=excluded.required_qa_rules,requires_role_specific_specialization=excluded.requires_role_specific_specialization,notes=excluded.notes,
 last_verified_at=excluded.last_verified_at,next_review_at=excluded.next_review_at,active=true,updated_at=now();

create or replace function public.verify_agent_mastery_v1(target_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path='public'
as $$
declare
  v_agent public.agents%rowtype;
  v_benchmark public.role_mastery_benchmarks%rowtype;
  v_foundation_count integer;
  v_expected_count integer;
  v_matched_count integer;
  v_active_spec_count integer;
begin
  select * into v_agent from public.agents where id=target_agent_id;
  if v_agent.id is null then raise exception 'Agent not found'; end if;
  if not public.is_org_owner(v_agent.organization_id) and current_user not in ('postgres','service_role','supabase_admin') then raise exception 'not_authorized'; end if;

  select * into v_benchmark from public.role_mastery_benchmarks
   where role_family=v_agent.role_family and active=true order by last_verified_at desc limit 1;
  if v_benchmark.id is null then
    update public.agents set professional_competency_level='advanced',mastery_status='failed',mastery_verified_at=null,updated_at=now() where id=v_agent.id;
    raise exception 'Master-level benchmark is unavailable for role family %', coalesce(v_agent.role_family,'unknown');
  end if;

  select count(*) into v_foundation_count from public.agent_role_foundation_bindings b
   join public.role_foundations f on f.id=b.role_foundation_id
   where b.organization_id=v_agent.organization_id and b.agent_id=v_agent.id and b.status='active' and f.status in ('validated','active');
  if v_foundation_count<1 then raise exception 'Verified professional foundation is required for Master-level competency'; end if;

  v_expected_count := coalesce(array_length(v_agent.specializations,1),0);
  select count(*) into v_active_spec_count from public.agent_specialization_bindings b
   join public.role_specializations s on s.id=b.specialization_id and s.active=true
   where b.organization_id=v_agent.organization_id and b.agent_id=v_agent.id and b.status='active';

  select count(distinct s.specialization_key) into v_matched_count
  from public.agent_specialization_bindings b join public.role_specializations s on s.id=b.specialization_id and s.active=true
  where b.organization_id=v_agent.organization_id and b.agent_id=v_agent.id and b.status='active'
    and (v_expected_count=0 or s.specialization_key=any(v_agent.specializations));

  if v_expected_count>0 and v_matched_count<v_expected_count then
    update public.agents set professional_competency_level='advanced',mastery_status='failed',mastery_verified_at=null,updated_at=now() where id=v_agent.id;
    raise exception 'All declared role specializations must be actively bound before Master-level verification';
  end if;
  if v_benchmark.requires_role_specific_specialization and v_active_spec_count<1 then
    update public.agents set professional_competency_level='advanced',mastery_status='failed',mastery_verified_at=null,updated_at=now() where id=v_agent.id;
    raise exception 'A trusted role-specific specialization is required before Master-level verification';
  end if;

  insert into public.agent_mastery_assessments(organization_id,agent_id,benchmark_id,status,professional_level,evidence,assessed_at)
  values(v_agent.organization_id,v_agent.id,v_benchmark.id,'verified','master',jsonb_build_object(
    'benchmark_label',v_benchmark.level_label,'benchmark_version',v_benchmark.version,'foundation_bound',true,
    'declared_specializations',v_agent.specializations,'active_specialization_count',v_active_spec_count,
    'academic_degree_claim',false,'company_knowledge_separate',true),now())
  on conflict(agent_id,benchmark_id) do update set status='verified',professional_level='master',evidence=excluded.evidence,assessed_at=now();

  update public.agents set professional_competency_level='master',mastery_status='verified',mastery_benchmark_version=v_benchmark.version,
    mastery_verified_at=now(),mastery_basis=jsonb_build_object('benchmark_id',v_benchmark.id,'label',v_benchmark.level_label,'academic_degree_claim',false),updated_at=now()
  where id=v_agent.id;

  insert into public.agent_knowledge_provisioning_events(organization_id,agent_id,event_type,role_family,canonical_role,metadata)
  values(v_agent.organization_id,v_agent.id,'mastery_verified',v_agent.role_family,v_agent.canonical_role,
    jsonb_build_object('benchmark_id',v_benchmark.id,'version',v_benchmark.version,'level','master','academic_degree_claim',false));

  return jsonb_build_object('status','verified','professional_level','master','benchmark',v_benchmark.title,'version',v_benchmark.version,'academic_degree_claim',false);
end $$;
revoke all on function public.verify_agent_mastery_v1(uuid) from public;
grant execute on function public.verify_agent_mastery_v1(uuid) to authenticated, service_role;

alter table public.company_knowledge
  add column if not exists ingestion_status text not null default 'ready',
  add column if not exists source_filename text,
  add column if not exists file_size_bytes bigint,
  add column if not exists content_hash text,
  add column if not exists summary text,
  add column if not exists extracted_at timestamptz,
  add column if not exists chunk_count integer not null default 0,
  add column if not exists last_ingestion_error text;

do $$ begin
  if not exists (select 1 from pg_constraint where conname='company_knowledge_ingestion_status_check') then
    alter table public.company_knowledge add constraint company_knowledge_ingestion_status_check check (ingestion_status in ('uploaded','processing','ready','failed'));
  end if;
  if not exists (select 1 from pg_constraint where conname='company_knowledge_file_size_check') then
    alter table public.company_knowledge add constraint company_knowledge_file_size_check check (file_size_bytes is null or (file_size_bytes>=0 and file_size_bytes<=15728640));
  end if;
end $$;

create table if not exists public.company_knowledge_chunks (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  knowledge_id uuid not null references public.company_knowledge(id) on delete cascade,
  chunk_index integer not null,
  content text not null,
  metadata jsonb not null default '{}'::jsonb,
  search_vector tsvector generated always as (to_tsvector('simple',coalesce(content,''))) stored,
  created_at timestamptz not null default now(),
  unique(knowledge_id,chunk_index)
);
create index if not exists company_knowledge_chunks_org_knowledge_idx on public.company_knowledge_chunks(organization_id,knowledge_id,chunk_index);
create index if not exists company_knowledge_chunks_search_idx on public.company_knowledge_chunks using gin(search_vector);
alter table public.company_knowledge_chunks enable row level security;
drop policy if exists company_knowledge_chunks_owner_read on public.company_knowledge_chunks;
create policy company_knowledge_chunks_owner_read on public.company_knowledge_chunks for select to authenticated using (public.is_org_owner(organization_id));
drop policy if exists company_knowledge_chunks_owner_write on public.company_knowledge_chunks;
create policy company_knowledge_chunks_owner_write on public.company_knowledge_chunks for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
grant select,insert,update,delete on public.company_knowledge_chunks to authenticated;

create or replace function public.search_company_knowledge_for_meeting_v1(target_org_id uuid, query_text text, max_results integer default 8)
returns table(knowledge_id uuid,title text,category text,confidentiality text,chunk_index integer,content text,rank real)
language plpgsql security definer set search_path='public'
as $$
begin
  if not public.is_org_member(target_org_id) and current_user not in ('postgres','service_role','supabase_admin') then raise exception 'not_authorized'; end if;
  return query
  select k.id,k.title,k.category,k.confidentiality,c.chunk_index,c.content,
    case when nullif(trim(coalesce(query_text,'')),'') is null then 0::real else ts_rank(c.search_vector,plainto_tsquery('simple',query_text)) end as rank
  from public.company_knowledge_chunks c join public.company_knowledge k on k.id=c.knowledge_id and k.organization_id=c.organization_id
  where c.organization_id=target_org_id and k.status='active' and k.ingestion_status='ready' and k.confidentiality in ('public','internal')
    and (nullif(trim(coalesce(query_text,'')),'') is null or c.search_vector @@ plainto_tsquery('simple',query_text))
  order by rank desc,c.created_at desc limit greatest(1,least(coalesce(max_results,8),20));
end $$;

create or replace function public.search_company_knowledge_for_agent_v1(target_org_id uuid,target_agent_id uuid,query_text text,max_results integer default 8)
returns table(knowledge_id uuid,title text,category text,confidentiality text,chunk_index integer,content text,rank real)
language plpgsql security definer set search_path='public'
as $$
declare v_agent public.agents%rowtype; v_department text;
begin
  if not public.is_org_member(target_org_id) and current_user not in ('postgres','service_role','supabase_admin') then raise exception 'not_authorized'; end if;
  select * into v_agent from public.agents where id=target_agent_id and organization_id=target_org_id;
  if v_agent.id is null or not v_agent.company_knowledge_connected then return; end if;
  select name into v_department from public.departments where id=v_agent.department_id and organization_id=target_org_id;
  return query
  select k.id,k.title,k.category,k.confidentiality,c.chunk_index,c.content,
    case when nullif(trim(coalesce(query_text,'')),'') is null then 0::real else ts_rank(c.search_vector,plainto_tsquery('simple',query_text)) end as rank
  from public.company_knowledge_chunks c join public.company_knowledge k on k.id=c.knowledge_id and k.organization_id=c.organization_id
  where c.organization_id=target_org_id and k.status='active' and k.ingestion_status='ready'
    and (nullif(trim(coalesce(query_text,'')),'') is null or c.search_vector @@ plainto_tsquery('simple',query_text))
    and (
      k.confidentiality in ('public','internal')
      or (
        k.confidentiality in ('confidential','restricted')
        and (
          (coalesce(array_length(k.allowed_departments,1),0)>0 and exists(select 1 from unnest(k.allowed_departments) d where lower(d)=lower(coalesce(v_department,''))))
          or (coalesce(array_length(k.allowed_role_keywords,1),0)>0 and exists(select 1 from unnest(k.allowed_role_keywords) r where lower(v_agent.role_title) like '%'||lower(r)||'%' or lower(coalesce(v_agent.canonical_role,'')) like '%'||lower(r)||'%'))
        )
      )
    )
  order by rank desc,c.created_at desc limit greatest(1,least(coalesce(max_results,8),20));
end $$;
revoke all on function public.search_company_knowledge_for_meeting_v1(uuid,text,integer) from public;
revoke all on function public.search_company_knowledge_for_agent_v1(uuid,uuid,text,integer) from public;
grant execute on function public.search_company_knowledge_for_meeting_v1(uuid,text,integer) to authenticated,service_role;
grant execute on function public.search_company_knowledge_for_agent_v1(uuid,uuid,text,integer) to authenticated,service_role;

comment on table public.role_mastery_benchmarks is 'Internal competency benchmarks. Master-level is a RYTHM professional benchmark, never an academic credential.';
comment on table public.company_knowledge_chunks is 'Tenant-scoped extracted Company Library chunks. Never copied into global professional foundations.';
