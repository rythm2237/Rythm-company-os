begin;
insert into auth.users(id,email) values
 ('a2000000-0000-4000-8000-000000000001','logo-owner@example.invalid'),
 ('a2000000-0000-4000-8000-000000000002','logo-viewer@example.invalid'),
 ('a2000000-0000-4000-8000-000000000003','logo-admin@example.invalid');
insert into public.organizations(id,name,slug,owner_user_id,status) values
 ('b2000000-0000-4000-8000-000000000001','Logo test A','logo-test-a','a2000000-0000-4000-8000-000000000001','approved'),
 ('b2000000-0000-4000-8000-000000000002','Logo test B','logo-test-b','a2000000-0000-4000-8000-000000000003','approved');
insert into public.organization_members(organization_id,user_id,role) values
 ('b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000001','owner'),
 ('b2000000-0000-4000-8000-000000000001','a2000000-0000-4000-8000-000000000002','viewer');
insert into public.platform_admins(user_id,role,enabled) values ('a2000000-0000-4000-8000-000000000003','platform_admin',true);
set local role authenticated;
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
insert into storage.objects(bucket_id,name) values('company-logos','b2000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001.webp');
insert into public.organization_branding(organization_id,logo_path) values('b2000000-0000-4000-8000-000000000001','b2000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001.webp');
do $$ begin
 begin insert into public.organization_branding(organization_id,logo_path) values('b2000000-0000-4000-8000-000000000002',null); raise exception 'FAIL cross company write'; exception when insufficient_privilege then null; end;
 begin insert into storage.objects(bucket_id,name) values('company-logos','b2000000-0000-4000-8000-000000000002/c2000000-0000-4000-8000-000000000001.webp'); raise exception 'FAIL cross company upload'; exception when insufficient_privilege then null; end;
 begin update public.organization_branding set logo_path='b2000000-0000-4000-8000-000000000002/c2000000-0000-4000-8000-000000000001.webp' where organization_id='b2000000-0000-4000-8000-000000000001'; raise exception 'FAIL foreign path'; exception when check_violation then null; end;
end $$;
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000002',true);
do $$ begin
 if not exists(select 1 from storage.objects where bucket_id='company-logos' and name='b2000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001.webp') then raise exception 'FAIL member read'; end if;
 update public.organization_branding set logo_path=null where organization_id='b2000000-0000-4000-8000-000000000001';
 if found then raise exception 'FAIL viewer changed logo'; end if;
 begin insert into storage.objects(bucket_id,name) values('company-logos','b2000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000002.webp'); raise exception 'FAIL viewer upload'; exception when insufficient_privilege then null; end;
end $$;
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000003',true);
do $$ declare d jsonb; begin
 if not exists(select 1 from storage.objects where bucket_id='company-logos' and name='b2000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001.webp') then raise exception 'FAIL admin logo read'; end if;
 update public.organization_branding set logo_path=null where organization_id='b2000000-0000-4000-8000-000000000001';
 if found then raise exception 'FAIL admin mutation'; end if;
 d:=public.platform_customer_detail_v1('b2000000-0000-4000-8000-000000000001');
 if d->>'logo_version' is null then raise exception 'FAIL detail logo'; end if;
 if not exists(select 1 from jsonb_array_elements(public.platform_customer_list_v1('Logo test A')->'items') i where i->>'logo_version' is not null) then raise exception 'FAIL list logo'; end if;
end $$;
reset role;
update public.organization_members set membership_status='inactive' where user_id='a2000000-0000-4000-8000-000000000002';
set local role authenticated;
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000002',true);
do $$ begin
 if exists(select 1 from public.organization_branding where organization_id='b2000000-0000-4000-8000-000000000001') then raise exception 'FAIL inactive row read'; end if;
 if exists(select 1 from storage.objects where bucket_id='company-logos' and name='b2000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001.webp') then raise exception 'FAIL inactive object read'; end if;
end $$;
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000001',true);
update public.organization_branding set logo_path=null where organization_id='b2000000-0000-4000-8000-000000000001';
select set_config('request.jwt.claim.sub','a2000000-0000-4000-8000-000000000003',true);
do $$ begin
 if exists(select 1 from storage.objects where bucket_id='company-logos' and name='b2000000-0000-4000-8000-000000000001/c2000000-0000-4000-8000-000000000001.webp') then raise exception 'FAIL removed logo visible to admin'; end if;
end $$;
reset role;
do $$ begin
 if not exists(select 1 from public.audit_events where organization_id='b2000000-0000-4000-8000-000000000001' and event_type='organization.logo_removed') then raise exception 'FAIL audit'; end if;
 if exists(select 1 from storage.buckets where id='company-logos' and public) then raise exception 'FAIL public bucket'; end if;
 if has_table_privilege('anon','public.organization_branding','select') then raise exception 'FAIL anon access'; end if;
end $$;
select 'PASS logo owner upload/update/removal, member/admin reads, tenant isolation, inactive denial, privacy-safe RPCs and audit' as result;
rollback;
