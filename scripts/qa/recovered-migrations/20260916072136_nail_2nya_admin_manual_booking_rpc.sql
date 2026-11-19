create or replace function public.nail_2nya_admin_create_appointment(
  p_service_id uuid,
  p_start_at timestamptz,
  p_name text,
  p_phone text,
  p_instagram text default null,
  p_email text default null,
  p_customer_notes text default null,
  p_admin_notes text default null
) returns jsonb
language plpgsql security definer set search_path=public,extensions,auth as $$
declare
  v_service public.nail_2nya_services%rowtype;
  v_customer uuid;
  v_appt uuid;
  v_ref text;
  v_token text;
begin
  if not public.nail_2nya_is_admin() then raise exception 'not_authorized' using errcode='42501'; end if;
  select * into v_service from public.nail_2nya_services where id=p_service_id;
  if not found then return jsonb_build_object('ok',false,'code','service_not_found'); end if;
  if nullif(trim(p_name),'') is null or nullif(trim(p_phone),'') is null then return jsonb_build_object('ok',false,'code','invalid_customer'); end if;
  insert into public.nail_2nya_customers(name,phone,instagram_username,email)
    values(trim(p_name),trim(p_phone),nullif(trim(p_instagram),''),nullif(trim(p_email),'')) returning id into v_customer;
  v_appt:=gen_random_uuid(); v_ref:=upper(substr(replace(v_appt::text,'-',''),1,8)); v_token:=encode(extensions.gen_random_bytes(32),'hex');
  begin
    insert into public.nail_2nya_appointments(id,booking_reference,service_id,customer_id,start_at,end_at,reserved_start_at,reserved_end_at,status,customer_notes,admin_notes,source,created_by)
    values(v_appt,v_ref,p_service_id,v_customer,p_start_at,p_start_at+make_interval(mins=>v_service.duration_minutes),p_start_at-make_interval(mins=>v_service.buffer_before),p_start_at+make_interval(mins=>(v_service.duration_minutes+v_service.buffer_after)),'confirmed',nullif(trim(p_customer_notes),''),nullif(trim(p_admin_notes),''),'admin',auth.uid());
  exception when exclusion_violation then
    delete from public.nail_2nya_customers where id=v_customer;
    return jsonb_build_object('ok',false,'code','appointment_conflict');
  end;
  insert into public.nail_2nya_booking_tokens(appointment_id,token_hash) values(v_appt,extensions.digest(v_token::bytea,'sha256'));
  return jsonb_build_object('ok',true,'appointment_id',v_appt,'reference',v_ref,'management_token',v_token);
end $$;
revoke execute on function public.nail_2nya_admin_create_appointment(uuid,timestamptz,text,text,text,text,text,text) from public, anon;
grant execute on function public.nail_2nya_admin_create_appointment(uuid,timestamptz,text,text,text,text,text,text) to authenticated;