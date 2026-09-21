alter table public.aiw_plan_credit_grants
  drop constraint if exists aiw_plan_credit_grants_grant_type_check;

alter table public.aiw_plan_credit_grants
  add constraint aiw_plan_credit_grants_grant_type_check
  check (grant_type = any (array['free_trial'::text,'starter_cycle'::text,'pro_cycle'::text,'power_cycle'::text]));
