-- Continuous Program Foundation. NO automatic project conversion or activation.
-- The authoritative project lifecycle remains unchanged until explicitly enabled.
begin;

alter table public.projects add column if not exists lifecycle_kind text not null default 'finite';
alter table public.projects drop constraint if exists projects_lifecycle_kind_check;
alter table public.projects add constraint projects_lifecycle_kind_check
  check (lifecycle_kind in ('finite','campaign','continuous'));

create table if not exists public.continuous_programs (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 project_id uuid not null unique references public.projects(id) on delete cascade,
 seo_site_id uuid references public.agency_seo_sites(id) on delete set null,
 state text not null default 'SETUP'
   check(state in ('SETUP','BASELINE','INITIAL_IMPLEMENTATION','VALIDATION',
                   'MONITORING','OPTIMIZING','WAITING_FOR_DATA','BLOCKED','PAUSED','CANCELLED','ARCHIVED')),
 cadence text not null default 'weekly'
   check(cadence in ('daily','weekly','monthly','quarterly')),
 enabled boolean not null default false,
 last_review_at timestamptz,
 next_review_at timestamptz,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 constraint continuous_program_scheduled_when_enabled check (not enabled or next_review_at is not null)
);

-- Exact organization-scoped link to the existing SEO evidence provider.
alter table public.continuous_programs
  drop constraint if exists continuous_programs_org_site_fk;
alter table public.continuous_programs
  add constraint continuous_programs_org_site_fk
  foreign key (organization_id,seo_site_id)
  references public.agency_seo_sites(organization_id,id);

create table if not exists public.continuous_program_review_cycles (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null references public.organizations(id) on delete cascade,
 program_id uuid not null references public.continuous_programs(id) on delete cascade,
 scheduled_for timestamptz not null,
 started_at timestamptz,
 finished_at timestamptz,
 attempts integer not null default 0 check(attempts between 0 and 3),
 state text not null default 'scheduled'
    check(state in ('scheduled','running','waiting_for_data','awaiting_approval',
                    'completed','failed','cancelled')),
 evidence jsonb not null default '{}'::jsonb,
 summary text,
 last_error text,
 proposal_id uuid references public.project_proposals(id) on delete set null,
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(program_id,scheduled_for)
);

create index if not exists continuous_program_review_due_idx
  on public.continuous_programs(next_review_at) where enabled=true;
create index if not exists continuous_program_cycles_claim_idx
  on public.continuous_program_review_cycles(state,created_at);
create index if not exists continuous_program_cycles_org_idx
  on public.continuous_program_review_cycles(organization_id,program_id,scheduled_for desc);

-- Referential integrity also applies to service-role writes.
create or replace function public.guard_continuous_program_integrity_v1()
returns trigger language plpgsql set search_path=public as $cp$
declare p_org uuid; p_kind text;
begin
 select organization_id,lifecycle_kind into p_org,p_kind from public.projects where id=new.project_id;
 if p_org is distinct from new.organization_id or p_kind is distinct from 'continuous'
 then raise exception 'Continuous program must belong to a continuous project in the same organization'; end if;
 return new;
end $cp$;
drop trigger if exists guard_continuous_program_integrity on public.continuous_programs;
create trigger guard_continuous_program_integrity before insert or update
on public.continuous_programs for each row execute function public.guard_continuous_program_integrity_v1();

create or replace function public.guard_continuous_review_org_v1()
returns trigger language plpgsql set search_path=public as $cp$
begin
 if not exists (select 1 from public.continuous_programs p
                 where p.id=new.program_id and p.organization_id=new.organization_id)
 then raise exception 'Review cycle must belong to its program organization'; end if;
 return new;
end $cp$;
drop trigger if exists guard_continuous_review_org on public.continuous_program_review_cycles;
create trigger guard_continuous_review_org before insert or update
on public.continuous_program_review_cycles for each row execute function public.guard_continuous_review_org_v1();

-- Preserve current completion evaluator for finite/campaign projects; block only opt-in continuous.
create or replace function public.guard_continuous_project_close_v1()
returns trigger language plpgsql set search_path=public as $cp$
begin
 if new.lifecycle_kind='continuous'
 and (new.lifecycle_state='COMPLETED' or new.status='completed')
 then raise exception 'Continuous program cannot be completed; pause or archive explicitly'; end if;
 -- No reclassification of a previously completed project without a managed reconciliation.
 if TG_OP='UPDATE' and new.lifecycle_kind='continuous' and old.lifecycle_kind is distinct from 'continuous'
 and (old.lifecycle_state='COMPLETED' or old.status='completed')
 then raise exception 'Reconcile historical completion before converting project to continuous'; end if;
 return new;
end $cp$;
drop trigger if exists guard_continuous_project_close on public.projects;
create trigger guard_continuous_project_close before insert or update
on public.projects for each row execute function public.guard_continuous_project_close_v1();

alter table public.continuous_programs enable row level security;
alter table public.continuous_program_review_cycles enable row level security;
revoke all on public.continuous_programs from anon,authenticated;
revoke all on public.continuous_program_review_cycles from anon,authenticated;
grant select on public.continuous_programs to authenticated;
grant select on public.continuous_program_review_cycles to authenticated;
grant select,insert,update,delete on public.continuous_programs to service_role;
grant select,insert,update,delete on public.continuous_program_review_cycles to service_role;

drop policy if exists continuous_program_member_read on public.continuous_programs;
create policy continuous_program_member_read on public.continuous_programs
 for select to authenticated using (exists (
  select 1 from public.organization_members m where m.organization_id=continuous_programs.organization_id
    and m.user_id=(select auth.uid())
 ));
drop policy if exists continuous_cycle_member_read on public.continuous_program_review_cycles;
create policy continuous_cycle_member_read on public.continuous_program_review_cycles
 for select to authenticated using (exists (
  select 1 from public.organization_members m
  where m.organization_id=continuous_program_review_cycles.organization_id
    and m.user_id=(select auth.uid())
 ));

-- Called solely by the authorized existing service-role scheduler.
-- Atomic review-intent creation, no AI conclusions and no external effects.
create or replace function public.claim_due_continuous_program_reviews_v1(p_limit integer default 10)
returns table(cycle_id uuid,program_id uuid,project_id uuid,scheduled_for timestamptz)
language plpgsql security invoker set search_path=public as $cp$
declare rec record; new_cycle uuid; next_at timestamptz;
begin
 if p_limit not between 1 and 50 then raise exception 'Invalid claim limit'; end if;
 for rec in
  select c.id,c.organization_id,c.project_id,c.cadence,c.next_review_at
  from public.continuous_programs c
  join public.projects p on p.id=c.project_id and p.organization_id=c.organization_id
  where c.enabled=true and c.next_review_at<=now()
   and c.state in ('BASELINE','INITIAL_IMPLEMENTATION','VALIDATION','MONITORING','OPTIMIZING','WAITING_FOR_DATA')
   and p.lifecycle_kind='continuous'
   and p.lifecycle_state not in ('COMPLETED','CANCELLED','FAILED','ON_HOLD','PAUSED','BLOCKED')
  order by c.next_review_at,c.id
  for update of c skip locked limit p_limit
 loop
  new_cycle:=null;
  insert into public.continuous_program_review_cycles(organization_id,program_id,scheduled_for)
  values(rec.organization_id,rec.id,rec.next_review_at)
  on conflict(program_id,scheduled_for) do nothing returning id into new_cycle;

  -- Advance the calendar one interval; catch-up is bounded by p_limit on each dispatch.
  next_at:=case rec.cadence
   when 'daily' then rec.next_review_at+interval '1 day'
   when 'weekly' then rec.next_review_at+interval '7 days'
   when 'monthly' then rec.next_review_at+interval '1 month'
   else rec.next_review_at+interval '3 months' end;
  update public.continuous_programs
   set next_review_at=next_at,updated_at=now() where id=rec.id;
  if new_cycle is not null then
   cycle_id:=new_cycle;program_id:=rec.id;project_id:=rec.project_id;
   scheduled_for:=rec.next_review_at;return next;
  end if;
 end loop;
end $cp$;

create or replace function public.claim_continuous_review_work_v1(p_limit integer default 5)
returns table(cycle_id uuid,program_id uuid,organization_id uuid)
language plpgsql security invoker set search_path=public as $cp$
declare rec record;
begin
 if p_limit not between 1 and 25 then raise exception 'Invalid claim limit'; end if;
 for rec in
  select cy.id,cy.program_id,cy.organization_id
  from public.continuous_program_review_cycles cy
  join public.continuous_programs p on p.id=cy.program_id and p.organization_id=cy.organization_id
  join public.projects pr on pr.id=p.project_id and pr.organization_id=p.organization_id
  where (cy.state='scheduled' or (cy.state='running' and cy.started_at<now()-interval '30 minutes'))
    and cy.attempts<3 and p.enabled=true and p.state not in ('BLOCKED','PAUSED','CANCELLED','ARCHIVED')
    and pr.lifecycle_kind='continuous'
    and pr.lifecycle_state not in ('COMPLETED','CANCELLED','FAILED','ON_HOLD','PAUSED','BLOCKED')
  order by cy.scheduled_for,cy.id for update of cy skip locked limit p_limit
 loop
  update public.continuous_program_review_cycles
   set state='running',started_at=now(),updated_at=now(),attempts=attempts+1,last_error=null
   where id=rec.id;
  cycle_id:=rec.id;program_id:=rec.program_id;organization_id:=rec.organization_id;return next;
 end loop;
end $cp$;

revoke all on function public.claim_due_continuous_program_reviews_v1(integer) from public,anon,authenticated;
revoke all on function public.claim_continuous_review_work_v1(integer) from public,anon,authenticated;
grant execute on function public.claim_due_continuous_program_reviews_v1(integer) to service_role;
grant execute on function public.claim_continuous_review_work_v1(integer) to service_role;

commit;
