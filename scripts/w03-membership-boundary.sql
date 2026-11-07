-- STAGING ONLY. Negative root-tenant, membership and access-grant mutations.
begin;
create temporary table w03_authority_cases(operation text,affected bigint);
grant insert on w03_authority_cases to authenticated;
do $$
declare u record;o record;member_id uuid;n bigint;denied boolean;
begin
 for u in select id from auth.users where raw_user_meta_data->>'w03_fixture'='w03-v1' and email like '%-41831048886-1@example.test' loop
  for o in select id from organizations where slug like 'w03-synthetic-%-staging-v1-41831048886-1' loop
   if exists(select 1 from organization_members where organization_id=o.id and user_id=u.id and membership_status='active') then continue;end if;
   select m.user_id into strict member_id from organization_members m join auth.users a on a.id=m.user_id
    where m.organization_id=o.id and a.email like 'w03-%-member-41831048886-1@example.test';
   perform set_config('request.jwt.claim.sub',u.id::text,true);
   perform set_config('request.jwt.claims',json_build_object('sub',u.id,'role','authenticated')::text,true);
   execute 'set local role authenticated';
   select count(*) into n from public.organizations where id=o.id;
   if n<>0 then raise exception 'Foreign organization READ';end if;
   insert into w03_authority_cases values('organization READ',n);
   begin
    update public.organizations set name='W03 forbidden mutation' where id=o.id;get diagnostics n=row_count;
   exception when insufficient_privilege then n:=0;end;
   if n<>0 then raise exception 'Foreign organization UPDATE';end if;
   insert into w03_authority_cases values('organization UPDATE',n);
   begin
    delete from public.organizations where id=o.id;get diagnostics n=row_count;
   exception when insufficient_privilege then n:=0;end;
   if n<>0 then raise exception 'Foreign organization DELETE';end if;
   insert into w03_authority_cases values('organization DELETE',n);
   denied:=false;
   begin
    insert into public.organization_members(organization_id,user_id,role,membership_status) values(o.id,u.id,'operator','active');
   exception when insufficient_privilege then denied:=true;end;
   if not denied then raise exception 'Foreign membership INSERT';end if;
   insert into w03_authority_cases values('membership INSERT',0);
   begin
    update public.organization_members set role='executive' where organization_id=o.id and user_id=member_id;get diagnostics n=row_count;
   exception when insufficient_privilege then n:=0;end;
   if n<>0 then raise exception 'Foreign membership UPDATE';end if;
   insert into w03_authority_cases values('membership UPDATE',n);
   begin
    delete from public.organization_members where organization_id=o.id and user_id=member_id;get diagnostics n=row_count;
   exception when insufficient_privilege then n:=0;end;
   if n<>0 then raise exception 'Foreign membership DELETE';end if;
   insert into w03_authority_cases values('membership DELETE',n);
   denied:=false;
   begin
    insert into public.crm_access_grants(organization_id,principal_type,principal_id,capability,resource_type,resource_id,granted_by)
    values(o.id,'user',member_id,'finance.read','company',o.id,u.id);
   exception when insufficient_privilege then denied:=true;
    when raise_exception then
     if sqlerrm<>'Only the active company owner can administer access' then raise;end if;
     denied:=true;
   end;
   if not denied then raise exception 'Foreign finance grant INSERT';end if;
   insert into w03_authority_cases values('finance grant INSERT',0);
   execute 'reset role';
  end loop;
 end loop;
 if (select count(*) from w03_authority_cases)<>259 then raise exception 'Incomplete W03 authority matrix';end if;
end $$;
select operation,count(*) as cases,sum(affected) as affected from w03_authority_cases group by operation order by operation;
rollback;
