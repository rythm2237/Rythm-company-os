create table if not exists public.nail_2nya_customer_push_subscriptions (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.nail_2nya_appointments(id) on delete cascade,
  endpoint text not null unique,
  p256dh text not null,
  auth text not null,
  active boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.nail_2nya_customer_push_subscriptions enable row level security;
revoke all on table public.nail_2nya_customer_push_subscriptions from anon, authenticated;
create index if not exists nail_2nya_customer_push_appointment_idx on public.nail_2nya_customer_push_subscriptions(appointment_id) where active=true;

create table if not exists public.nail_2nya_notification_deliveries (
  id uuid primary key default gen_random_uuid(),
  appointment_id uuid not null references public.nail_2nya_appointments(id) on delete cascade,
  event_type text not null,
  target text not null check (target in ('admin','customer')),
  created_at timestamptz not null default now(),
  unique (appointment_id,event_type,target)
);
alter table public.nail_2nya_notification_deliveries enable row level security;
revoke all on table public.nail_2nya_notification_deliveries from anon, authenticated;

create table if not exists public.nail_2nya_push_keys (
  singleton boolean primary key default true check (singleton),
  public_key text not null,
  private_key text not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
alter table public.nail_2nya_push_keys enable row level security;
revoke all on table public.nail_2nya_push_keys from anon, authenticated;

create or replace function public.nail_2nya_subscribe_customer_push(
  p_appointment_id uuid,p_token text,p_endpoint text,p_p256dh text,p_auth text
) returns boolean
language plpgsql security definer set search_path=public,extensions as $$
declare v_valid boolean;
begin
  select exists(
    select 1 from public.nail_2nya_booking_tokens t
    where t.appointment_id=p_appointment_id
      and t.token_hash=extensions.digest(coalesce(p_token,'')::bytea,'sha256')
  ) into v_valid;
  if not v_valid then return false; end if;
  if nullif(trim(p_endpoint),'') is null or nullif(trim(p_p256dh),'') is null or nullif(trim(p_auth),'') is null then return false; end if;
  insert into public.nail_2nya_customer_push_subscriptions(appointment_id,endpoint,p256dh,auth,active,updated_at)
  values(p_appointment_id,trim(p_endpoint),trim(p_p256dh),trim(p_auth),true,now())
  on conflict(endpoint) do update set appointment_id=excluded.appointment_id,p256dh=excluded.p256dh,auth=excluded.auth,active=true,updated_at=now();
  return true;
end; $$;
revoke all on function public.nail_2nya_subscribe_customer_push(uuid,text,text,text,text) from public;
grant execute on function public.nail_2nya_subscribe_customer_push(uuid,text,text,text,text) to anon,authenticated;

create or replace function public.nail_2nya_available_dates(
  p_service_id uuid,p_from date default null,p_days integer default 28
) returns table(available_date date,slots_count bigint)
language sql security definer set search_path=public as $$
  select d::date,count(s.slot_start)::bigint
  from generate_series(
    coalesce(p_from,current_date)::timestamp,
    (coalesce(p_from,current_date)+greatest(1,least(coalesce(p_days,28),60))-1)::timestamp,
    interval '1 day'
  ) d
  cross join lateral public.nail_2nya_available_slots(d::date,p_service_id) s
  group by d::date
  having count(s.slot_start)>0
  order by d::date;
$$;
revoke all on function public.nail_2nya_available_dates(uuid,date,integer) from public;
grant execute on function public.nail_2nya_available_dates(uuid,date,integer) to anon,authenticated;

create or replace function public.nail_2nya_create_booking(
  p_service_id uuid,p_start_at timestamptz,p_name text,p_phone text,
  p_instagram text default null,p_email text default null,p_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public,extensions as $$
declare
  v_service public.nail_2nya_services%rowtype;
  v_customer uuid; v_appt uuid; v_token text; v_ref text; v_date date; v_tz text; v_valid boolean;
begin
  if nullif(trim(p_name),'') is null or nullif(trim(p_phone),'') is null then return jsonb_build_object('ok',false,'code','invalid_customer'); end if;
  select * into v_service from public.nail_2nya_services where id=p_service_id and active=true and booking_available=true;
  if not found then return jsonb_build_object('ok',false,'code','service_unavailable'); end if;
  select timezone into v_tz from public.nail_2nya_business_profile order by created_at limit 1;
  v_date:=(p_start_at at time zone v_tz)::date;
  select exists(select 1 from public.nail_2nya_available_slots(v_date,p_service_id) s where s.slot_start=p_start_at) into v_valid;
  if not v_valid then return jsonb_build_object('ok',false,'code','slot_taken'); end if;
  v_appt:=gen_random_uuid(); v_ref:=upper(substr(replace(v_appt::text,'-',''),1,8)); v_token:=encode(extensions.gen_random_bytes(32),'hex');
  begin
    insert into public.nail_2nya_customers(name,phone,instagram_username,email)
    values(trim(p_name),trim(p_phone),nullif(trim(p_instagram),''),nullif(trim(p_email),'')) returning id into v_customer;
    insert into public.nail_2nya_appointments(id,booking_reference,service_id,customer_id,start_at,end_at,reserved_start_at,reserved_end_at,status,customer_notes,source)
    values(v_appt,v_ref,p_service_id,v_customer,p_start_at,p_start_at+make_interval(mins=>v_service.duration_minutes),p_start_at-make_interval(mins=>v_service.buffer_before),p_start_at+make_interval(mins=>(v_service.duration_minutes+v_service.buffer_after)),'pending',nullif(trim(p_notes),''),'customer');
  exception when exclusion_violation then
    return jsonb_build_object('ok',false,'code','slot_taken');
  end;
  insert into public.nail_2nya_booking_tokens(appointment_id,token_hash) values(v_appt,extensions.digest(v_token::bytea,'sha256'));
  return jsonb_build_object('ok',true,'appointment_id',v_appt,'reference',v_ref,'management_token',v_token,'status','pending','start_at',p_start_at,'end_at',p_start_at+make_interval(mins=>v_service.duration_minutes));
end; $$;

update public.nail_2nya_services set duration_minutes=60,updated_at=now()
where active=true and name ilike '%ژلیش%' and duration_minutes<>60;

update public.nail_2nya_business_hours set start_time='08:00',end_time='17:00'
where weekday in (0,1,2,3,4,6) and start_time='10:00' and end_time='20:00';
