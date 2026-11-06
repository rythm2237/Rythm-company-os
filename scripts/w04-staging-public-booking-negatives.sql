-- W04: public booking/token negative authorization, staging only.
-- No booking/customer insertion or remote notification triggers.
begin;
set local statement_timeout = '5000ms';
set local role anon;
do $w04$
declare v_booking uuid := '00000000-0000-4000-8000-000000000412'::uuid;
        v_got bigint; v_cancel boolean; v_push boolean;
begin
  select count(*) into v_got from public.nail_2nya_get_booking(v_booking,'w04-invalid-token');
  if v_got<>0 then raise exception 'Anon could read foreign booking without token'; end if;
  select public.nail_2nya_cancel_booking(v_booking,'w04-invalid-token') into v_cancel;
  if v_cancel is distinct from false then raise exception 'Anon cancelled booking without token'; end if;
  select public.nail_2nya_subscribe_customer_push(
    v_booking,'w04-invalid-token','https://example.test/w04-synthetic',
    'synthetic-p256dh','synthetic-auth') into v_push;
  if v_push is distinct from false then
    raise exception 'Anon subscribed to foreign booking without token'; end if;
end;
$w04$;
reset role;
rollback;
