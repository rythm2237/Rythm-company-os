revoke execute on function public.nail_2nya_audit_trigger() from public, anon, authenticated;
revoke execute on function public.nail_2nya_is_admin() from public, anon;
grant execute on function public.nail_2nya_is_admin() to authenticated;
revoke execute on function public.nail_2nya_available_slots(date,uuid) from public;
revoke execute on function public.nail_2nya_create_booking(uuid,timestamptz,text,text,text,text,text) from public;
revoke execute on function public.nail_2nya_get_booking(uuid,text) from public;
revoke execute on function public.nail_2nya_cancel_booking(uuid,text) from public;
grant execute on function public.nail_2nya_available_slots(date,uuid) to anon,authenticated;
grant execute on function public.nail_2nya_create_booking(uuid,timestamptz,text,text,text,text,text) to anon,authenticated;
grant execute on function public.nail_2nya_get_booking(uuid,text) to anon,authenticated;
grant execute on function public.nail_2nya_cancel_booking(uuid,text) to anon,authenticated;

drop policy if exists nail_2nya_admin_self_read on public.nail_2nya_admin_users;
create policy nail_2nya_admin_self_read on public.nail_2nya_admin_users for select to authenticated using (auth_user_id=(select auth.uid()) and active=true);

create index if not exists nail_2nya_appt_service_idx on public.nail_2nya_appointments(service_id);
create index if not exists nail_2nya_appt_customer_idx on public.nail_2nya_appointments(customer_id);
create index if not exists nail_2nya_appt_created_by_idx on public.nail_2nya_appointments(created_by) where created_by is not null;
create index if not exists nail_2nya_block_created_by_idx on public.nail_2nya_blocked_periods(created_by) where created_by is not null;