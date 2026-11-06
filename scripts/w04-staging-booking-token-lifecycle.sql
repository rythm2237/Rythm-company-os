-- W04 S5: valid, expired, wrong, and cross-appointment booking token tests.
-- STAGING ONLY. Synthetic rows, transaction rollback. No outgoing notifications.
-- session_replication_role=replica suppresses user-triggered notifications and
-- FK triggers for the duration of this test, including the synthetic inserts.
-- Never run this file against production.
begin;
set local statement_timeout = '7000ms';
set local session_replication_role = replica;

do $w04$
declare v_a uuid := '00000000-0000-4000-8000-000000000415'::uuid;
        v_b uuid := '00000000-0000-4000-8000-000000000416'::uuid;
begin
 if current_setting('session_replication_role') <> 'replica' then
   raise exception 'External event/notification triggers are not suppressed';
 end if;
 if exists(select 1 from public.nail_2nya_appointments where id in (v_a,v_b))
   or exists(select 1 from public.nail_2nya_booking_tokens where appointment_id in (v_a,v_b))
 then raise exception 'Synthetic appointment IDs already exist'; end if;

 insert into public.nail_2nya_appointments(
   id,booking_reference,service_id,customer_id,
   start_at,end_at,reserved_start_at,reserved_end_at,status,source
 ) values
   (v_a,'W04-CANARY-A-2099',
    '00000000-0000-4000-8000-000000000417'::uuid,
    '00000000-0000-4000-8000-000000000418'::uuid,
    '2099-11-06 10:00:00+00'::timestamptz,'2099-11-06 11:00:00+00'::timestamptz,
    '2099-11-06 10:00:00+00'::timestamptz,'2099-11-06 11:00:00+00'::timestamptz,
    'confirmed','customer'),
   (v_b,'W04-CANARY-B-2099',
    '00000000-0000-4000-8000-000000000417'::uuid,
    '00000000-0000-4000-8000-000000000418'::uuid,
    '2099-11-06 12:00:00+00'::timestamptz,'2099-11-06 13:00:00+00'::timestamptz,
    '2099-11-06 12:00:00+00'::timestamptz,'2099-11-06 13:00:00+00'::timestamptz,
    'confirmed','customer');

 insert into public.nail_2nya_booking_tokens(appointment_id,token_hash,expires_at)
 values
  (v_a,extensions.digest('w04-token-valid'::bytea,'sha256'),now()+interval '1 hour'),
  (v_b,extensions.digest('w04-token-expired'::bytea,'sha256'),now()-interval '1 hour');
end;
$w04$;

set local role anon;
do $w04$
declare
 v_a uuid := '00000000-0000-4000-8000-000000000415'::uuid;
 v_b uuid := '00000000-0000-4000-8000-000000000416'::uuid;
 v_valid boolean;
 v_expired boolean;
 v_cross boolean;
 v_wrong boolean;
 v_cancel_expired boolean;
 v_cancel_valid boolean;
begin
 if current_setting('session_replication_role') <> 'replica' then
   raise exception 'Notifications are not suppressed under anon caller'; end if;

 select public.nail_2nya_subscribe_customer_push(
   v_a,'w04-token-valid','https://example.test/w04-validation-only',
   'w04-synthetic-key','w04-synthetic-auth') into v_valid;
 select public.nail_2nya_subscribe_customer_push(
   v_b,'w04-token-expired','https://example.test/w04-expired-only',
   'w04-synthetic-key','w04-synthetic-auth') into v_expired;
 select public.nail_2nya_subscribe_customer_push(
   v_b,'w04-token-valid','https://example.test/w04-cross-only',
   'w04-synthetic-key','w04-synthetic-auth') into v_cross;
 select public.nail_2nya_subscribe_customer_push(
   v_a,'w04-token-wrong','https://example.test/w04-wrong-only',
   'w04-synthetic-key','w04-synthetic-auth') into v_wrong;

 if v_valid is distinct from true or v_expired is distinct from false
   or v_cross is distinct from false or v_wrong is distinct from false
 then raise exception 'Token life cycle failed valid/expired/cross/wrong %,%,%,%',
   v_valid,v_expired,v_cross,v_wrong; end if;

 if (select count(*) from public.nail_2nya_customer_push_subscriptions
   where appointment_id in (v_a,v_b)
     and endpoint like 'https://example.test/w04-%') <> 1 then
   raise exception 'Unexpected subscription insert after token checks'; end if;

 select public.nail_2nya_cancel_booking(v_b,'w04-token-expired') into v_cancel_expired;
 select public.nail_2nya_cancel_booking(v_a,'w04-token-valid') into v_cancel_valid;
 if v_cancel_expired is distinct from false or v_cancel_valid is distinct from true then
   raise exception 'Booking cancellation lifecycle wrong: %, %',v_cancel_expired,v_cancel_valid;
 end if;
end;
$w04$;
reset role;
rollback;
