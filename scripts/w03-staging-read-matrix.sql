-- Run ONLY on viqjdgohtxqkrdgwtull. SQL claim simulation, not HTTP token evidence.
-- Existing quarantined synthetic identities are never unbanned or reactivated.
-- Negative inactive-membership checks only; no positive active-member coverage.
begin;
create temporary table w03_results(actor text, surface text, rows_seen bigint, verdict text);
grant insert on w03_results to authenticated;
do $$
declare u record; t text; n bigint; targets uuid[] := array[
 '9a803ee7-c45c-4279-8161-a742f1690af6'::uuid,
 '11080770-3188-44ee-89c9-d3984d6e1ad1'::uuid,
 '4f7c8d7d-232a-479e-87d5-dcaefa5cc59e'::uuid];
begin
 for u in select a.id,a.email from auth.users a where a.email in (
 'w02-a-owner@example.test','w02-b-owner@example.test','w02-c-owner@example.test')
 and a.raw_user_meta_data->>'w02_fixture'='w02-v1'
 loop
  perform set_config('request.jwt.claim.sub',u.id::text,true);
  perform set_config('request.jwt.claims',json_build_object('sub',u.id,'role','authenticated')::text,true);
  foreach t in array array['projects','crm_accounts','project_contracts','project_documents','finance_invoices','company_memory','notifications','action_items'] loop
   execute 'set local role authenticated';
   begin
    execute format('select count(*) from public.%I where organization_id=any($1)',t) into n using targets;
    insert into w03_results values(u.email,t,n,case when n=0 then 'ZERO_ROWS_INACTIVE_CONTEXT' else 'FAIL_VISIBLE' end);
   exception when insufficient_privilege then
    insert into w03_results values(u.email,t,null,'PERMISSION_DENIED');
   end;
   execute 'reset role';
  end loop;
 end loop;
end $$;
select * from w03_results order by actor,surface;
rollback;
