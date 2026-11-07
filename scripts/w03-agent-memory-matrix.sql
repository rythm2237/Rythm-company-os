-- STAGING ONLY. __W03_RUN__ must identify an active synthetic W03 run.
-- Metadata-only attachment fixtures; physical file tests are separate.
begin;
insert into agent_level_definitions(level_key,display_name,rank_order,requirements,description)
 values('associate','Associate',1,'{"governance_pass_required":true}','Configured AI Agent with defined role and governance boundaries; professional capability not yet independently established.') on conflict(level_key) do nothing;
create temporary table w03_agent_fixtures(organization_id uuid,owner_id uuid,agent_id uuid,file_id uuid,memory_id uuid);
create temporary table w03_agent_cases(operation text,surface text,passed boolean);
grant insert on w03_agent_cases to authenticated;
do $$
declare u record;f record;own record;surface text;op text;allowed boolean;denied boolean;n bigint;
begin
 if (select count(*) from organization_members where organization_id in(select id from organizations where slug like 'w03-synthetic-%-staging-v1-__W03_RUN__') and membership_status='active')<>20 then raise exception 'Active synthetic run required';end if;
 insert into w03_agent_fixtures select id,owner_user_id,gen_random_uuid(),gen_random_uuid(),gen_random_uuid() from organizations where slug like 'w03-synthetic-%-staging-v1-__W03_RUN__';
 if (select count(*) from w03_agent_fixtures)<>3 then raise exception 'Incorrect agent fixture scope';end if;
 insert into agents(id,organization_id,agent_code,name,role_title,purpose,enabled,agent_status)
  select agent_id,organization_id,'W03-ROLLBACK-'||agent_id,'W03 rollback-only agent','Synthetic boundary fixture','No provider or execution',false,'paused' from w03_agent_fixtures;
 insert into agent_attachments(id,organization_id,agent_id,uploaded_by,filename,size_bytes,storage_path)
  select file_id,organization_id,agent_id,owner_id,'W03 rollback-only metadata.txt',0,organization_id||'/'||agent_id||'/'||file_id from w03_agent_fixtures;
 insert into agent_memories(id,organization_id,agent_id,source_attachment_id,title,content,created_by)
  select memory_id,organization_id,agent_id,file_id,'W03 rollback-only memory','Synthetic private memory',owner_id from w03_agent_fixtures;
 for u in select id,email from auth.users where raw_user_meta_data->>'w03_fixture'='w03-v1' and email like '%-__W03_RUN__@example.test' loop
  select * into own from w03_agent_fixtures where owner_id=u.id;
  for f in select * from w03_agent_fixtures loop
   allowed:=exists(select 1 from organization_members where organization_id=f.organization_id and user_id=u.id and membership_status='active');
   perform set_config('request.jwt.claim.sub',u.id::text,true);
   perform set_config('request.jwt.claims',json_build_object('sub',u.id,'role','authenticated')::text,true);
   execute 'set local role authenticated';
   foreach surface in array array['memory','attachment'] loop
    if surface='memory' then select count(*) into n from agent_memories where id=f.memory_id;
    else select count(*) into n from agent_attachments where id=f.file_id;end if;
    insert into w03_agent_cases values(case when allowed then 'own-READ' else 'foreign-READ' end,surface,n=case when allowed then 1 else 0 end);
    if not allowed then
     denied:=false;
     begin
      if surface='memory' then insert into agent_memories(organization_id,agent_id,title,content,created_by) values(f.organization_id,f.agent_id,'W03 forbidden','Synthetic',u.id);
      else insert into agent_attachments(organization_id,agent_id,uploaded_by,filename,size_bytes,storage_path) values(f.organization_id,f.agent_id,u.id,'W03 forbidden.txt',0,f.organization_id||'/'||gen_random_uuid());end if;
     exception when insufficient_privilege then denied:=true;end;
     insert into w03_agent_cases values('foreign-INSERT',surface,denied);
     begin
      if surface='memory' then update agent_memories set title='W03 forbidden' where id=f.memory_id;
      else update agent_attachments set filename='W03 forbidden.txt' where id=f.file_id;end if;get diagnostics n=row_count;
     exception when insufficient_privilege then n:=0;end;
     insert into w03_agent_cases values('foreign-UPDATE',surface,n=0);
     begin
      if surface='memory' then delete from agent_memories where id=f.memory_id;else delete from agent_attachments where id=f.file_id;end if;get diagnostics n=row_count;
     exception when insufficient_privilege then n:=0;end;
     insert into w03_agent_cases values('foreign-DELETE',surface,n=0);
    end if;
   end loop;
   if own.organization_id is not null and not allowed then
    foreach op in array array['memory-agent-insert','memory-agent-update','attachment-agent-insert','attachment-agent-update','memory-source-insert','memory-source-update'] loop
     denied:=false;
     begin
      case op
       when 'memory-agent-insert' then insert into agent_memories(organization_id,agent_id,title,content,created_by) values(own.organization_id,f.agent_id,'W03 forbidden relation','Synthetic',u.id);
       when 'memory-agent-update' then update agent_memories set agent_id=f.agent_id where id=own.memory_id;
       when 'attachment-agent-insert' then insert into agent_attachments(organization_id,agent_id,uploaded_by,filename,size_bytes,storage_path) values(own.organization_id,f.agent_id,u.id,'W03 forbidden.txt',0,own.organization_id||'/'||gen_random_uuid());
       when 'attachment-agent-update' then update agent_attachments set agent_id=f.agent_id where id=own.file_id;
       when 'memory-source-insert' then insert into agent_memories(organization_id,agent_id,source_attachment_id,title,content,created_by) values(own.organization_id,own.agent_id,f.file_id,'W03 forbidden source','Synthetic',u.id);
       when 'memory-source-update' then update agent_memories set source_attachment_id=f.file_id where id=own.memory_id;
      end case;
     exception when foreign_key_violation then denied:=true;end;
     insert into w03_agent_cases values(op,'parent-reference',denied);
    end loop;
   end if;
   execute 'reset role';
  end loop;
 end loop;
 if (select count(*) from w03_agent_cases)<>372 or exists(select 1 from w03_agent_cases where not passed) then raise exception 'W03 agent matrix failed or incomplete';end if;
end $$;
select surface,operation,count(*) as executed,bool_and(passed) as passed from w03_agent_cases group by surface,operation order by surface,operation;
rollback;
