-- RYTHM Customer Connection Platform — Phase 2
-- Durable AI-assisted setup sessions, Human takeover, rollout controls and safe observability.

begin;

alter table public.integration_providers
  add column if not exists ai_setup_enabled boolean not null default false,
  add column if not exists ai_setup_rollout text not null default 'off',
  add column if not exists browser_playbook_ready boolean not null default false;

alter table public.integration_providers drop constraint if exists integration_providers_ai_setup_rollout_check;
alter table public.integration_providers add constraint integration_providers_ai_setup_rollout_check
  check (ai_setup_rollout in ('off','internal','beta','limited','general'));

-- Start conservatively. OAuth-first providers can use the orchestrator internally while
-- Computer Use remains dependent on a separately configured secure cloud-browser runtime.
update public.integration_providers
set ai_setup_enabled = provider_key in ('google_search_console','google_analytics','google_workspace','microsoft_365'),
    ai_setup_rollout = case when provider_key in ('google_search_console','google_analytics','google_workspace','microsoft_365') then 'internal' else 'off' end,
    browser_playbook_ready = provider_key in ('google_search_console','google_analytics','google_workspace','microsoft_365','github','vercel','supabase','cloudflare'),
    updated_at = now()
where provider_key in ('google_search_console','google_analytics','google_workspace','microsoft_365','github','vercel','supabase','cloudflare');

alter table public.integration_setup_sessions
  add column if not exists setup_plan_id text,
  add column if not exists setup_plan_version integer not null default 1,
  add column if not exists session_status text not null default 'queued',
  add column if not exists automation_mode text not null default 'manual',
  add column if not exists browser_session_id text,
  add column if not exists control_mode text not null default 'ai',
  add column if not exists agent_id text not null default 'connection_setup_agent',
  add column if not exists started_by_user_id uuid references auth.users(id) on delete set null,
  add column if not exists started_at timestamptz,
  add column if not exists last_heartbeat_at timestamptz,
  add column if not exists paused_at timestamptz,
  add column if not exists completed_at timestamptz,
  add column if not exists failed_at timestamptz,
  add column if not exists failure_reason text,
  add column if not exists requires_user_action boolean not null default false,
  add column if not exists user_action_type text,
  add column if not exists expires_at timestamptz,
  add column if not exists attempt_count integer not null default 0,
  add column if not exists next_attempt_at timestamptz,
  add column if not exists correlation_id uuid not null default gen_random_uuid(),
  add column if not exists metadata jsonb not null default '{}'::jsonb;

update public.integration_setup_sessions
set started_by_user_id = coalesce(started_by_user_id, created_by_user_id),
    session_status = case
      when step_status='completed' then 'completed'
      when step_status='failed' then 'failed'
      when step_status='waiting_for_user' then 'waiting_for_user'
      when step_status='in_progress' then 'running'
      else 'queued' end,
    automation_mode = coalesce(nullif(automation_mode,''),'manual'),
    last_heartbeat_at = coalesce(last_heartbeat_at, updated_at, created_at),
    started_at = coalesce(started_at, created_at)
where started_by_user_id is null or session_status='queued';

alter table public.integration_setup_sessions drop constraint if exists integration_setup_sessions_session_status_check;
alter table public.integration_setup_sessions add constraint integration_setup_sessions_session_status_check check (session_status in (
  'queued','starting','running','waiting_for_user','waiting_for_provider','verifying','paused','retrying','completed','failed','cancelled','expired'
));
alter table public.integration_setup_sessions drop constraint if exists integration_setup_sessions_automation_mode_check;
alter table public.integration_setup_sessions add constraint integration_setup_sessions_automation_mode_check check (automation_mode in ('manual','ai'));
alter table public.integration_setup_sessions drop constraint if exists integration_setup_sessions_control_mode_check;
alter table public.integration_setup_sessions add constraint integration_setup_sessions_control_mode_check check (control_mode in ('ai','human','paused'));
alter table public.integration_setup_sessions drop constraint if exists integration_setup_sessions_user_action_type_check;
alter table public.integration_setup_sessions add constraint integration_setup_sessions_user_action_type_check check (user_action_type is null or user_action_type in (
  'LOGIN_REQUIRED','MFA_REQUIRED','CAPTCHA_REQUIRED','CONSENT_REQUIRED','ADMIN_CONSENT_REQUIRED','RESOURCE_CHOICE_REQUIRED','BUSINESS_DECISION_REQUIRED','PAYMENT_REQUIRED','LEGAL_ACCEPTANCE_REQUIRED'
));

create index if not exists integration_setup_sessions_dispatch_idx
  on public.integration_setup_sessions(session_status,next_attempt_at,last_heartbeat_at)
  where automation_mode='ai' and session_status in ('queued','starting','running','waiting_for_provider','verifying','retrying');
create index if not exists integration_setup_sessions_org_project_idx
  on public.integration_setup_sessions(organization_id,project_id,connection_id,created_at desc);

create table if not exists public.connection_setup_session_events (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  project_id uuid references public.projects(id) on delete cascade,
  connection_id uuid references public.organization_integrations(id) on delete cascade,
  session_id uuid not null references public.integration_setup_sessions(id) on delete cascade,
  provider_key text not null references public.integration_providers(provider_key),
  event_type text not null,
  actor_type text not null default 'agent' check(actor_type in ('agent','user','system','provider')),
  actor_user_id uuid references auth.users(id) on delete set null,
  step_key text,
  status text,
  safe_message text,
  current_domain text,
  result_code text,
  correlation_id uuid,
  metadata jsonb not null default '{}'::jsonb,
  created_at timestamptz not null default now()
);
alter table public.connection_setup_session_events enable row level security;
drop policy if exists connection_setup_session_events_member_read on public.connection_setup_session_events;
create policy connection_setup_session_events_member_read on public.connection_setup_session_events
  for select to authenticated using (public.is_org_member(organization_id));
drop policy if exists connection_setup_session_events_owner_write on public.connection_setup_session_events;
create policy connection_setup_session_events_owner_write on public.connection_setup_session_events
  for all to authenticated using (public.is_org_owner(organization_id)) with check (public.is_org_owner(organization_id));
create index if not exists connection_setup_session_events_session_idx on public.connection_setup_session_events(session_id,created_at desc);

-- Prevent accidental secret-shaped telemetry. This is a coarse defense in depth rule; the
-- application also emits allowlisted metadata only.
create or replace function public.reject_connection_setup_secret_metadata_v1()
returns trigger language plpgsql security invoker set search_path=public as $$
declare serialized text;
begin
  serialized := lower(coalesce(new.metadata,'{}'::jsonb)::text || ' ' || coalesce(new.safe_message,''));
  if serialized ~ '(password|passcode|otp|mfa[_ -]?code|access[_ -]?token|refresh[_ -]?token|client[_ -]?secret|private[_ -]?key)' then
    raise exception 'Sensitive connection setup telemetry is forbidden';
  end if;
  return new;
end $$;
drop trigger if exists trg_reject_connection_setup_secret_metadata on public.connection_setup_session_events;
create trigger trg_reject_connection_setup_secret_metadata before insert or update on public.connection_setup_session_events
for each row execute function public.reject_connection_setup_secret_metadata_v1();

-- Atomically claim one runnable AI setup session. service_role only; customer sessions are
-- controlled through tenant-scoped application routes.
create or replace function public.claim_connection_setup_session_v1()
returns setof public.integration_setup_sessions
language plpgsql security definer set search_path=public as $$
declare selected_id uuid;
begin
  select s.id into selected_id
  from public.integration_setup_sessions s
  join public.integration_providers p on p.provider_key=s.provider_key
  where s.automation_mode='ai'
    and s.session_status in ('queued','starting','running','waiting_for_provider','verifying','retrying')
    and (s.next_attempt_at is null or s.next_attempt_at<=now())
    and (s.expires_at is null or s.expires_at>now())
    and p.ai_setup_enabled=true and p.ai_setup_rollout<>'off'
  order by case s.session_status when 'running' then 0 when 'verifying' then 1 when 'retrying' then 2 else 3 end, s.updated_at asc
  for update skip locked
  limit 1;
  if selected_id is null then return; end if;
  update public.integration_setup_sessions
  set session_status=case when session_status='queued' then 'starting' else session_status end,
      last_heartbeat_at=now(), attempt_count=attempt_count+1, updated_at=now()
  where id=selected_id;
  return query select * from public.integration_setup_sessions where id=selected_id;
end $$;
revoke all on function public.claim_connection_setup_session_v1() from public,anon,authenticated;
grant execute on function public.claim_connection_setup_session_v1() to service_role;

create or replace function public.expire_stale_connection_setup_sessions_v1()
returns integer language plpgsql security definer set search_path=public as $$
declare changed integer;
begin
  update public.integration_setup_sessions
  set session_status='expired', control_mode='paused', failure_reason='Session expired safely.', updated_at=now()
  where session_status not in ('completed','failed','cancelled','expired')
    and (
      (expires_at is not null and expires_at<=now()) or
      (session_status='waiting_for_user' and updated_at<now()-interval '24 hours') or
      (session_status in ('starting','running','waiting_for_provider','verifying','retrying') and last_heartbeat_at<now()-interval '20 minutes')
    );
  get diagnostics changed = row_count;
  return changed;
end $$;
revoke all on function public.expire_stale_connection_setup_sessions_v1() from public,anon,authenticated;
grant execute on function public.expire_stale_connection_setup_sessions_v1() to service_role;

commit;
