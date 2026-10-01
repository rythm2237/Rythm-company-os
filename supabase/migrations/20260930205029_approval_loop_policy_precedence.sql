-- Human rejection takes precedence over automatic executive-attention delegation.
create or replace function public.guard_project_approval_loop_v1()
returns trigger language plpgsql security definer set search_path=''
as $$
declare v_previous public.approval_requests%rowtype; v_repeat integer;
begin
  if new.project_id is null or new.status not in ('pending','approved') then return new; end if;
  new.request_fingerprint:=public.project_approval_fingerprint_v1(to_jsonb(new));
  -- Serialize competing generators, including independent worker processes.
  perform pg_catalog.pg_advisory_xact_lock(pg_catalog.hashtextextended(
    new.organization_id::text||new.project_id::text||new.request_fingerprint,0));
  select * into v_previous from public.approval_requests a
  where a.organization_id=new.organization_id and a.project_id=new.project_id
    and a.request_fingerprint=new.request_fingerprint and a.status in ('pending','rejected')
  order by a.created_at desc limit 1;
  if not found then return new; end if;

  select count(*)+1 into v_repeat from public.project_activity_events e
  where e.project_id=new.project_id and e.organization_id=new.organization_id
    and e.event_type='approval.loop_blocked'
    and e.metadata->>'proposal_fingerprint'=new.request_fingerprint;
  insert into public.project_activity_events(organization_id,project_id,agent_id,event_type,headline,detail,importance,metadata)
  values(new.organization_id,new.project_id,new.requested_by_agent_id,'approval.loop_blocked',
    'Identical decision request suppressed',
    'The prior decision remains authoritative. Revise the proposal or its scoped context before requesting a new decision.',
    'attention',jsonb_build_object('proposal_fingerprint',new.request_fingerprint,'repeat_count',v_repeat,
      'previous_approval_id',v_previous.id,'previous_status',v_previous.status,
      'last_rejection_at',case when v_previous.status='rejected' then v_previous.resolved_at else null end,
      'responsible_agent_id',new.requested_by_agent_id,'suppressed_subject_id',new.subject_id));
  if new.subject_type='project_proposal' then
    update public.project_proposals set status='needs_revision',updated_at=now()
    where id=new.subject_id and organization_id=new.organization_id and project_id=new.project_id
      and status in ('draft','internal_review','ready_for_executive');
  end if;
  return null;
end;
$$;
revoke all on function public.guard_project_approval_loop_v1() from public,anon,authenticated;
grant execute on function public.guard_project_approval_loop_v1() to service_role;
