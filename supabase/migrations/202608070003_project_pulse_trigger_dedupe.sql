-- Ensure only one execution-plan approval trigger invokes the Pulse-aware function.
-- Migration 001 used approval_execution_plan_resolution; migration 002 introduced
-- trg_apply_execution_plan_approval. Drop both names and recreate one canonical trigger.

drop trigger if exists approval_execution_plan_resolution on public.approval_requests;
drop trigger if exists trg_apply_execution_plan_approval on public.approval_requests;

create trigger approval_execution_plan_resolution
after update of status on public.approval_requests
for each row execute function public.apply_execution_plan_approval();
