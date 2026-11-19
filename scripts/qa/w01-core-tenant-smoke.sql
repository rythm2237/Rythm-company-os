\set ON_ERROR_STOP on
-- W01: synthetic-only, local Docker tenant RLS smoke. No remote/production DB.
-- Rollback ensures all fixture records are erased even if tests pass.
BEGIN;
INSERT INTO auth.users(id,instance_id,aud,role,email,created_at,updated_at) VALUES
('a1111111-1111-4111-8111-111111111111','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w01-owner-a@example.invalid',now(),now()),
('b2222222-2222-4222-8222-222222222222','00000000-0000-0000-0000-000000000000','authenticated','authenticated','w01-owner-b@example.invalid',now(),now());

INSERT INTO public.organizations(id,name,slug,owner_user_id,status) VALUES
('a3333333-3333-4333-8333-333333333333','W01 Synthetic A','w01-ci-only-a','a1111111-1111-4111-8111-111111111111','approved'),
('b4444444-4444-4444-8444-444444444444','W01 Synthetic B','w01-ci-only-b','b2222222-2222-4222-8222-222222222222','approved');

INSERT INTO public.organization_members(organization_id,user_id,role) VALUES
('a3333333-3333-4333-8333-333333333333','a1111111-1111-4111-8111-111111111111','owner'),
('b4444444-4444-4444-8444-444444444444','b2222222-2222-4222-8222-222222222222','owner');

SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','a1111111-1111-4111-8111-111111111111',true);
DO $w01$
DECLARE owns integer; foreign_owns integer; foreign_members integer;
BEGIN
 SELECT count(*) INTO owns FROM public.organizations WHERE id='a3333333-3333-4333-8333-333333333333';
 SELECT count(*) INTO foreign_owns FROM public.organizations WHERE id='b4444444-4444-4444-8444-444444444444';
 SELECT count(*) INTO foreign_members FROM public.organization_members WHERE organization_id='b4444444-4444-4444-8444-444444444444';
 IF owns <> 1 OR foreign_owns <> 0 OR foreign_members <> 0 THEN
  RAISE EXCEPTION 'W01 synthetic cross-tenant SELECT leakage: own %, foreign organizations %, foreign membership %',owns,foreign_owns,foreign_members;
 END IF;
END $w01$;
-- Unauthorized UPDATE must affect zero rows even for an authenticated owner of another company.
DO $w01$
DECLARE updated_count integer;
BEGIN
 UPDATE public.organizations SET name='W01 INVALID CROSS-TENANT EDIT'
 WHERE id='b4444444-4444-4444-8444-444444444444';
 GET DIAGNOSTICS updated_count=ROW_COUNT;
 IF updated_count <> 0 THEN RAISE EXCEPTION 'W01 unauthorized organization update modified % rows',updated_count; END IF;
END $w01$;
RESET ROLE;
-- As the other synthetic user, the visibility result must reverse.
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','b2222222-2222-4222-8222-222222222222',true);
DO $w01$
DECLARE owns integer; foreign_owns integer;
BEGIN
 SELECT count(*) INTO owns FROM public.organizations WHERE id='b4444444-4444-4444-8444-444444444444';
 SELECT count(*) INTO foreign_owns FROM public.organizations WHERE id='a3333333-3333-4333-8333-333333333333';
 IF owns <> 1 OR foreign_owns <> 0 THEN
  RAISE EXCEPTION 'W01 reverse synthetic cross-tenant leakage: own %, foreign %',owns,foreign_owns;
 END IF;
END $w01$;
RESET ROLE;
ROLLBACK;
SELECT 'W01 PASS: synthetic organization read/write RLS isolation checked for both normal-user roles (rolled back)' AS result;
