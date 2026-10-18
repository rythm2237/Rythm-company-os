-- Continuous Program foundation. Opt-in only: no existing project is reclassified.
begin;

alter table public.projects
  add column if not exists lifecycle_kind text not null default 'finite'
    check (lifecycle_kind in ('finite','campaign','continuous'));

create table if not exists public.continuous_programs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 project_id uuid not null unique references public.projects(id) on delete cascade,
 state text not null default 'SETUP' check(state in
  ('SETUP','BASELINE','INITIAL_IMPLEMENTATION','VALIDATION','MONITORING',
   'OPTIMIZING','WAITING_FOR_DATA','BLOCKED','PAUSED','CANCELLED','ARCHIVED')),
 cadence text not null default 'weekly' check(cadence in ('daily','weekly','monthly','quarterly')),
 enabled boolean not null default false,
 last_review_at timestamptz,
 next_review_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint continuous_program_scheduled_when_enabled check(not enabled or next_review_at is not null),
 constraint continuous_program_org_ref foreign key(organization_id)
  references public.organizations(id)
);

create table if not exists public.continuous_program_review_cycles (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id),
 program_id uuid not null references public.continuous_programs(id) on delete cascade,
 scheduled_for timestamptz not null,
 started_at timestamptz,
 finished_at timestamptz,
 state text not null default 'scheduled' check(state in
 ('scheduled','running','waiting_for_data','awaiting_approval','completed','failed','cancelled')),
 evidence jsonb not null default '{}'::jsonb,
 summary text,
 created_at timestamptz not null default now(),
 unique(program_id,scheduled_for)
);
create index if not exists continuous_program_review_due_idx
 on public.continuous_programs(next_review_at) where enabled=true;
create index if not exists continuous_program_cycles_org_idx
 on public.continuous_program_review_cycles(organization_id,program_id,scheduled_for desc);

create or replace function public.guard_continuous_program_integrity_v1()
returns trigger language plpgsql set search_path=public as $$
declare p_org uuid; p_kind text;
begin
 select organization_id,lifecycle_kind into p_org,p_kind from public.projects where id=new.project_id;
 if p_org is distinct from new.organization_id or p_kind is distinct from 'continuous'
 then raise exception 'Continuous program must reference a continuous project in the same organization'; end if;
 return new;
end $$;
drop trigger if exists guard_continuous_program_integrity on public.continuous_programs;
create trigger guard_continuous_program_integrity before insert or update on public.continuous_programs
 for each row execute function public.guard_continuous_program_integrity_v1();

create or replace function public.guard_continuous_review_org_v1()
returns trigger language plpgsql set search_path=public as $$
begin
 if not exists(select 1 from public.continuous_programs p
   where p.id=new.program_id and p.organization_id=new.organization_id)
 then raise exception 'Cycle program organization mismatch'; end if;
 return new;
end $$;
drop trigger if exists guard_continuous_review_org on public.continuous_program_review_cycles;
create trigger guard_continuous_review_org before insert or update on public.continuous_program_review_cycles
 for each row execute function public.guard_continuous_review_org_v1();

create or replace function public.guard_continuous_project_close_v1()
returns trigger language plpgsql set search_path=public as $$
begin
 if new.lifecycle_kind='continuous'
 and (new.lifecycle_state='COMPLETED' or new.status='completed')
 then raise exception 'Continuous programs cannot use project completed state; archive explicitly';
 end if;
 return new;
end $$;
drop trigger if exists guard_continuous_project_close on public.projects;
create trigger guard_continuous_project_close before insert or update on public.projects
 for each row execute function public.guard_continuous_project_close_v1();

alter table public.continuous_programs enable row level security;
alter table public.continuous_program_review_cycles enable row level security;
-- Read-only for approved members; mutations remain server-controlled.
revoke all on public.continuous_programs from anon,authenticated;
revoke all on public.continuous_program_review_cycles from anon,authenticated;
grant select on public.continuous_programs to authenticated;
grant select on public.continuous_program_review_cycles to authenticated;
drop policy if exists continuous_program_member_read on public.continuous_programs;
create policy continuous_program_member_read on public.continuous_programs for select to authenticated using
 (exists(select 1 from public.organization_members m
 where m.organization_id=continuous_programs.organization_id and m.user_id=(select auth.uid())));
drop policy if exists continuous_cycle_member_read on public.continuous_program_review_cycles;
create policy continuous_cycle_member_read on public.continuous_program_review_cycles for select to authenticated using
 (exists(select 1 from public.organization_members m
 where m.organization_id=continuous_program_review_cycles.organization_id and m.user_id=(select auth.uid())));

commit;
