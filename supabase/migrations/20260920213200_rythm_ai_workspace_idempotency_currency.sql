-- Retry-safe AI usage and explicit provider-cost currency semantics.
alter table public.usage_wallets alter column currency set default 'USD';
alter table public.usage_ledger alter column currency set default 'USD';

alter table public.ai_usage_requests add column if not exists internal_result text;
alter table public.ai_usage_requests add column if not exists client_request_key text;
alter table public.aiw_messages add column if not exists client_request_key text;

create unique index if not exists ai_usage_client_stage_unique
  on public.ai_usage_requests(workspace_id, client_request_key, request_kind)
  where client_request_key is not null;

create unique index if not exists ai_usage_answer_inflight
  on public.ai_usage_requests(conversation_id)
  where conversation_id is not null and request_kind='answer' and status in ('reserved','provider_started','uncertain');

create unique index if not exists aiw_message_client_role_unique
  on public.aiw_messages(workspace_id, client_request_key, role)
  where client_request_key is not null;

create or replace function public.aiw_reserve_usage(
  p_wallet uuid, p_workspace uuid, p_request uuid, p_idempotency text,
  p_amount bigint, p_kind text, p_mode text, p_profile text,
  p_user uuid default null, p_organization uuid default null,
  p_agent uuid default null, p_conversation uuid default null,
  p_client_request_key text default null
) returns boolean language plpgsql security invoker set search_path='' as $$
declare
  w public.usage_wallets;
  account public.aiw_accounts;
  posted bigint;
  pending bigint;
  daily_spend bigint;
  monthly_spend bigint;
begin
  if p_amount <= 0 or length(p_idempotency) > 240 or (p_client_request_key is not null and length(p_client_request_key) > 120) then return false; end if;
  select * into w from public.usage_wallets where id=p_wallet for update;
  if not found or w.status <> 'active' then return false; end if;
  if exists(select 1 from public.ai_usage_requests where idempotency_key=p_idempotency or id=p_request) then return false; end if;
  select coalesce(sum(amount_micros),0) into posted from public.usage_ledger where wallet_id=p_wallet;
  select coalesce(sum(reserved_micros),0) into pending from public.ai_usage_requests where wallet_id=p_wallet and status in ('reserved','provider_started','uncertain');
  if posted - pending < p_amount then return false; end if;
  if w.personal_account_id is not null then
    select * into account from public.aiw_accounts where id=w.personal_account_id for update;
    if not found or account.status <> 'active' or (account.expires_at is not null and account.expires_at <= now()) or p_amount > account.max_request_micros then return false; end if;
    select coalesce(-sum(amount_micros),0) into daily_spend from public.usage_ledger where wallet_id=p_wallet and transaction_type='ai_usage_debit' and created_at >= date_trunc('day', now() at time zone 'UTC') at time zone 'UTC';
    select coalesce(-sum(amount_micros),0) into monthly_spend from public.usage_ledger where wallet_id=p_wallet and transaction_type='ai_usage_debit' and created_at >= date_trunc('month', now() at time zone 'UTC') at time zone 'UTC';
    if account.daily_limit_micros > 0 and daily_spend + pending + p_amount > account.daily_limit_micros then return false; end if;
    if account.monthly_limit_micros > 0 and monthly_spend + pending + p_amount > account.monthly_limit_micros then return false; end if;
  end if;
  insert into public.ai_usage_requests(id,wallet_id,workspace_id,organization_id,user_id,agent_id,conversation_id,request_kind,routing_mode,prompt_profile,reserved_micros,status,idempotency_key,client_request_key)
  values(p_request,p_wallet,p_workspace,p_organization,p_user,p_agent,p_conversation,p_kind,p_mode,p_profile,p_amount,'reserved',p_idempotency,p_client_request_key);
  return true;
exception when unique_violation then
  return false;
end $$;

create or replace function public.aiw_settle_usage(p_request uuid, p_actual bigint, p_metadata jsonb default '{}', p_internal_result text default null)
returns boolean language plpgsql security invoker set search_path='' as $$
declare r public.ai_usage_requests;
begin
  if p_actual < 0 or (p_internal_result is not null and length(p_internal_result) > 500000) then return false; end if;
  select * into r from public.ai_usage_requests where id=p_request for update;
  if not found or r.status not in ('reserved','provider_started') or p_actual > r.reserved_micros then return false; end if;
  insert into public.usage_ledger(wallet_id,request_id,transaction_type,amount_micros,currency,source,metadata,actor_user_id)
  values(r.wallet_id,r.id,'ai_usage_debit',-p_actual,'USD','ai_workspace',p_metadata,r.user_id);
  update public.ai_usage_requests set actual_micros=p_actual,internal_result=p_internal_result,status='settled',settled_at=now() where id=p_request;
  return true;
end $$;

revoke all on function public.aiw_reserve_usage(uuid,uuid,uuid,text,bigint,text,text,text,uuid,uuid,uuid,uuid,text) from public, anon, authenticated;
grant execute on function public.aiw_reserve_usage(uuid,uuid,uuid,text,bigint,text,text,text,uuid,uuid,uuid,uuid,text) to service_role;
revoke all on function public.aiw_settle_usage(uuid,bigint,jsonb,text) from public, anon, authenticated;
grant execute on function public.aiw_settle_usage(uuid,bigint,jsonb,text) to service_role;
