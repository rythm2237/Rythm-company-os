create extension if not exists btree_gist with schema extensions;

create table if not exists public.nail_2nya_business_profile (
  id uuid primary key default gen_random_uuid(),
  business_name text not null default '2nya Nail Art',
  instagram_url text not null default 'https://www.instagram.com/2nya._nailart/',
  phone text,
  address text,
  timezone text not null default 'UTC',
  currency text,
  language text not null default 'en',
  slot_interval_minutes integer not null default 15 check (slot_interval_minutes between 5 and 120),
  min_booking_notice_minutes integer not null default 0 check (min_booking_notice_minutes >= 0),
  max_advance_days integer not null default 180 check (max_advance_days between 1 and 730),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create table if not exists public.nail_2nya_services (
  id uuid primary key default gen_random_uuid(), name text not null, description text,
  duration_minutes integer not null check (duration_minutes between 15 and 720),
  buffer_before integer not null default 0 check (buffer_before between 0 and 180),
  buffer_after integer not null default 0 check (buffer_after between 0 and 180),
  price numeric(10,2), deposit_amount numeric(10,2), active boolean not null default true,
  booking_available boolean not null default true, image_path text, preparation_note text,
  sort_order integer not null default 0, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.nail_2nya_business_hours (
  id uuid primary key default gen_random_uuid(), weekday smallint not null check (weekday between 0 and 6),
  start_time time not null, end_time time not null, active boolean not null default true,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (end_time > start_time)
);
create table if not exists public.nail_2nya_availability_exceptions (
  id uuid primary key default gen_random_uuid(), exception_date date not null unique, is_closed boolean not null default false,
  note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.nail_2nya_special_availability (
  id uuid primary key default gen_random_uuid(), availability_date date not null, start_time time not null, end_time time not null,
  note text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(), check (end_time > start_time)
);
create table if not exists public.nail_2nya_blocked_periods (
  id uuid primary key default gen_random_uuid(), start_at timestamptz not null, end_at timestamptz not null, reason text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, check (end_at > start_at)
);
create table if not exists public.nail_2nya_customers (
  id uuid primary key default gen_random_uuid(), name text not null, phone text not null, instagram_username text, email text,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.nail_2nya_appointments (
  id uuid primary key default gen_random_uuid(), booking_reference text not null unique,
  service_id uuid not null references public.nail_2nya_services(id), customer_id uuid not null references public.nail_2nya_customers(id),
  start_at timestamptz not null, end_at timestamptz not null, reserved_start_at timestamptz not null, reserved_end_at timestamptz not null,
  status text not null default 'confirmed' check (status in ('pending','confirmed','completed','cancelled','no_show')),
  customer_notes text, admin_notes text, created_at timestamptz not null default now(), updated_at timestamptz not null default now(),
  created_by uuid references auth.users(id) on delete set null, source text not null default 'customer' check (source in ('customer','admin')),
  check (end_at > start_at), check (reserved_end_at > reserved_start_at)
);
do $$ begin
  alter table public.nail_2nya_appointments add constraint nail_2nya_appointments_no_overlap
  exclude using gist (tstzrange(reserved_start_at, reserved_end_at, '[)') with &&)
  where (status in ('pending','confirmed'));
exception when duplicate_object then null; end $$;
create table if not exists public.nail_2nya_booking_tokens (
  appointment_id uuid primary key references public.nail_2nya_appointments(id) on delete cascade,
  token_hash bytea not null, created_at timestamptz not null default now(), expires_at timestamptz
);
create table if not exists public.nail_2nya_admin_users (
  auth_user_id uuid primary key references auth.users(id) on delete cascade, display_name text, active boolean not null default true,
  created_at timestamptz not null default now()
);
create table if not exists public.nail_2nya_portfolio_items (
  id uuid primary key default gen_random_uuid(), image_path text not null, alt_text text, featured boolean not null default false,
  visible boolean not null default true, sort_order integer not null default 0,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now()
);
create table if not exists public.nail_2nya_site_settings (
  key text primary key, value jsonb not null, is_public boolean not null default false, updated_at timestamptz not null default now()
);
create table if not exists public.nail_2nya_audit_log (
  id bigint generated always as identity primary key, entity_table text not null, entity_id text, action text not null,
  changed_by uuid, old_data jsonb, new_data jsonb, created_at timestamptz not null default now()
);
insert into public.nail_2nya_business_profile (business_name, instagram_url)
select '2nya Nail Art', 'https://www.instagram.com/2nya._nailart/' where not exists (select 1 from public.nail_2nya_business_profile);

create or replace function public.nail_2nya_touch_updated_at() returns trigger language plpgsql set search_path=public as $$ begin new.updated_at=now(); return new; end $$;
create or replace function public.nail_2nya_is_admin() returns boolean language sql stable security definer set search_path=public,auth as $$
select exists(select 1 from public.nail_2nya_admin_users a where a.auth_user_id=auth.uid() and a.active=true); $$;
create or replace function public.nail_2nya_audit_trigger() returns trigger language plpgsql security definer set search_path=public,auth as $$
begin insert into public.nail_2nya_audit_log(entity_table,entity_id,action,changed_by,old_data,new_data)
values(TG_TABLE_NAME,coalesce((case when TG_OP='DELETE' then to_jsonb(old) else to_jsonb(new) end)->>'id',''),TG_OP,auth.uid(),
case when TG_OP in ('UPDATE','DELETE') then to_jsonb(old) end,case when TG_OP in ('INSERT','UPDATE') then to_jsonb(new) end); return coalesce(new,old); end $$;

create or replace function public.nail_2nya_available_slots(p_date date,p_service_id uuid)
returns table(slot_start timestamptz,slot_end timestamptz) language plpgsql security definer set search_path=public as $$
declare v_tz text; v_duration int; v_before int; v_after int; v_interval int; v_notice int; v_max_days int; v_closed boolean;
begin
 select timezone,slot_interval_minutes,min_booking_notice_minutes,max_advance_days into v_tz,v_interval,v_notice,v_max_days from public.nail_2nya_business_profile order by created_at limit 1;
 select duration_minutes,buffer_before,buffer_after into v_duration,v_before,v_after from public.nail_2nya_services where id=p_service_id and active=true and booking_available=true;
 if v_duration is null then return; end if;
 if p_date < (now() at time zone v_tz)::date then return; end if;
 if p_date > ((now() at time zone v_tz)::date + v_max_days) then return; end if;
 select coalesce(is_closed,false) into v_closed from public.nail_2nya_availability_exceptions where exception_date=p_date; v_closed:=coalesce(v_closed,false);
 return query with windows as (
  select ((p_date+h.start_time) at time zone v_tz) ws,((p_date+h.end_time) at time zone v_tz) we from public.nail_2nya_business_hours h where h.active=true and h.weekday=extract(dow from p_date)::int and not v_closed
  union all select ((p_date+s.start_time) at time zone v_tz),((p_date+s.end_time) at time zone v_tz) from public.nail_2nya_special_availability s where s.availability_date=p_date
 ), candidates as (
  select gs actual_start,gs+make_interval(mins=>v_duration) actual_end,gs-make_interval(mins=>v_before) reserve_start,gs+make_interval(mins=>(v_duration+v_after)) reserve_end
  from windows w cross join lateral generate_series(w.ws,w.we-make_interval(mins=>(v_duration+v_after)),make_interval(mins=>v_interval)) gs
  where gs-make_interval(mins=>v_before)>=w.ws
 ) select c.actual_start,c.actual_end from candidates c
 where c.actual_start>=now()+make_interval(mins=>v_notice)
 and not exists(select 1 from public.nail_2nya_blocked_periods b where tstzrange(b.start_at,b.end_at,'[)')&&tstzrange(c.reserve_start,c.reserve_end,'[)'))
 and not exists(select 1 from public.nail_2nya_appointments a where a.status in ('pending','confirmed') and tstzrange(a.reserved_start_at,a.reserved_end_at,'[)')&&tstzrange(c.reserve_start,c.reserve_end,'[)'))
 order by c.actual_start;
end $$;

create or replace function public.nail_2nya_create_booking(p_service_id uuid,p_start_at timestamptz,p_name text,p_phone text,p_instagram text default null,p_email text default null,p_notes text default null)
returns jsonb language plpgsql security definer set search_path=public,extensions as $$
declare v_service public.nail_2nya_services%rowtype; v_customer uuid; v_appt uuid; v_token text; v_ref text; v_date date; v_tz text; v_valid boolean;
begin
 if nullif(trim(p_name),'') is null or nullif(trim(p_phone),'') is null then return jsonb_build_object('ok',false,'code','invalid_customer'); end if;
 select * into v_service from public.nail_2nya_services where id=p_service_id and active=true and booking_available=true;
 if not found then return jsonb_build_object('ok',false,'code','service_unavailable'); end if;
 select timezone into v_tz from public.nail_2nya_business_profile order by created_at limit 1;
 v_date:=(p_start_at at time zone v_tz)::date;
 select exists(select 1 from public.nail_2nya_available_slots(v_date,p_service_id) s where s.slot_start=p_start_at) into v_valid;
 if not v_valid then return jsonb_build_object('ok',false,'code','slot_taken'); end if;
 insert into public.nail_2nya_customers(name,phone,instagram_username,email) values(trim(p_name),trim(p_phone),nullif(trim(p_instagram),''),nullif(trim(p_email),'')) returning id into v_customer;
 v_appt:=gen_random_uuid(); v_ref:=upper(substr(replace(v_appt::text,'-',''),1,8)); v_token:=encode(extensions.gen_random_bytes(32),'hex');
 begin
  insert into public.nail_2nya_appointments(id,booking_reference,service_id,customer_id,start_at,end_at,reserved_start_at,reserved_end_at,status,customer_notes,source)
  values(v_appt,v_ref,p_service_id,v_customer,p_start_at,p_start_at+make_interval(mins=>v_service.duration_minutes),p_start_at-make_interval(mins=>v_service.buffer_before),p_start_at+make_interval(mins=>(v_service.duration_minutes+v_service.buffer_after)),'confirmed',nullif(trim(p_notes),''),'customer');
 exception when exclusion_violation then delete from public.nail_2nya_customers where id=v_customer; return jsonb_build_object('ok',false,'code','slot_taken'); end;
 insert into public.nail_2nya_booking_tokens(appointment_id,token_hash) values(v_appt,extensions.digest(v_token::bytea,'sha256'));
 return jsonb_build_object('ok',true,'appointment_id',v_appt,'reference',v_ref,'management_token',v_token,'start_at',p_start_at,'end_at',p_start_at+make_interval(mins=>v_service.duration_minutes));
end $$;
create or replace function public.nail_2nya_get_booking(p_appointment_id uuid,p_token text)
returns table(appointment_id uuid,booking_reference text,service_name text,start_at timestamptz,end_at timestamptz,status text,customer_name text)
language sql security definer set search_path=public,extensions as $$
select a.id,a.booking_reference,s.name,a.start_at,a.end_at,a.status,c.name from public.nail_2nya_appointments a join public.nail_2nya_services s on s.id=a.service_id join public.nail_2nya_customers c on c.id=a.customer_id join public.nail_2nya_booking_tokens t on t.appointment_id=a.id
where a.id=p_appointment_id and t.token_hash=extensions.digest(p_token::bytea,'sha256') and (t.expires_at is null or t.expires_at>now()); $$;
create or replace function public.nail_2nya_cancel_booking(p_appointment_id uuid,p_token text) returns boolean language plpgsql security definer set search_path=public,extensions as $$
declare v_count int;
begin update public.nail_2nya_appointments a set status='cancelled',updated_at=now() from public.nail_2nya_booking_tokens t where a.id=p_appointment_id and t.appointment_id=a.id and t.token_hash=extensions.digest(p_token::bytea,'sha256') and (t.expires_at is null or t.expires_at>now()) and a.status in ('pending','confirmed'); get diagnostics v_count=row_count; return v_count>0; end $$;

alter table public.nail_2nya_business_profile enable row level security; alter table public.nail_2nya_services enable row level security; alter table public.nail_2nya_business_hours enable row level security; alter table public.nail_2nya_availability_exceptions enable row level security; alter table public.nail_2nya_special_availability enable row level security; alter table public.nail_2nya_blocked_periods enable row level security; alter table public.nail_2nya_customers enable row level security; alter table public.nail_2nya_appointments enable row level security; alter table public.nail_2nya_booking_tokens enable row level security; alter table public.nail_2nya_admin_users enable row level security; alter table public.nail_2nya_portfolio_items enable row level security; alter table public.nail_2nya_site_settings enable row level security; alter table public.nail_2nya_audit_log enable row level security;
create policy nail_2nya_business_public_read on public.nail_2nya_business_profile for select using (true); create policy nail_2nya_services_public_read on public.nail_2nya_services for select using (active=true); create policy nail_2nya_portfolio_public_read on public.nail_2nya_portfolio_items for select using (visible=true); create policy nail_2nya_settings_public_read on public.nail_2nya_site_settings for select using (is_public=true); create policy nail_2nya_admin_self_read on public.nail_2nya_admin_users for select to authenticated using (auth_user_id=auth.uid() and active=true);
create policy nail_2nya_business_admin_all on public.nail_2nya_business_profile for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_services_admin_all on public.nail_2nya_services for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_hours_admin_all on public.nail_2nya_business_hours for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_exceptions_admin_all on public.nail_2nya_availability_exceptions for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_special_admin_all on public.nail_2nya_special_availability for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_blocks_admin_all on public.nail_2nya_blocked_periods for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_customers_admin_all on public.nail_2nya_customers for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_appointments_admin_all on public.nail_2nya_appointments for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_tokens_admin_all on public.nail_2nya_booking_tokens for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_portfolio_admin_all on public.nail_2nya_portfolio_items for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_settings_admin_all on public.nail_2nya_site_settings for all to authenticated using (public.nail_2nya_is_admin()) with check (public.nail_2nya_is_admin()); create policy nail_2nya_audit_admin_read on public.nail_2nya_audit_log for select to authenticated using (public.nail_2nya_is_admin());
grant usage on schema public to anon,authenticated; grant select on public.nail_2nya_business_profile,public.nail_2nya_services,public.nail_2nya_portfolio_items,public.nail_2nya_site_settings to anon,authenticated; grant select,insert,update,delete on public.nail_2nya_business_profile,public.nail_2nya_services,public.nail_2nya_business_hours,public.nail_2nya_availability_exceptions,public.nail_2nya_special_availability,public.nail_2nya_blocked_periods,public.nail_2nya_customers,public.nail_2nya_appointments,public.nail_2nya_booking_tokens,public.nail_2nya_portfolio_items,public.nail_2nya_site_settings to authenticated; grant select on public.nail_2nya_admin_users,public.nail_2nya_audit_log to authenticated; grant execute on function public.nail_2nya_available_slots(date,uuid) to anon,authenticated; grant execute on function public.nail_2nya_create_booking(uuid,timestamptz,text,text,text,text,text) to anon,authenticated; grant execute on function public.nail_2nya_get_booking(uuid,text) to anon,authenticated; grant execute on function public.nail_2nya_cancel_booking(uuid,text) to anon,authenticated; grant execute on function public.nail_2nya_is_admin() to authenticated;
create index if not exists nail_2nya_hours_weekday_idx on public.nail_2nya_business_hours(weekday) where active=true; create index if not exists nail_2nya_special_date_idx on public.nail_2nya_special_availability(availability_date); create index if not exists nail_2nya_blocked_range_idx on public.nail_2nya_blocked_periods using gist (tstzrange(start_at,end_at,'[)')); create index if not exists nail_2nya_appt_start_idx on public.nail_2nya_appointments(start_at); create index if not exists nail_2nya_appt_status_idx on public.nail_2nya_appointments(status,start_at);
create trigger nail_2nya_business_touch before update on public.nail_2nya_business_profile for each row execute function public.nail_2nya_touch_updated_at(); create trigger nail_2nya_services_touch before update on public.nail_2nya_services for each row execute function public.nail_2nya_touch_updated_at(); create trigger nail_2nya_hours_touch before update on public.nail_2nya_business_hours for each row execute function public.nail_2nya_touch_updated_at(); create trigger nail_2nya_exceptions_touch before update on public.nail_2nya_availability_exceptions for each row execute function public.nail_2nya_touch_updated_at(); create trigger nail_2nya_special_touch before update on public.nail_2nya_special_availability for each row execute function public.nail_2nya_touch_updated_at(); create trigger nail_2nya_blocks_touch before update on public.nail_2nya_blocked_periods for each row execute function public.nail_2nya_touch_updated_at(); create trigger nail_2nya_customers_touch before update on public.nail_2nya_customers for each row execute function public.nail_2nya_touch_updated_at(); create trigger nail_2nya_appointments_touch before update on public.nail_2nya_appointments for each row execute function public.nail_2nya_touch_updated_at(); create trigger nail_2nya_portfolio_touch before update on public.nail_2nya_portfolio_items for each row execute function public.nail_2nya_touch_updated_at();
create trigger nail_2nya_appt_audit after insert or update or delete on public.nail_2nya_appointments for each row execute function public.nail_2nya_audit_trigger(); create trigger nail_2nya_hours_audit after insert or update or delete on public.nail_2nya_business_hours for each row execute function public.nail_2nya_audit_trigger(); create trigger nail_2nya_exception_audit after insert or update or delete on public.nail_2nya_availability_exceptions for each row execute function public.nail_2nya_audit_trigger(); create trigger nail_2nya_special_audit after insert or update or delete on public.nail_2nya_special_availability for each row execute function public.nail_2nya_audit_trigger(); create trigger nail_2nya_block_audit after insert or update or delete on public.nail_2nya_blocked_periods for each row execute function public.nail_2nya_audit_trigger();