create table if not exists public.nail_2nya_realtime_events (
  id bigint generated always as identity primary key,
  appointment_id uuid,
  event_type text not null,
  created_at timestamptz not null default now()
);
alter table public.nail_2nya_realtime_events enable row level security;
drop policy if exists nail_2nya_realtime_public_read on public.nail_2nya_realtime_events;
create policy nail_2nya_realtime_public_read on public.nail_2nya_realtime_events for select to anon, authenticated using (created_at > now() - interval '1 day');
grant select on public.nail_2nya_realtime_events to anon, authenticated;
create or replace function public.nail_2nya_emit_realtime_event() returns trigger language plpgsql security definer set search_path='public' as $$
begin
  insert into public.nail_2nya_realtime_events(appointment_id,event_type) values(new.id,case when tg_op='INSERT' then 'booking_created' else 'booking_updated' end);
  delete from public.nail_2nya_realtime_events where created_at < now()-interval '2 days';
  return new;
end $$;
drop trigger if exists nail_2nya_realtime_appointments on public.nail_2nya_appointments;
create trigger nail_2nya_realtime_appointments after insert or update of status,start_at,end_at on public.nail_2nya_appointments for each row execute function public.nail_2nya_emit_realtime_event();
do $$ begin
 if not exists(select 1 from pg_publication_tables where pubname='supabase_realtime' and schemaname='public' and tablename='nail_2nya_realtime_events') then
   alter publication supabase_realtime add table public.nail_2nya_realtime_events;
 end if;
end $$;