-- STAGING ONLY. Substitute __W03_RUN__ with the executed run namespace.
-- Memberships are activated only inside this rollback-only SQL transaction;
-- quarantined Auth users stay banned. No other connection sees this snapshot.
begin;
create temporary table w03_parent_cases(actor text,target text,surface text,operation text,denied boolean);
grant insert on w03_parent_cases to authenticated;
do $$
declare a record;b record;own_project uuid;own_execution uuid;own_task uuid;own_memory uuid;
 own_agent uuid;own_action uuid;foreign_execution uuid;foreign_agent uuid;foreign_action uuid;op text;denied boolean;n bigint;
begin
 if (select count(*) from organizations where slug like 'w03-synthetic-%-staging-v1-__W03_RUN__')<>3 then raise exception 'Incorrect synthetic run';end if;
 update organization_members set membership_status='active' where organization_id in(select id from organizations where slug like 'w03-synthetic-%-staging-v1-__W03_RUN__');
 for a in select id,slug,owner_user_id from organizations where slug like 'w03-synthetic-%-staging-v1-__W03_RUN__' loop
  select id into strict own_project from projects where organization_id=a.id;
  select id into strict own_execution from project_executions where organization_id=a.id;
  select id into strict own_task from project_task_runs where organization_id=a.id and task_key='W03-synthetic';
  select id into strict own_memory from project_decision_memory where organization_id=a.id and decision like 'W03-SENTINEL-%';
  select id into strict own_agent from agents where organization_id=a.id and name='W03 synthetic disabled agent';
  select id into strict own_action from action_items where organization_id=a.id and title like 'W03-SENTINEL-%';
  perform set_config('request.jwt.claim.sub',a.owner_user_id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',a.owner_user_id,'role','authenticated')::text,true);
  execute 'set local role authenticated';
  update project_decision_memory set decision=decision where id=own_memory;get diagnostics n=row_count;
  if n<>1 then raise exception 'Missing own memory control';end if;
  insert into w03_parent_cases values(a.slug,a.slug,'memory','own-positive',true);
  update project_task_runs set assigned_agent_id=own_agent,action_item_id=own_action where id=own_task;get diagnostics n=row_count;
  if n<>1 then raise exception 'Missing own task control';end if;
  insert into w03_parent_cases values(a.slug,a.slug,'task','own-positive',true);
  execute 'reset role';
  for b in select o.id,o.slug,p.id as project_id from organizations o join projects p on p.organization_id=o.id where o.slug like 'w03-synthetic-%-staging-v1-__W03_RUN__' and o.id<>a.id loop
   select id into strict foreign_execution from project_executions where organization_id=b.id;
   select id into strict foreign_agent from agents where organization_id=b.id and name='W03 synthetic disabled agent';
   select id into strict foreign_action from action_items where organization_id=b.id and title like 'W03-SENTINEL-%';
   execute 'set local role authenticated';
   foreach op in array array['memory-insert','memory-update','task-project-insert','task-project-update','task-execution-insert','task-agent-insert','task-agent-update','task-action-insert','task-action-update'] loop
    denied:=false;
    begin
     case op
      when 'memory-insert' then insert into project_decision_memory(organization_id,project_id,decision,decision_maker_type) values(a.id,b.project_id,'W03 rollback-only forbidden relation','test');
      when 'memory-update' then update project_decision_memory set project_id=b.project_id where id=own_memory;
      when 'task-project-update' then update project_task_runs set project_id=b.project_id where id=own_task;
      when 'task-agent-update' then update project_task_runs set assigned_agent_id=foreign_agent where id=own_task;
      when 'task-action-update' then update project_task_runs set action_item_id=foreign_action where id=own_task;
      else insert into project_task_runs(organization_id,project_id,execution_id,assigned_agent_id,action_item_id,task_key,title,idempotency_key,status)
       values(a.id,case when op='task-project-insert' then b.project_id else own_project end,case when op='task-execution-insert' then foreign_execution else own_execution end,case when op='task-agent-insert' then foreign_agent else own_agent end,case when op='task-action-insert' then foreign_action else own_action end,gen_random_uuid()::text,'W03 rollback-only forbidden relation',gen_random_uuid()::text,'cancelled');
     end case;
    exception when foreign_key_violation then denied:=true;end;
    insert into w03_parent_cases values(a.slug,b.slug,case when op like 'memory%' then 'memory' else 'task' end,op,denied);
   end loop;
   execute 'reset role';
  end loop;
 end loop;
 if (select count(*) from w03_parent_cases)<>60 or exists(select 1 from w03_parent_cases pc where not pc.denied) then raise exception 'W03 parent matrix failed or incomplete';end if;
end $$;
select surface,operation,count(*) as executed,bool_and(denied) as passed from w03_parent_cases group by surface,operation order by surface,operation;
rollback;
