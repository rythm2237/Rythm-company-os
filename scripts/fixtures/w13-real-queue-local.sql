-- W13: fully disposable real SQL queue and idempotency regression.
-- Run only inside W10's unlinked local Supabase container AFTER its synthetic
-- seed owner and schema replay have completed. All fixture writes roll back.
-- Never run against hosted staging/production.
begin;
set local role service_role;
set local request.jwt.claim.role = 'service_role';
set local statement_timeout = '30s';
do $w13$
declare
 v_org uuid; v_manager uuid;
 v_project uuid := gen_random_uuid();
 v_execution uuid := gen_random_uuid();
 v_task uuid := gen_random_uuid();
 v_first integer; v_second integer; v_early integer; v_due integer;
 v_existing integer; v_attempts integer;
 v_key text := 'w13-local-claim-' || gen_random_uuid()::text;
begin
 select organization_id,user_id into v_org,v_manager
 from public.organization_members
 where role='owner' and membership_status='active' limit 1;
 if v_org is null or v_manager is null then
   raise exception 'W13: missing synthetic seed Owner';
 end if;
 if exists (
   select 1 from public.project_task_runs tr
   join public.project_executions pe on pe.id=tr.execution_id
   join public.projects p on p.id=tr.project_id
   where tr.status in('queued','retrying')
   and pe.status in('queued','running') and p.status='active'
 ) then
   raise exception 'W13 fixture isolation failure: existing claimable tasks';
 end if;

 -- Honor W10's mandatory accountable manager and organization membership gate.
 perform set_config('request.jwt.claim.sub',v_manager::text,true);
 insert into public.projects(
   id,organization_id,project_code,name,status,autonomy_mode,
   primary_manager_user_id,engagement_type
 ) values (
   v_project,v_org,'W13-LOCAL-'||left(v_project::text,8),
   'W13 disposable worker queue','active','approval_required',v_manager,'internal'
 );
 perform set_config('request.jwt.claim.sub','',true);
 if auth.uid() is not null or auth.role()<>'service_role' then
   raise exception 'W13 queue worker must have only service role';
 end if;
 insert into public.project_executions(id,organization_id,project_id,execution_no,status,started_at,started_by_user_id)
 values(v_execution,v_org,v_project,1,'running',now(),v_manager);
 insert into public.project_task_runs(
   id,organization_id,project_id,execution_id,task_key,title,
   idempotency_key,status,priority
 ) values (
   v_task,v_org,v_project,v_execution,'w13-internal',
   'W13 local claim regression',v_key,'queued',1
 );

 select count(*) into v_first from public.claim_project_task_runs_v1('w13-local-worker-one',1,240);
 select count(*) into v_second from public.claim_project_task_runs_v1('w13-local-worker-two',1,240);
 if v_first<>1 or v_second<>0 then
   raise exception 'W13 duplicate claim: first %, second %',v_first,v_second;
 end if;

 update public.project_task_runs set status='retrying',lease_owner=null,
   lease_expires_at=null,next_attempt_at=now()+interval '1 hour'
 where id=v_task;
 select count(*) into v_early from public.claim_project_task_runs_v1('w13-local-worker-early',1,240);
 if v_early<>0 then raise exception 'W13 retried a task before its due time';end if;
 update public.project_task_runs set next_attempt_at=now()-interval '1 second' where id=v_task;
 select count(*) into v_due from public.claim_project_task_runs_v1('w13-local-worker-due',1,240);
 if v_due<>1 then raise exception 'W13 due retry not claimable';end if;

 insert into public.project_task_runs(
   organization_id,project_id,execution_id,task_key,title,idempotency_key,status
 ) values (
   v_org,v_project,v_execution,'w13-duplicate-attempt',
   'Synthetic attempted duplicate',v_key,'queued'
 ) on conflict do nothing;
 select count(*),max(attempt_count) into v_existing,v_attempts
 from public.project_task_runs where idempotency_key=v_key;
 if v_existing<>1 or v_attempts<>2 then
   raise exception 'W13 idempotency regression failed: records %, attempts %',v_existing,v_attempts;
 end if;
 raise notice 'W13 PASS: real disposable PostgreSQL task claim=1, overlap=0, early retry=0, due retry=1, idempotency rows=1, attempts=2. No external actions; rollback.';
end $w13$;
rollback;
