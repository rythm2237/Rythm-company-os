-- STAGING ONLY. Active synthetic W03 claims; not a substitute for real HTTP tokens.
begin;
create temporary table w03_active_sql(actor text, target text, allowed boolean, seen bigint);
grant insert on w03_active_sql to authenticated;
do $$
declare u record; o record; n bigint; permitted boolean;
begin
 for u in select id,email from auth.users where raw_user_meta_data->>'w03_fixture'='w03-v1' and email like '%-41825010580-2@example.test' loop
  for o in select id,slug from organizations where slug like 'w03-synthetic-%-staging-v1-41825010580-2' loop
   select exists(select 1 from organization_members where organization_id=o.id and user_id=u.id and membership_status='active') into permitted;
   perform set_config('request.jwt.claim.sub',u.id::text,true);
   perform set_config('request.jwt.claims',json_build_object('sub',u.id,'role','authenticated')::text,true);
   execute 'set local role authenticated';
   select count(*) into n from public.projects where organization_id=o.id;
   insert into w03_active_sql values(u.email,o.slug,permitted,n);
   execute 'reset role';
   if not permitted and n<>0 then raise exception 'W03 foreign project SQL visibility';end if;
   if permitted and n<1 then raise exception 'W03 positive SQL project control missing';end if;
  end loop;
 end loop;
end $$;
do $$ begin
 if (select count(*) from w03_active_sql)<>57 or (select count(*) from w03_active_sql where not allowed)<>37 or (select count(*) from w03_active_sql where allowed)<>20 then raise exception 'W03 incomplete SQL matrix';end if;
end $$;
select allowed,count(*) as cases,min(seen) as min_rows,max(seen) as max_rows from w03_active_sql group by allowed;
rollback;
