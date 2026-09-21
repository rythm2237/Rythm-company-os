alter table public.aiw_accounts
  drop constraint if exists aiw_accounts_plan_code_check;

alter table public.aiw_accounts
  add constraint aiw_accounts_plan_code_check
  check (plan_code is null or plan_code = any (array['free_trial'::text,'starter'::text,'pro'::text,'power'::text]));
