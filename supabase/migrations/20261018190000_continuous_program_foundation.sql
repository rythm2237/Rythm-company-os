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
 if new.proposal_id is not null and not exists (
  select 1 from public.project_proposals pp join public.continuous_programs cp on cp.id=new.program_id
   where pp.id=new.proposal_id and pp.organization_id=new.organization_id
    and pp.project_id=cp.project_id)
 then raise exception 'Review proposal must belong to the same organization and project'; end if;
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
 -- Historical project state must be reconciled explicitly before reclassification.
 if TG_OP='UPDATE' then
  if new.lifecycle_kind='continuous' and old.lifecycle_kind is distinct from 'continuous'
     and (old.lifecycle_state='COMPLETED' or old.status='completed')
  then raise exception 'Reconcile historical completion before converting project to continuous'; end if;
  if old.lifecycle_kind='continuous' and new.lifecycle_kind<>'continuous'
     and exists(select 1 from public.continuous_programs where project_id=new.id)
  then raise exception 'Deactivate and retire the continuous program before changing its lifecycle kind'; end if;
 end if;
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


-- Explicit, owner-initiated opt-in; only the privileged server route may invoke this RPC.
-- Does not lift ON_HOLD/BLOCKED status or bypass project governance.
create or replace function public.configure_continuous_program_v1(
 p_project_id uuid,p_organization_id uuid,p_seo_site_id uuid,
 p_cadence text default 'weekly',p_enabled boolean default false
) returns uuid language plpgsql security invoker set search_path=public as $cp$
declare rec record; resulting_id uuid;
begin
 if p_cadence not in ('daily','weekly','monthly','quarterly') then
   raise exception 'Unsupported review cadence'; end if;
 select id,lifecycle_state,status,lifecycle_kind into rec from public.projects
  where id=p_project_id and organization_id=p_organization_id for update;
 if not found then raise exception 'Project not found in organization'; end if;
 if rec.lifecycle_state in ('COMPLETED','CANCELLED','FAILED')
    or rec.status in ('completed','cancelled') then
   raise exception 'A closed project requires governed lifecycle reconciliation before conversion'; end if;
 if p_seo_site_id is not null and not exists (
   select 1 from public.agency_seo_sites where id=p_seo_site_id and organization_id=p_organization_id and active=true
 ) then raise exception 'SEO source does not belong to an active site in this organization'; end if;
 if p_enabled and p_seo_site_id is null then
   raise exception 'Connect an authorized SEO site before enabling review dispatch'; end if;
 if p_enabled and (rec.lifecycle_state in ('ON_HOLD','BLOCKED','PAUSED') or rec.status in ('blocked','on_hold')) then
   raise exception 'Resolve project governance hold before enabling monitoring'; end if;
 update public.projects set lifecycle_kind='continuous'
 where id=p_project_id and organization_id=p_organization_id;
 insert into public.continuous_programs
 (organization_id,project_id,seo_site_id,cadence,enabled,state,next_review_at)
 values (p_organization_id,p_project_id,p_seo_site_id,p_cadence,p_enabled,
   case when rec.lifecycle_state in ('ON_HOLD','BLOCKED','PAUSED') then 'BLOCKED'
        when p_enabled then 'MONITORING' else 'SETUP' end,
   case when p_enabled then now() else null end)
 on conflict(project_id) do update
 set seo_site_id=excluded.seo_site_id,cadence=excluded.cadence,enabled=excluded.enabled,
     state=case when excluded.enabled then 'MONITORING' else public.continuous_programs.state end,
     next_review_at=case when excluded.enabled
       then coalesce(public.continuous_programs.next_review_at,now()) else null end,
     updated_at=now()
 returning id into resulting_id;
 return resulting_id;
end $cp$;
revoke all on function public.configure_continuous_program_v1(uuid,uuid,uuid,text,boolean)
 from public,anon,authenticated;
grant execute on function public.configure_continuous_program_v1(uuid,uuid,uuid,text,boolean) to service_role;


-- Human CEO explicitly submits an evidence-backed draft for executive review.
-- Submission is not approval and never authorizes external execution.
create or replace function public.submit_continuous_proposal_for_approval_v1(
 p_proposal_id uuid,p_organization_id uuid,p_project_id uuid,p_requested_by_user_id uuid
) returns uuid language plpgsql security invoker set search_path=public as $cp$
declare p record; existing_request uuid; request_id uuid;
begin
 if not exists (
   select 1 from public.organization_members om where om.organization_id=p_organization_id
   and om.user_id=p_requested_by_user_id and om.role='owner'
 ) then raise exception 'Owner authorization required'; end if;
 select id,title,executive_summary,risk_level,status,approval_request_id,proposal_type
 into p from public.project_proposals
 where id=p_proposal_id and project_id=p_project_id and organization_id=p_organization_id
   and proposal_type in ('continuous_program_technical_seo_review','continuous_program_persistent_seo_findings')
 for update;
 if not found then raise exception 'Eligible continuous proposal not found'; end if;
 if p.approval_request_id is not null then return p.approval_request_id; end if;
 if p.status<>'draft' then raise exception 'Only unsubmitted draft proposals may enter approval'; end if;
 select ar.id into existing_request from public.approval_requests ar
 where ar.organization_id=p_organization_id and ar.project_id=p_project_id
   and ar.subject_type='project_proposal' and ar.subject_id=p_proposal_id
 order by ar.created_at desc limit 1;
 if existing_request is not null then
   update public.project_proposals set approval_request_id=existing_request,
     status='ready_for_executive',updated_at=now() where id=p_proposal_id;
   return existing_request;
 end if;
 insert into public.approval_requests
 (organization_id,project_id,subject_type,subject_id,title,summary,risk_level,
  requested_by_user_id,status,conditions)
 values (p_organization_id,p_project_id,'project_proposal',p_proposal_id,p.title,
   p.executive_summary,p.risk_level,p_requested_by_user_id,'pending',
   '["Approval authorizes investigation of the recorded evidence only. Site or external changes require separate execution authorization."]'::jsonb)
 returning id into request_id;
 update public.project_proposals
 set approval_request_id=request_id,status='ready_for_executive',updated_at=now()
 where id=p_proposal_id and organization_id=p_organization_id;
 return request_id;
end $cp$;
revoke all on function public.submit_continuous_proposal_for_approval_v1(uuid,uuid,uuid,uuid)
 from public,anon,authenticated;
grant execute on function public.submit_continuous_proposal_for_approval_v1(uuid,uuid,uuid,uuid)
 to service_role;

commit;
