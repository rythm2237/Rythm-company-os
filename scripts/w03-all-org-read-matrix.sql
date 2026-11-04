-- STAGING ONLY. SQL subject claims are a supplement to real token HTTP evidence.
-- Unpopulated relations are explicitly distinguished from positive-control coverage.
begin;
create temporary table w03_relations as
select c.relname,c.relkind from pg_class c join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relkind in ('r','p','v')
and exists(select 1 from pg_attribute a where a.attrelid=c.oid and a.attname='organization_id' and not a.attisdropped);
create temporary table w03_read_sweep(relation text,allowed boolean,seen bigint,denied boolean);
grant insert on w03_read_sweep to authenticated;
do $$
declare u record;o record;t record;n bigint;permitted boolean;denied boolean;
begin
 for u in select id from auth.users where raw_user_meta_data->>'w03_fixture'='w03-v1' and email like '%-41831048886-1@example.test' loop
  for o in select id from organizations where slug like 'w03-synthetic-%-staging-v1-41831048886-1' loop
   select exists(select 1 from organization_members where organization_id=o.id and user_id=u.id and membership_status='active') into permitted;
   perform set_config('request.jwt.claim.sub',u.id::text,true);
   perform set_config('request.jwt.claims',json_build_object('sub',u.id,'role','authenticated')::text,true);
   for t in select * from w03_relations loop
    execute 'set local role authenticated';
    n:=null;denied:=false;
    begin
     execute format('select count(*) from public.%I where organization_id=$1',t.relname) into n using o.id;
    exception when insufficient_privilege then denied:=true;
    end;
    insert into w03_read_sweep values(t.relname,permitted,n,denied);
    execute 'reset role';
    if not permitted and coalesce(n,0)<>0 then raise exception 'W03 foreign SQL visibility in %',t.relname;end if;
    if permitted and t.relname='projects' and (denied or coalesce(n,0)<>1) then raise exception 'W03 project positive control missing';end if;
   end loop;
  end loop;
 end loop;
 if (select count(*) from w03_relations)=0 or (select count(*) from w03_read_sweep)<>57*(select count(*) from w03_relations)
 or (select count(*) from w03_read_sweep where not allowed)<>37*(select count(*) from w03_relations)
 then raise exception 'W03 incomplete organization read sweep';end if;
end $$;
select json_build_object(
 'relations',(select count(*) from w03_relations),
 'cases',(select count(*) from w03_read_sweep),
 'foreignCases',(select count(*) from w03_read_sweep where not allowed),
 'foreignRows',(select coalesce(sum(seen),0) from w03_read_sweep where not allowed),
 'coverage',(select json_agg(x order by x.relation) from (
  select relation,count(*) filter(where not allowed) as foreign_cases,
   count(*) filter(where not allowed and denied) as foreign_permission_denied,
   max(seen) filter(where not allowed) as foreign_max_rows,
   count(*) filter(where allowed and seen>0) as positive_cases
  from w03_read_sweep group by relation
 )x)
) as evidence;
rollback;
