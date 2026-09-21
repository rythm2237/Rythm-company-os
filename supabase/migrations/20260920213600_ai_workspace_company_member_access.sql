-- Company-funded AI member access and invitation lifecycle.
-- organization_members remains the canonical membership system.
create table if not exists public.aiw_company_member_invitations (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.organizations(id) on delete cascade,
  email text not null,
  email_normalized text not null,
  membership_role text not null default 'operator' check (membership_role in ('executive','operator','auditor','viewer')),
  role_label text not null default 'Member' check (length(role_label) between 1 and 80),
  billing_source text not null default 'company_wallet' check (billing_source='company_wallet'),
  allowed_modes text[] not null default array['auto','fast','best']::text[],
  allowed_prompt_profiles text[] not null default array['normal','professional']::text[],
  allowed_models text[] not null default array[]::text[],
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  invited_by uuid not null references auth.users(id),
  invited_at timestamptz not null default now(),
  expires_at timestamptz not null default (now()+interval '7 days'),
  accepted_by uuid references auth.users(id),
  accepted_at timestamptz,
  unique(organization_id,email_normalized,status)
);

create table if not exists public.aiw_company_member_access (
  organization_id uuid not null references public.organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_label text not null default 'Member' check (length(role_label) between 1 and 80),
  billing_source text not null default 'company_wallet' check (billing_source='company_wallet'),
  allowed_modes text[] not null default array['auto','fast','best']::text[],
  allowed_prompt_profiles text[] not null default array['normal','professional']::text[],
  allowed_models text[] not null default array[]::text[],
  enabled boolean not null default true,
  created_by uuid references auth.users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  primary key(organization_id,user_id)
);

alter table public.aiw_company_member_invitations enable row level security;
alter table public.aiw_company_member_access enable row level security;
revoke all on public.aiw_company_member_invitations from public,anon,authenticated;
revoke all on public.aiw_company_member_access from public,anon,authenticated;
grant select,insert,update,delete on public.aiw_company_member_invitations to service_role;
grant select,insert,update,delete on public.aiw_company_member_access to service_role;

create or replace function public.aiw_accept_company_invitation(p_invitation uuid,p_user uuid,p_email text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare inv public.aiw_company_member_invitations;
begin
  select * into inv from public.aiw_company_member_invitations where id=p_invitation for update;
  if not found or inv.status<>'pending' or inv.expires_at<=now() then raise exception 'INVALID_OR_EXPIRED_INVITATION'; end if;
  if lower(trim(p_email))<>inv.email_normalized then raise exception 'INVITATION_EMAIL_MISMATCH'; end if;
  insert into public.organization_members(organization_id,user_id,role,membership_status,invited_at,joined_at)
  values(inv.organization_id,p_user,inv.membership_role,'active',inv.invited_at,now())
  on conflict(organization_id,user_id) do update set role=excluded.role,membership_status='active',joined_at=coalesce(public.organization_members.joined_at,now());
  insert into public.aiw_company_member_access(organization_id,user_id,role_label,billing_source,allowed_modes,allowed_prompt_profiles,allowed_models,enabled,created_by)
  values(inv.organization_id,p_user,inv.role_label,inv.billing_source,inv.allowed_modes,inv.allowed_prompt_profiles,inv.allowed_models,true,inv.invited_by)
  on conflict(organization_id,user_id) do update set role_label=excluded.role_label,billing_source=excluded.billing_source,allowed_modes=excluded.allowed_modes,allowed_prompt_profiles=excluded.allowed_prompt_profiles,allowed_models=excluded.allowed_models,enabled=true,updated_at=now();
  insert into public.usage_wallets(payer_type,organization_id,currency,status)
  values('company',inv.organization_id,'USD','active')
  on conflict(organization_id) where organization_id is not null and payer_type='company' do nothing;
  update public.aiw_company_member_invitations set status='accepted',accepted_by=p_user,accepted_at=now() where id=inv.id;
  return jsonb_build_object('organizationId',inv.organization_id,'role',inv.membership_role,'roleLabel',inv.role_label,'billingSource',inv.billing_source);
end $$;
revoke all on function public.aiw_accept_company_invitation(uuid,uuid,text) from public,anon,authenticated;
grant execute on function public.aiw_accept_company_invitation(uuid,uuid,text) to service_role;
