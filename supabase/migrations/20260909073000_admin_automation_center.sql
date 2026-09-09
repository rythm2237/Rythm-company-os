-- RYTHM Company OS — platform Admin Studio / Automation Center
-- Platform administration is deliberately separate from tenant-owner authorization.

create table if not exists public.platform_admins (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null default 'platform_admin' check (role in ('platform_admin','platform_owner')),
  enabled boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_tasks (
  id uuid primary key default gen_random_uuid(),
  slug text not null unique,
  name text not null,
  description text not null default '',
  category text not null default 'operations',
  handler_key text not null,
  enabled boolean not null default true,
  schedule_mode text not null default 'manual' check (schedule_mode in ('manual','daily','weekly','monthly','cron')),
  cron_expression text,
  timezone text not null default 'Europe/Budapest',
  next_run_at timestamptz,
  last_run_at timestamptz,
  timeout_seconds integer not null default 120 check (timeout_seconds between 5 and 900),
  max_retries integer not null default 1 check (max_retries between 0 and 5),
  risk_level text not null default 'low' check (risk_level in ('low','medium','high','critical')),
  requires_approval boolean not null default false,
  configuration_status text not null default 'ready' check (configuration_status in ('ready','needs_configuration','blocked')),
  config jsonb not null default '{}'::jsonb,
  created_by uuid references auth.users(id) on delete set null,
  updated_by uuid references auth.users(id) on delete set null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists public.automation_task_runs (
  id uuid primary key default gen_random_uuid(),
  task_id uuid not null references public.automation_tasks(id) on delete cascade,
  trigger_type text not null check (trigger_type in ('manual','scheduled','system')),
  status text not null default 'queued' check (status in ('queued','running','succeeded','failed','cancelled','skipped')),
  correlation_id uuid not null default gen_random_uuid(),
  initiated_by uuid references auth.users(id) on delete set null,
  started_at timestamptz,
  finished_at timestamptz,
  duration_ms integer,
  summary text,
  output jsonb not null default '{}'::jsonb,
  error_message text,
  attempt integer not null default 1,
  created_at timestamptz not null default now()
);

create unique index if not exists automation_task_runs_active_task_unique
  on public.automation_task_runs(task_id)
  where status in ('queued','running');
create index if not exists automation_tasks_due_idx on public.automation_tasks(enabled, next_run_at) where enabled = true;
create index if not exists automation_task_runs_task_created_idx on public.automation_task_runs(task_id, created_at desc);
create index if not exists automation_task_runs_status_created_idx on public.automation_task_runs(status, created_at desc);

alter table public.platform_admins enable row level security;
alter table public.automation_tasks enable row level security;
alter table public.automation_task_runs enable row level security;

create or replace function public.is_platform_admin(p_user_id uuid default auth.uid())
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1 from public.platform_admins pa
    where pa.user_id = p_user_id and pa.enabled = true
  );
$$;

revoke all on function public.is_platform_admin(uuid) from public, anon;
grant execute on function public.is_platform_admin(uuid) to authenticated, service_role;

insert into public.platform_admins(user_id, role)
select distinct om.user_id, 'platform_owner'
from public.organization_members om
join public.organizations o on o.id = om.organization_id
where o.slug = 'rythm' and om.role = 'owner'
on conflict (user_id) do nothing;

create policy platform_admins_admin_read on public.platform_admins
for select to authenticated using (public.is_platform_admin((select auth.uid())));
create policy automation_tasks_admin_all on public.automation_tasks
for all to authenticated using (public.is_platform_admin((select auth.uid())))
with check (public.is_platform_admin((select auth.uid())));
create policy automation_task_runs_admin_all on public.automation_task_runs
for all to authenticated using (public.is_platform_admin((select auth.uid())))
with check (public.is_platform_admin((select auth.uid())));

revoke all on table public.platform_admins, public.automation_tasks, public.automation_task_runs from public, anon, authenticated;
grant select on table public.platform_admins to authenticated;
grant select, insert, update, delete on table public.automation_tasks to authenticated;
grant select, insert, update, delete on table public.automation_task_runs to authenticated;
grant all on table public.platform_admins, public.automation_tasks, public.automation_task_runs to service_role;

insert into public.automation_tasks(slug,name,description,category,handler_key,schedule_mode,next_run_at,risk_level,configuration_status,config)
values
('system-health','System Health','Database and canonical production availability checks.','platform','system_health','daily',date_trunc('day', now()) + interval '1 day 06 hours','low','ready','{}'),
('seo-site-health','SEO / GEO / AEO Site Health','Checks canonical production, robots, sitemap and key public pages.','search','seo_site_health','weekly',date_trunc('week', now()) + interval '1 week 1 day 06 hours','low','ready','{"key_paths":["/","/product","/faq","/docs","/ai-company-operating-system","/ai-workforce-software"]}'),
('ai-usage-cost','AI Usage & Cost','Aggregates recent AI routing telemetry, latency, errors and recorded model cost.','ai','ai_usage_cost','weekly',date_trunc('week', now()) + interval '1 week 1 day 07 hours','low','ready','{"window_days":7}'),
('core-web-vitals','Core Web Vitals Field Data','Checks field-data availability when a CrUX/PageSpeed API credential is configured.','performance','core_web_vitals','monthly',date_trunc('month', now()) + interval '1 month 1 day 06 hours','low','needs_configuration','{"required_env":"GOOGLE_PAGESPEED_API_KEY"}'),
('search-index-monitoring','Search Index Monitoring','Collects Google Search Console evidence when Search Console credentials are configured.','search','search_index_monitoring','weekly',date_trunc('week', now()) + interval '1 week 2 days 06 hours','low','needs_configuration','{"required_integration":"google_search_console"}'),
('authority-monitoring','Authority / Backlink Monitoring','Collects explicit referring-domain/backlink evidence from configured authority providers.','search','authority_monitoring','monthly',date_trunc('month', now()) + interval '1 month 2 days 06 hours','low','needs_configuration','{"required_integration":"backlink_provider"}'),
('security-health','Security Health','Runs internal security posture checks and records exceptions for admin review.','security','security_health','weekly',date_trunc('week', now()) + interval '1 week 3 days 06 hours','medium','ready','{}')
on conflict (slug) do nothing;

comment on table public.platform_admins is 'Platform-level RYTHM administrators. Separate from tenant organization owner roles.';
comment on table public.automation_tasks is 'Allowlisted platform automation definitions; handler_key maps to server-side code and never stores executable code.';
comment on table public.automation_task_runs is 'Operational run history for manual and scheduled Admin Automation Center executions.';
