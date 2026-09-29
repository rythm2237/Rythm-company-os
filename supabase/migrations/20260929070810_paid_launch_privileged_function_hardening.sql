-- The paid-plan grant is invoked by the verified payment trigger, never by a
-- browser RPC. Trigger execution uses the function owner's privileges.
revoke all on function public.aiw_apply_paid_plan_invoice(
  uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz
) from public, anon, authenticated;
grant execute on function public.aiw_apply_paid_plan_invoice(
  uuid, uuid, uuid, text, text, text, text, timestamptz, timestamptz
) to service_role;

-- Trigger-only helpers are not RPC endpoints. Their trigger dependencies are
-- preserved; EXECUTE grants for API roles are unnecessary.
revoke all on function public.aiw_apply_paid_plan_payment_trigger() from public, anon, authenticated;
revoke all on function public.aiw_apply_starter_payment_trigger() from public, anon, authenticated;
revoke all on function public.aiw_sync_paid_plan_subscription_trigger() from public, anon, authenticated;
revoke all on function public.aiw_sync_starter_subscription_trigger() from public, anon, authenticated;
revoke all on function public.nail_2nya_emit_realtime_event() from public, anon, authenticated;

-- Scheduled by pg_cron as postgres; public clients must not schedule a
-- cross-tenant notification write through this definer function.
revoke all on function public.generate_communication_daily_digest() from public, anon, authenticated;
grant execute on function public.generate_communication_daily_digest() to service_role;

-- Provider state is written by the signature-verified billing webhook using
-- service_role. Tenant members retain their existing RLS-protected read path.
revoke insert, update, delete, truncate, references, trigger
  on public.billing_payments, public.billing_subscriptions
  from public, anon, authenticated;
