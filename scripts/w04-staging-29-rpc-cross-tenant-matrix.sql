-- W04: cross-tenant authorization matrix using 29 functions with a real
-- synthetic B organization/Agent and an active synthetic owner of A.
-- STAGING ONLY; transactions & notification triggers isolated; all changes rolled back.
begin;
set local statement_timeout='30000ms';
set local session_replication_role=replica;
create temporary table w04_cross_tenant_result(
 signature text primary key, outcome text not null, result text, error_state text
) on commit drop;
grant select,insert on pg_temp.w04_cross_tenant_result to authenticated;

do $w04$
declare
 v_a uuid; v_b uuid; v_owner uuid;
begin
 select id into v_a from public.organizations where slug='w02-synthetic-a-staging-v1';
 select id into v_b from public.organizations where slug='w02-synthetic-b-staging-v1';
 select id into v_owner from auth.users where email='w02-a-owner@example.test';
 if v_a is null or v_b is null or v_owner is null
   or exists(select 1 from public.agents where id='00000000-0000-4000-8000-000000000451'::uuid)
 then raise exception 'W02 fixtures missing or W04 synthetic Agent ID in use'; end if;
 update public.organization_members set membership_status='active'
 where organization_id=v_a and user_id=v_owner;
 if not found then raise exception 'A owner membership fixture missing'; end if;
 insert into public.agents(id,organization_id,agent_code,name,role_title,purpose,enabled,agent_status)
 values('00000000-0000-4000-8000-000000000451'::uuid,v_b,
 'W04-CROSS-AGENT','W04 Synthetic B Agent','W04 Test Only',
 'Rollback-only B organization Agent authorization test',false,'paused');
end;
$w04$;

select set_config('request.jwt.claim.sub',
 (select id::text from auth.users where email='w02-a-owner@example.test'),true);
select set_config('request.jwt.claim.role','authenticated',true);
set local role authenticated;

do $w04$
declare
 r record; i integer; v_name text; v_type text; v_val text; v_args text;
 v_sql text; v_out jsonb; v_state text; v_message text;
 v_a uuid; v_b uuid;
begin
 select id into v_a from public.organizations where slug='w02-synthetic-a-staging-v1';
 select id into v_b from public.organizations where slug='w02-synthetic-b-staging-v1';
 if not public.is_org_owner(v_a) or public.is_org_member(v_b)
    or public.is_org_owner(v_b) then
  raise exception 'Cross-tenant identity fixture misconfigured'; end if;
 if current_setting('session_replication_role') <> 'replica' then
  raise exception 'External notification triggers must be suppressed'; end if;

 for r in
 select p.*,n.nspname
 from pg_catalog.pg_proc p join pg_catalog.pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef
   and has_function_privilege('authenticated',p.oid,'EXECUTE')
   and p.proargnames[1] in ('target_agent_id','target_org_id','target_organization_id')
 order by p.proname,p.oid::regprocedure::text
 loop
   v_args:='';
   for i in 0..r.pronargs-1 loop
     v_type:=pg_catalog.format_type(r.proargtypes[i],null);
     v_name:=coalesce(r.proargnames[i+1],'');
     if r.proargtypes[i]='uuid'::regtype
       and v_name='target_agent_id' then
       v_val:='''00000000-0000-4000-8000-000000000451''::uuid';
     elsif r.proargtypes[i]='uuid'::regtype
       and v_name ~* '(^|_)(org|organization)(_|$)' then
       v_val:='(select id from public.organizations where slug=''w02-synthetic-b-staging-v1'')';
     elsif r.proargtypes[i]='uuid'::regtype then
       v_val:='''00000000-0000-4000-8000-000000000452''::uuid';
     elsif r.proargtypes[i]='text'::regtype then
       v_val:='''w04-cross-test''::text';
     elsif r.proargtypes[i]='integer'::regtype
       or r.proargtypes[i]='smallint'::regtype then
       v_val:='1::'||v_type;
     elsif r.proargtypes[i]='boolean'::regtype then
       v_val:='false::boolean';
     elsif r.proargtypes[i]='numeric'::regtype then
       v_val:='1::numeric';
     elsif r.proargtypes[i]='jsonb'::regtype then
       v_val:='''{}''::jsonb';
     elsif r.proargtypes[i]='text[]'::regtype then
       v_val:='''{}''::text[]';
     else
       v_val:='null::'||v_type;
     end if;
     v_args:=v_args||case when i>0 then ',' else '' end||v_val;
   end loop;
   v_sql:=pg_catalog.format(
     'select coalesce(jsonb_agg(to_jsonb(t)),''[]''::jsonb) from %I.%I(%s) t',
     r.nspname,r.proname,v_args);
   begin
     execute v_sql into v_out;
     insert into pg_temp.w04_cross_tenant_result(signature,outcome,result)
     values(r.oid::regprocedure::text,'RETURNED',left(v_out::text,500));
   exception when others then
     get stacked diagnostics v_state=returned_sqlstate,v_message=message_text;
     insert into pg_temp.w04_cross_tenant_result(signature,outcome,error_state,result)
     values(r.oid::regprocedure::text,'EXCEPTION',v_state,left(v_message,300));
   end;
 end loop;
end;
$w04$;
reset role;

do $assert$
declare v_count int; v_actual int; v_agent public.agents%rowtype;
begin
 select count(*) into v_count from pg_proc p join pg_namespace n on n.oid=p.pronamespace
 where n.nspname='public' and p.prosecdef
   and has_function_privilege('authenticated',p.oid,'EXECUTE')
   and p.proargnames[1] in ('target_agent_id','target_org_id','target_organization_id');
 select count(*) into v_actual from pg_temp.w04_cross_tenant_result;
 if v_count<>29 or v_actual<>v_count then
   raise exception 'Cross-tenant matrix coverage mismatch: expected 29, actual %, %',v_count,v_actual;
 end if;
 select * into v_agent from public.agents
 where id='00000000-0000-4000-8000-000000000451'::uuid;
 if v_agent.id is null or v_agent.agent_code<>'W04-CROSS-AGENT'
   or v_agent.name<>'W04 Synthetic B Agent' or v_agent.enabled<>false
   or v_agent.agent_status<>'paused' then
     raise exception 'Foreign agent was modified by unauthorised owner'; end if;
 if (select count(*) from public.agents
   where organization_id=(select id from public.organizations where slug='w02-synthetic-b-staging-v1'))<>1 then
     raise exception 'Foreign agent rows unexpectedly created'; end if;
end;
$assert$;

select jsonb_build_object(
 'probed',count(*),
 'exceptions',count(*) filter(where outcome='EXCEPTION'),
 'returned',count(*) filter(where outcome='RETURNED'),
 'results',jsonb_agg(jsonb_build_object(
  'signature',signature,'outcome',outcome,'state',error_state,'result',result)
  order by signature)
) as w04_cross_tenant_matrix from pg_temp.w04_cross_tenant_result;
rollback;
