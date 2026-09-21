-- RYTHM AI Workspace guest lifecycle. Guest execution is tenant-bound but paid from the guest wallet.
alter table public.aiw_guest_codes add column if not exists organization_id uuid references public.organizations(id) on delete cascade;
alter table public.aiw_guest_codes add column if not exists allowed_prompt_profiles text[] not null default array['normal']::text[];
alter table public.aiw_guest_codes alter column organization_id set not null;

create or replace function public.aiw_activate_guest_session(p_code_hash text,p_device_hash text,p_session_hash text)
returns jsonb language plpgsql security invoker set search_path='' as $$
declare
  c public.aiw_guest_codes;
  account_id uuid;
  workspace_id uuid;
  project_id uuid;
  conversation_id uuid;
  wallet_id uuid;
  session_id uuid;
  session_expires timestamptz;
  active_devices integer;
  seen_device boolean;
begin
  if p_code_hash !~ '^[a-f0-9]{64}$' or p_device_hash !~ '^[a-f0-9]{64}$' or p_session_hash !~ '^[a-f0-9]{64}$' then raise exception 'INVALID_GUEST_CREDENTIAL'; end if;
  select * into c from public.aiw_guest_codes where code_hash=p_code_hash for update;
  if not found or c.status<>'active' or (c.expires_at is not null and c.expires_at<=now()) or c.activation_count>=c.activation_limit then raise exception 'INVALID_GUEST_CODE'; end if;
  select exists(select 1 from public.aiw_guest_sessions where guest_code_id=c.id and device_hash=p_device_hash and revoked_at is null and expires_at>now()) into seen_device;
  select count(distinct device_hash) into active_devices from public.aiw_guest_sessions where guest_code_id=c.id and revoked_at is null and expires_at>now();
  if not seen_device and active_devices>=c.device_limit then raise exception 'GUEST_DEVICE_LIMIT'; end if;
  session_expires := least(coalesce(c.expires_at,now()+interval '7 days'),now()+interval '7 days');
  insert into public.aiw_accounts(kind,status,daily_limit_micros,monthly_limit_micros,max_request_micros,allowed_modes,allowed_prompt_profiles,allowed_models,expires_at)
  values('guest','active',c.daily_limit_micros,c.monthly_limit_micros,c.per_request_cap_micros,c.allowed_modes,c.allowed_prompt_profiles,c.allowed_models,session_expires)
  returning id into account_id;
  insert into public.aiw_workspaces(account_id,kind,name) values(account_id,'personal','Guest AI Workspace') returning id into workspace_id;
  insert into public.aiw_projects(workspace_id,name) values(workspace_id,'General') returning id into project_id;
  insert into public.aiw_conversations(workspace_id,project_id,title) values(workspace_id,project_id,'Guest chat') returning id into conversation_id;
  insert into public.usage_wallets(payer_type,personal_account_id,currency) values('guest',account_id,'USD') returning id into wallet_id;
  if c.initial_credit_micros>0 then
    insert into public.usage_ledger(wallet_id,transaction_type,amount_micros,currency,source,metadata)
    values(wallet_id,'guest_credit',c.initial_credit_micros,'USD','guest_code',jsonb_build_object('guest_code_id',c.id));
  end if;
  insert into public.aiw_guest_sessions(account_id,guest_code_id,session_hash,device_hash,expires_at)
  values(account_id,c.id,p_session_hash,p_device_hash,session_expires) returning id into session_id;
  update public.aiw_guest_codes set activation_count=activation_count+1 where id=c.id;
  return jsonb_build_object('accountId',account_id,'workspaceId',workspace_id,'projectId',project_id,'conversationId',conversation_id,'walletId',wallet_id,'organizationId',c.organization_id,'sessionId',session_id,'expiresAt',session_expires,'currency','USD','initialCreditMicros',c.initial_credit_micros);
end $$;

create or replace function public.aiw_validate_guest_session(p_session_hash text,p_device_hash text)
returns jsonb language sql security invoker set search_path='' as $$
  select jsonb_build_object(
    'accountId',a.id,'workspaceId',w.id,'projectId',p.id,'walletId',uw.id,'organizationId',gc.organization_id,
    'conversationId',(select c.id from public.aiw_conversations c where c.workspace_id=w.id and c.project_id=p.id and not c.archived order by c.created_at limit 1),
    'allowedModes',a.allowed_modes,'allowedPromptProfiles',a.allowed_prompt_profiles,'allowedModels',a.allowed_models,
    'maxRequestMicros',a.max_request_micros,'currency',uw.currency
  )
  from public.aiw_guest_sessions s
  join public.aiw_accounts a on a.id=s.account_id
  join public.aiw_guest_codes gc on gc.id=s.guest_code_id
  join public.aiw_workspaces w on w.account_id=a.id and w.kind='personal'
  join public.aiw_projects p on p.workspace_id=w.id and not p.archived
  join public.usage_wallets uw on uw.personal_account_id=a.id and uw.payer_type='guest' and uw.status='active'
  where s.session_hash=p_session_hash and s.device_hash=p_device_hash and s.revoked_at is null and s.expires_at>now()
    and a.kind='guest' and a.status='active' and (a.expires_at is null or a.expires_at>now())
    and gc.status='active' and (gc.expires_at is null or gc.expires_at>now())
  order by p.created_at limit 1;
$$;

create or replace function public.aiw_revoke_guest_session(p_session_hash text,p_device_hash text)
returns boolean language plpgsql security invoker set search_path='' as $$
declare changed integer;
begin
  update public.aiw_guest_sessions set revoked_at=now() where session_hash=p_session_hash and device_hash=p_device_hash and revoked_at is null;
  get diagnostics changed=row_count;
  return changed>0;
end $$;

do $$ declare f record; begin
  for f in select p.oid::regprocedure sig from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in ('aiw_activate_guest_session','aiw_validate_guest_session','aiw_revoke_guest_session') loop
    execute format('revoke all on function %s from public, anon, authenticated',f.sig);
    execute format('grant execute on function %s to service_role',f.sig);
  end loop;
end $$;
