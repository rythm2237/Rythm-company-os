-- RYTHM Project OS: executive attention policy
-- Keep Human CEO authority for material actions while allowing reversible internal project work to proceed autonomously.

alter table public.approval_requests
  add column if not exists attention_tier text not null default 'executive',
  add column if not exists decision_group text not null default 'other',
  add column if not exists auto_resolved_by_policy boolean not null default false,
  add column if not exists delegation_reason text;

alter table public.approval_requests drop constraint if exists approval_requests_attention_tier_check;
alter table public.approval_requests add constraint approval_requests_attention_tier_check
  check (attention_tier in ('delegated','manager','executive','executive_critical'));

create or replace function public.project_approval_decision_group_v1(p_title text,p_summary text)
returns text language sql immutable as $$
  select case
    when lower(coalesce(p_title,'')||' '||coalesce(p_summary,'')) ~ '(access|connect|permission|credential|repository|cms|search console|analytics|property)' then 'access_connections'
    when lower(coalesce(p_title,'')||' '||coalesce(p_summary,'')) ~ '(budget|spend|paid|campaign|ads|media|subscription|purchase)' then 'budget_commercial'
    when lower(coalesce(p_title,'')||' '||coalesce(p_summary,'')) ~ '(legal|contract|compliance|privacy|liability|ip |intellectual property)' then 'legal_risk'
    when lower(coalesce(p_title,'')||' '||coalesce(p_summary,'')) ~ '(production|deploy|publish|delete|destructive|release)' then 'production_change'
    when lower(coalesce(p_title,'')||' '||coalesce(p_summary,'')) ~ '(scope|objective|milestone|strategy|positioning|audience|kpi)' then 'strategy_scope'
    when lower(coalesce(p_title,'')||' '||coalesce(p_summary,'')) ~ '(client|email|message|communication|send)' then 'client_communication'
    else 'other'
  end
$$;

create or replace function public.project_approval_is_delegatable_v1(
  p_subject_type text,
  p_risk text,
  p_title text,
  p_summary text,
  p_conditions jsonb,
  p_execution_tool text,
  p_execution_operation text,
  p_execution_target text
) returns boolean language sql immutable as $$
  select
    p_subject_type='project_task'
    and coalesce(p_risk,'') in ('low','medium','high')
    and coalesce(p_risk,'') <> 'critical'
    and nullif(trim(coalesce(p_execution_tool,'')),'') is null
    and nullif(trim(coalesce(p_execution_operation,'')),'') is null
    and nullif(trim(coalesce(p_execution_target,'')),'') is null
    and coalesce(p_conditions,'[]'::jsonb) @> '["Authorization applies only to this scoped project task."]'::jsonb
    and lower(coalesce(p_title,'')||' '||coalesce(p_summary,'')) !~ '(access|connect|authori[sz]|permission|credential|repository|cms|search console|analytics property|scope|objective|milestone|budget|spend|campaign|client|contract|legal|compliance|production|deploy|delete|publish|external|payment|purchase|subscription)'
$$;

create or replace function public.apply_project_executive_attention_policy_v1()
returns trigger language plpgsql security invoker set search_path=public as $$
begin
  new.decision_group := public.project_approval_decision_group_v1(new.title,new.summary);
  if new.risk_level::text='critical' then
    new.attention_tier := 'executive_critical';
  elsif public.project_approval_is_delegatable_v1(new.subject_type,new.risk_level::text,new.title,new.summary,new.conditions,new.execution_tool,new.execution_operation,new.execution_target) then
    new.attention_tier := 'delegated';
    new.auto_resolved_by_policy := true;
    new.delegation_reason := 'Internal, reversible project work within delegated authority; downstream material side effects remain separately governed.';
    if new.status::text='pending' then
      new.status := 'approved';
      new.response_note := coalesce(new.response_note,'Automatically delegated by Project Executive Attention Policy.');
      new.resolved_at := coalesce(new.resolved_at,now());
    end if;
  else
    new.attention_tier := case when new.risk_level::text='low' then 'manager' else 'executive' end;
  end if;
  return new;
end
$$;

drop trigger if exists trg_project_executive_attention_policy on public.approval_requests;
create trigger trg_project_executive_attention_policy
before insert or update of title,summary,risk_level,status,conditions,execution_tool,execution_operation,execution_target
on public.approval_requests for each row execute function public.apply_project_executive_attention_policy_v1();

create or replace function public.release_auto_delegated_project_task_v1()
returns trigger language plpgsql security invoker set search_path=public as $$
declare a record;
begin
  if new.waiting_on_approval_id is null then return new; end if;
  select status::text as status,auto_resolved_by_policy into a from public.approval_requests where id=new.waiting_on_approval_id;
  if found and a.status='approved' and a.auto_resolved_by_policy then
    new.status := 'queued';
    new.waiting_on_approval_id := null;
    new.error_class := null;
    new.error_message := null;
    new.next_attempt_at := null;
    new.updated_at := now();
  end if;
  return new;
end
$$;

drop trigger if exists trg_release_auto_delegated_project_task on public.project_task_runs;
create trigger trg_release_auto_delegated_project_task
before insert or update of waiting_on_approval_id on public.project_task_runs
for each row execute function public.release_auto_delegated_project_task_v1();

-- Reclassify existing pending approvals and automatically release only safe internal task gates.
update public.approval_requests a
set decision_group=public.project_approval_decision_group_v1(a.title,a.summary),
    attention_tier=case
      when a.risk_level::text='critical' then 'executive_critical'
      when public.project_approval_is_delegatable_v1(a.subject_type,a.risk_level::text,a.title,a.summary,a.conditions,a.execution_tool,a.execution_operation,a.execution_target) then 'delegated'
      when a.risk_level::text='low' then 'manager'
      else 'executive' end,
    auto_resolved_by_policy=case when public.project_approval_is_delegatable_v1(a.subject_type,a.risk_level::text,a.title,a.summary,a.conditions,a.execution_tool,a.execution_operation,a.execution_target) then true else a.auto_resolved_by_policy end,
    delegation_reason=case when public.project_approval_is_delegatable_v1(a.subject_type,a.risk_level::text,a.title,a.summary,a.conditions,a.execution_tool,a.execution_operation,a.execution_target) then 'Internal, reversible project work within delegated authority; downstream material side effects remain separately governed.' else a.delegation_reason end,
    status=case when a.status::text='pending' and public.project_approval_is_delegatable_v1(a.subject_type,a.risk_level::text,a.title,a.summary,a.conditions,a.execution_tool,a.execution_operation,a.execution_target) then 'approved'::public.approval_status else a.status end,
    response_note=case when a.status::text='pending' and public.project_approval_is_delegatable_v1(a.subject_type,a.risk_level::text,a.title,a.summary,a.conditions,a.execution_tool,a.execution_operation,a.execution_target) then coalesce(a.response_note,'Automatically delegated by Project Executive Attention Policy.') else a.response_note end,
    resolved_at=case when a.status::text='pending' and public.project_approval_is_delegatable_v1(a.subject_type,a.risk_level::text,a.title,a.summary,a.conditions,a.execution_tool,a.execution_operation,a.execution_target) then coalesce(a.resolved_at,now()) else a.resolved_at end
where a.status::text='pending';

update public.project_task_runs t
set status='queued',waiting_on_approval_id=null,error_class=null,error_message=null,next_attempt_at=null,updated_at=now()
from public.approval_requests a
where t.waiting_on_approval_id=a.id and a.status::text='approved' and a.auto_resolved_by_policy=true and t.status='waiting_for_approval';

create index if not exists approval_requests_project_attention_idx on public.approval_requests(project_id,status,attention_tier,decision_group,created_at desc);
