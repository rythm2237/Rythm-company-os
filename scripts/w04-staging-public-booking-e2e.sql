-- W04 public booking/contact surface: positive + negative E2E validation.
-- STAGING ONLY. 7 anonymous functions. Entire operation is rollback-only.
-- Triggers, push notifications, audit listeners and FK side effects suppressed
-- by session_replication_role=replica within the transaction.
begin;
set local statement_timeout='15000ms';
set local session_replication_role=replica;
create temporary table w04_booking_flow_state(
 appointment_id uuid not null, management_token text not null,
 contact_id uuid not null
) on commit drop;
grant select,insert on pg_temp.w04_booking_flow_state to anon;

do $w04$
begin
 if current_setting('session_replication_role')<>'replica'
   or exists(select 1 from public.nail_2nya_business_profile)
   or exists(select 1 from public.nail_2nya_business_hours) then
   raise exception 'Staging isolation conditions not met for synthetic public booking'; end if;
 if exists(select 1 from public.nail_2nya_services
   where id='00000000-0000-4000-8000-000000000461'::uuid) then
   raise exception 'Synthetic service ID already in use'; end if;
 insert into public.nail_2nya_business_profile(
   id,business_name,timezone,slot_interval_minutes,min_booking_notice_minutes,max_advance_days)
 values('00000000-0000-4000-8000-000000000462'::uuid,
   'W04 synthetic booking test','UTC',30,0,60);
 insert into public.nail_2nya_business_hours(
   id,weekday,start_time,end_time,active)
 values('00000000-0000-4000-8000-000000000463'::uuid,
   extract(dow from current_date+7)::smallint,'10:00'::time,'16:00'::time,true);
 insert into public.nail_2nya_services(
   id,name,duration_minutes,buffer_before,buffer_after,active,booking_available)
 values('00000000-0000-4000-8000-000000000461'::uuid,
   'W04 synthetic service',60,0,0,true,true);
end;
$w04$;

set local role anon;
do $w04$
declare
 v_service uuid:='00000000-0000-4000-8000-000000000461'::uuid;
 v_start timestamptz;
 v_slot_count integer;
 v_date_count integer;
 v_booking jsonb;
 v_contact jsonb;
 v_appt uuid;
 v_token text;
 v_read_count integer;
 v_push boolean;
 v_cancel boolean;
 v_bad_cancel boolean;
begin
 if current_setting('session_replication_role')<>'replica' then
   raise exception 'External triggers not suppressed for public booking'; end if;
 select count(*) into v_slot_count
 from public.nail_2nya_available_slots(current_date+7,v_service);
 select count(*) into v_date_count
 from public.nail_2nya_available_dates(v_service,current_date+7,1);
 if v_slot_count<1 or v_date_count<>1 then
   raise exception 'Public availability missing: slots %, dates %',v_slot_count,v_date_count; end if;
 select slot_start into v_start
 from public.nail_2nya_available_slots(current_date+7,v_service)
 order by slot_start limit 1;
 select public.nail_2nya_create_booking(
   v_service,v_start,'W04 Synthetic Customer','09123456789',null,null,
   'W04 rollback-only synthetic appointment') into v_booking;
 if v_booking->>'ok'<>'true' or v_booking->>'management_token' is null then
   raise exception 'Public booking failed: %',v_booking; end if;
 v_appt:=(v_booking->>'appointment_id')::uuid;
 v_token:=v_booking->>'management_token';

 select count(*) into v_read_count
 from public.nail_2nya_get_booking(v_appt,v_token)
 where customer_name='W04 Synthetic Customer' and status='pending';
 if v_read_count<>1 then raise exception 'Valid public booking lookup failed'; end if;
 select public.nail_2nya_subscribe_customer_push(
   v_appt,v_token,'https://example.test/w04-e2e-only',
   'w04-synthetic-p256dh','w04-synthetic-auth') into v_push;
 if v_push is distinct from true then
   raise exception 'Valid public booking push registration denied'; end if;

 select public.nail_2nya_cancel_booking(v_appt,'not-the-token') into v_bad_cancel;
 if v_bad_cancel is distinct from false then
   raise exception 'Public booking cancellation accepted wrong token'; end if;
 select public.nail_2nya_cancel_booking(v_appt,v_token) into v_cancel;
 if v_cancel is distinct from true then
   raise exception 'Public booking cancellation rejected valid token'; end if;

 select public.nail_2nya_create_contact_message(
   'W04 Synthetic Sender','09123456789',
   'W04 synthetic test','Rollback-only W04 public contact test') into v_contact;
 if v_contact->>'ok'<>'true' then
   raise exception 'Anonymous public contact flow failed: %',v_contact; end if;

 insert into pg_temp.w04_booking_flow_state
 values(v_appt,v_token,(v_contact->>'message_id')::uuid);
end;
$w04$;
reset role;

-- Reset the cancelled booking to pending only inside the rollback-only test,
-- so the expiry test cannot accidentally pass because of cancellation status.
update public.nail_2nya_appointments
 set status='pending'
 where id=(select appointment_id from pg_temp.w04_booking_flow_state);
update public.nail_2nya_booking_tokens
 set expires_at=now()-interval '1 hour'
 where appointment_id=(select appointment_id from pg_temp.w04_booking_flow_state);

set local role anon;
do $w04$
declare v_appt uuid;v_token text;v_read_count integer;
        v_cancel boolean;v_push boolean;
begin
 select appointment_id,management_token into v_appt,v_token
 from pg_temp.w04_booking_flow_state;
 select count(*) into v_read_count
 from public.nail_2nya_get_booking(v_appt,v_token);
 select public.nail_2nya_cancel_booking(v_appt,v_token) into v_cancel;
 select public.nail_2nya_subscribe_customer_push(
   v_appt,v_token,'https://example.test/w04-expired-e2e-only',
   'w04-synthetic-p256dh','w04-synthetic-auth') into v_push;
 if v_read_count<>0 or v_cancel is distinct from false
   or v_push is distinct from false then
   raise exception 'Expired token was accepted in get/cancel/push: %,%,%',
     v_read_count,v_cancel,v_push; end if;
end;
$w04$;
reset role;

do $assert$
declare v_appt uuid;v_contact uuid;
begin
 select appointment_id,contact_id into v_appt,v_contact
 from pg_temp.w04_booking_flow_state;
 if not exists(select 1 from public.nail_2nya_customer_push_subscriptions
   where appointment_id=v_appt and endpoint='https://example.test/w04-e2e-only')
   or not exists(select 1 from public.nail_2nya_contact_messages
   where id=v_contact and name='W04 Synthetic Sender')
 then raise exception 'Expected synthetic subscription/contact absent'; end if;
 if (select count(*) from public.nail_2nya_appointments where id=v_appt)<>1 then
   raise exception 'Synthetic appointment count mismatch'; end if;
end;
$assert$;
rollback;
