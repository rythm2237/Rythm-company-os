-- STAGING ONLY, active synthetic run __W03_RUN__. All fixtures roll back.
begin;
create temporary table w03_finance_fixtures(id uuid,organization_id uuid,customer_id uuid);
create temporary table w03_finance_cases(operation text,foreign_tenant boolean,passed boolean);
grant insert on w03_finance_cases to authenticated;
do $$
declare o record;u record;f record;n bigint;allowed boolean;denied boolean;
begin
 if (select count(*) from organization_members where organization_id in(select id from organizations where slug like 'w03-synthetic-%-staging-v1-__W03_RUN__') and membership_status='active')<>20 then raise exception 'Active synthetic run required';end if;
 for o in select org.id,c.id as customer_id from organizations org join crm_accounts c on c.organization_id=org.id where org.slug like 'w03-synthetic-%-staging-v1-__W03_RUN__' and c.name like 'W03-SENTINEL-%' loop
  insert into w03_finance_fixtures values(gen_random_uuid(),o.id,o.customer_id);
 end loop;
 if (select count(*) from w03_finance_fixtures)<>3 then raise exception 'Missing finance controls';end if;
 insert into finance_transactions(id,organization_id,customer_id,transaction_type,status,description,amount)
  select id,organization_id,customer_id,'expense','void','W03 rollback-only zero-value ledger fixture',0 from w03_finance_fixtures;
 for u in select id,email from auth.users where raw_user_meta_data->>'w03_fixture'='w03-v1' and email like '%-__W03_RUN__@example.test' loop
  for f in select * from w03_finance_fixtures loop
   allowed:=exists(select 1 from organization_members where organization_id=f.organization_id and user_id=u.id and membership_status='active');
   perform set_config('request.jwt.claim.sub',u.id::text,true);
   perform set_config('request.jwt.claims',json_build_object('sub',u.id,'role','authenticated')::text,true);
   execute 'set local role authenticated';
   select count(*) into n from finance_transactions where id=f.id;
   insert into w03_finance_cases values('READ',not allowed,n=case when allowed and (u.email like '%-owner-%' or u.email like '%-finance-authorized-%') then 1 else 0 end);
   if not allowed then
    denied:=false;
    begin insert into finance_transactions(organization_id,customer_id,transaction_type,status,description,amount) values(f.organization_id,f.customer_id,'expense','void','W03 forbidden zero-value ledger fixture',0);
    exception when insufficient_privilege then denied:=true;end;
    insert into w03_finance_cases values('INSERT',true,denied);
    begin update finance_transactions set description='W03 forbidden mutation' where id=f.id;get diagnostics n=row_count;
    exception when insufficient_privilege then n:=0;end;
    insert into w03_finance_cases values('UPDATE',true,n=0);
    begin delete from finance_transactions where id=f.id;get diagnostics n=row_count;
    exception when insufficient_privilege then n:=0;end;
    insert into w03_finance_cases values('DELETE',true,n=0);
   end if;
   execute 'reset role';
  end loop;
 end loop;
 if (select count(*) from w03_finance_cases)<>168 or exists(select 1 from w03_finance_cases where not passed) then raise exception 'Incomplete or failing finance transaction matrix';end if;
 if (select count(*) from finance_transactions where id in(select id from w03_finance_fixtures) and description='W03 rollback-only zero-value ledger fixture')<>3 then raise exception 'Foreign ledger changed';end if;
end $$;
select operation,foreign_tenant,count(*) as executed,bool_and(passed) as passed from w03_finance_cases group by operation,foreign_tenant order by operation,foreign_tenant;
rollback;
