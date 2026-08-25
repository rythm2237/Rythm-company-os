-- Phase 0 security baseline: least-privilege SECURITY DEFINER grants and RLS-aware view semantics.
-- This migration is intentionally narrow and preserves authenticated production callers.
-- Version matches the migration identifier recorded by Supabase Production.

create or replace function public.agent_professional_index(p_level text, p_score integer)
returns integer
language sql
immutable
strict
set search_path=''
as $$
  select (d.rank_order::integer * 1000) + greatest(0, least(coalesce(p_score,0),100))
  from public.agent_level_definitions d
  where d.level_key=p_level;
$$;

alter view public.agent_professional_standing set (security_invoker = true);
revoke all on table public.agent_professional_standing from public, anon;
revoke insert, update, delete, truncate, references, trigger on table public.agent_professional_standing from authenticated, service_role;
grant select on table public.agent_professional_standing to authenticated, service_role;

revoke all on function public.agent_professional_index(text,integer) from public, anon;
grant execute on function public.agent_professional_index(text,integer) to authenticated, service_role;

-- Agent creation remains an authenticated Human CEO/Owner RPC. Anonymous API access is not intended.
revoke all on function public.create_agent_v2(uuid,text,text,text,text,text,text,uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) from public, anon;
grant execute on function public.create_agent_v2(uuid,text,text,text,text,text,text,uuid,uuid,smallint,text,text,text,jsonb,jsonb,jsonb,jsonb,jsonb) to authenticated, service_role;

-- Trigger-only function. PostgreSQL invokes it through trg_agent_asset_profile; API roles never call it directly.
create or replace function public.ensure_agent_asset_profile()
returns trigger
language plpgsql
security definer
set search_path=''
as $$
begin
  insert into public.agent_asset_profiles(agent_id,organization_id,canonical_name,provenance)
  values(new.id,new.organization_id,coalesce(nullif(new.display_name,''),new.name),jsonb_build_object('origin','agent_registry','agent_code',new.agent_code))
  on conflict (agent_id) do nothing;
  return new;
end $$;
revoke all on function public.ensure_agent_asset_profile() from public, anon, authenticated, service_role;

create or replace function public.verify_agent_mastery_v1(target_agent_id uuid)
returns jsonb
language plpgsql
security definer
set search_path=''
as $$
declare
  v_agent public.agents%rowtype;
  v_benchmark public.role_mastery_benchmarks%rowtype;
  v_foundation_count integer;
  v_expected_count integer;
  v_matched_count integer;
  v_active_spec_count integer;
  v_service_role boolean := coalesce(auth.jwt()->>'role','')='service_role';
begin
  if auth.uid() is null and not v_service_role then raise exception 'Authentication required'; end if;
  select * into v_agent from public.agents where id=target_agent_id;
  if v_agent.id is null then raise exception 'Agent not found'; end if;
  if not v_service_role and not public.is_org_owner(v_agent.organization_id) then raise exception 'not_authorized'; end if;

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

create or replace function public.search_company_knowledge_for_meeting_v1(target_org_id uuid, query_text text, max_results integer default 8)
returns table(knowledge_id uuid,title text,category text,confidentiality text,chunk_index integer,content text,rank real)
language plpgsql
security definer
set search_path=''
as $$
declare v_service_role boolean := coalesce(auth.jwt()->>'role','')='service_role';
begin
  if auth.uid() is null and not v_service_role then raise exception 'Authentication required'; end if;
  if not v_service_role and not public.is_org_member(target_org_id) then raise exception 'not_authorized'; end if;
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
language plpgsql
security definer
set search_path=''
as $$
declare
  v_agent public.agents%rowtype;
  v_department text;
  v_service_role boolean := coalesce(auth.jwt()->>'role','')='service_role';
begin
  if auth.uid() is null and not v_service_role then raise exception 'Authentication required'; end if;
  if not v_service_role and not public.is_org_member(target_org_id) then raise exception 'not_authorized'; end if;
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

revoke all on function public.verify_agent_mastery_v1(uuid) from public, anon;
revoke all on function public.search_company_knowledge_for_meeting_v1(uuid,text,integer) from public, anon;
revoke all on function public.search_company_knowledge_for_agent_v1(uuid,uuid,text,integer) from public, anon;
grant execute on function public.verify_agent_mastery_v1(uuid) to authenticated, service_role;
grant execute on function public.search_company_knowledge_for_meeting_v1(uuid,text,integer) to authenticated, service_role;
grant execute on function public.search_company_knowledge_for_agent_v1(uuid,uuid,text,integer) to authenticated, service_role;

-- Prevent accidental PUBLIC execution on future functions created by the migration owner.
alter default privileges in schema public revoke execute on functions from public;
