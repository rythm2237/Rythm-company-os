-- Synthetic-only transaction on the offline hosted-catalog clone. Never run on production.
begin;
insert into public.agent_level_definitions(level_key,display_name,rank_order,description)
 values('associate','Synthetic Associate',1,'Synthetic lookup for isolated schema smoke');
insert into public.project_completion_policies(code,name,is_default)
 values('implementation_standard','Synthetic full-gate completion policy',true);
insert into auth.users(id,email,aud,role) values
 ('00000000-0000-4000-8000-000000001001','w10-clone-owner@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-000000001002','w10-clone-viewer@example.test','authenticated','authenticated'),
 ('00000000-0000-4000-8000-000000001003','w10-clone-foreign@example.test','authenticated','authenticated');
insert into public.organizations(id,name,slug,owner_user_id) values
 ('00000000-0000-4000-8000-000000002001','W10 synthetic clone','w10-synthetic-clone','00000000-0000-4000-8000-000000001001'),
 ('00000000-0000-4000-8000-000000002002','W10 synthetic foreign','w10-synthetic-foreign','00000000-0000-4000-8000-000000001003');
insert into public.organization_members(organization_id,user_id,role,membership_status) values
 ('00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001001','owner','active'),
 ('00000000-0000-4000-8000-000000002001','00000000-0000-4000-8000-000000001002','viewer','active'),
 ('00000000-0000-4000-8000-000000002002','00000000-0000-4000-8000-000000001003','owner','active');
insert into public.organization_entitlements(organization_id,product_code,status,max_active_agents,max_departments,max_projects)
 values('00000000-0000-4000-8000-000000002001','ready_company','active',20,20,20),
 ('00000000-0000-4000-8000-000000002002','ready_company','active',20,20,20);
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000001001';
insert into public.projects(id,organization_id,project_code,name,status,autonomy_mode,primary_manager_user_id,engagement_type)
 values('00000000-0000-4000-8000-000000003001','00000000-0000-4000-8000-000000002001','W10-CLONE','Synthetic hosted-schema smoke','active','approval_required','00000000-0000-4000-8000-000000001001','internal');

set local role authenticated;
set local request.jwt.claim.role='authenticated';
do $$begin
 if not public.is_org_owner('00000000-0000-4000-8000-000000002001') then raise exception 'Owner role positive control failed';end if;
 if not exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000003001') then raise exception 'Owner project positive control failed';end if;
end$$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000001002';
do $$begin
 begin
  perform public.assign_project_specialist_v1('00000000-0000-4000-8000-000000003001',gen_random_uuid(),25);
  raise exception 'Viewer assignment unexpectedly allowed';
 exception when insufficient_privilege then null;end;
end$$;
set local request.jwt.claim.sub='00000000-0000-4000-8000-000000001003';
do $$begin
 if exists(select 1 from public.projects where id='00000000-0000-4000-8000-000000003001') then raise exception 'Foreign Owner project leaked';end if;
 begin
  perform public.assign_project_specialist_v1('00000000-0000-4000-8000-000000003001',gen_random_uuid(),25);
  raise exception 'Foreign assignment unexpectedly allowed';
 exception when insufficient_privilege then null;end;
end$$;

set local role service_role;
set local request.jwt.claim.role='service_role';
set local request.jwt.claim.sub='';
do $$
declare org_id uuid:='00000000-0000-4000-8000-000000002001';project_id uuid:='00000000-0000-4000-8000-000000003001';manager_id uuid:='00000000-0000-4000-8000-000000001001';meeting_id uuid:=gen_random_uuid();action_id uuid:=gen_random_uuid();execution_id uuid:=gen_random_uuid();task_id uuid:=gen_random_uuid();
begin
 if auth.uid() is not null or auth.role()<>'service_role' then raise exception 'Worker must not impersonate Owner';end if;
 insert into public.meetings(id,organization_id,project_id,title,purpose,status,involvement_mode)
 values(meeting_id,org_id,project_id,'Synthetic clone review','Installed hosted schema lifecycle','draft','AUTONOMOUS');
 begin
  update public.meetings set status='running',started_at=now() where id=meeting_id;
  raise exception 'Unleased worker meeting start unexpectedly allowed';
 exception when raise_exception then
  if sqlerrm='Unleased worker meeting start unexpectedly allowed' then raise;end if;
 end;
 insert into public.project_autonomous_meeting_jobs(organization_id,project_id,meeting_id,status,lease_owner,lease_expires_at)
 values(org_id,project_id,meeting_id,'running','w10-hosted-clone',now()+interval '5 minutes');
 update public.meetings set status='running',started_at=now() where id=meeting_id;
 update public.meetings set status='completed',ended_at=now(),minutes='{"executive_summary":"Synthetic clone minutes"}' where id=meeting_id;
 insert into public.project_executions(id,organization_id,project_id,execution_no,status,started_at,started_by_user_id)
 values(execution_id,org_id,project_id,1,'running',now(),manager_id);
 insert into public.action_items(id,organization_id,project_id,title,status,priority)
 values(action_id,org_id,project_id,'Synthetic clone linked action','open',3);
 insert into public.project_task_runs(id,organization_id,project_id,execution_id,action_item_id,task_key,title,status,lease_owner,lease_expires_at,idempotency_key)
 values(task_id,org_id,project_id,execution_id,action_id,'w10-hosted-clone','Synthetic clone task','running','w10-hosted-clone',now()+interval '5 minutes',task_id::text);
 begin
  perform public.complete_project_task_work_v1(task_id,org_id,project_id,'foreign-worker','{}','{}');
  raise exception 'Foreign lease unexpectedly allowed';
 exception when insufficient_privilege then null;end;
 perform public.complete_project_task_work_v1(task_id,org_id,project_id,'w10-hosted-clone',
 '{"summary":"Synthetic clone output","deliverables":[{"title":"KPI","content":"1000 impressions; CTR=5%; conversion=20%"}]}',
 '{"blockers":[],"evidence":[],"verification_result":"not_verified","implementation_executed":false,"outcome_observed":false}');
 if not exists(select 1 from public.action_items a where a.id=action_id and a.status='completed') then raise exception 'Atomic linked action completion failed';end if;
 if not exists(select 1 from public.project_task_runs t where t.id=task_id and t.status='completed' and t.safe_result->>'summary'='Synthetic clone output') then raise exception 'Persisted task output failed';end if;
 begin
  update public.action_items set title='forbidden mutation' where id=action_id;
  raise exception 'Completed action mutated';
 exception when raise_exception then if sqlerrm='Completed action mutated' then raise;end if;end;
 raise notice 'PASS W10 hosted-schema Owner/viewer/foreign RLS, unleased/foreign-worker denials, native meeting lifecycle, persisted atomic task/action output and immutability';
end$$;
rollback;
