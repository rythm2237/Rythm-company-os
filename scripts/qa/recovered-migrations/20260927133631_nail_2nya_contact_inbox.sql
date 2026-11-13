create table if not exists public.nail_2nya_contact_messages (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 1 and 80),
  phone text null,
  subject text not null default 'general' check (char_length(subject) between 1 and 120),
  message text not null check (char_length(message) between 2 and 2000),
  status text not null default 'unread' check (status in ('unread','read','archived')),
  created_at timestamptz not null default now(),
  read_at timestamptz null,
  archived_at timestamptz null
);

alter table public.nail_2nya_contact_messages enable row level security;

revoke all on table public.nail_2nya_contact_messages from anon;
grant select, update on table public.nail_2nya_contact_messages to authenticated;

create policy nail_2nya_contact_admin_select on public.nail_2nya_contact_messages
for select to authenticated
using (exists (
  select 1 from public.nail_2nya_admin_users a
  where a.auth_user_id = auth.uid() and a.active = true
));

create policy nail_2nya_contact_admin_update on public.nail_2nya_contact_messages
for update to authenticated
using (exists (
  select 1 from public.nail_2nya_admin_users a
  where a.auth_user_id = auth.uid() and a.active = true
))
with check (exists (
  select 1 from public.nail_2nya_admin_users a
  where a.auth_user_id = auth.uid() and a.active = true
));

create or replace function public.nail_2nya_create_contact_message(
  p_name text,
  p_phone text,
  p_subject text,
  p_message text
) returns jsonb
language plpgsql
security definer
set search_path = public
as $$
declare
  v_name text := btrim(coalesce(p_name,''));
  v_raw_phone text := btrim(coalesce(p_phone,''));
  v_phone text;
  v_subject text := btrim(coalesce(p_subject,''));
  v_message text := btrim(coalesce(p_message,''));
  v_id uuid;
begin
  if char_length(v_name) < 1 or char_length(v_name) > 80 then
    return jsonb_build_object('ok',false,'code','invalid_name');
  end if;
  if char_length(v_subject) < 1 or char_length(v_subject) > 120 then
    return jsonb_build_object('ok',false,'code','invalid_subject');
  end if;
  if char_length(v_message) < 2 or char_length(v_message) > 2000 then
    return jsonb_build_object('ok',false,'code','invalid_message');
  end if;
  if v_raw_phone <> '' then
    v_phone := regexp_replace(v_raw_phone, '[[:space:]]+', '', 'g');
    if v_phone ~ '^09[0-9]{9}$' then
      v_phone := substr(v_phone,2);
    elsif v_phone !~ '^9[0-9]{9}$' then
      return jsonb_build_object('ok',false,'code','invalid_phone');
    end if;
  else
    v_phone := null;
  end if;

  insert into public.nail_2nya_contact_messages(name,phone,subject,message)
  values (v_name,v_phone,v_subject,v_message)
  returning id into v_id;

  return jsonb_build_object('ok',true,'message_id',v_id);
end;
$$;

revoke all on function public.nail_2nya_create_contact_message(text,text,text,text) from public;
grant execute on function public.nail_2nya_create_contact_message(text,text,text,text) to anon, authenticated;