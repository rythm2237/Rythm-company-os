-- Phase 2 hotfix: make the validation execution idempotency key inferable by PostgREST/Supabase upsert.
-- PostgreSQL UNIQUE constraints already allow multiple NULLs, so the previous partial unique index
-- is unnecessary and cannot be targeted by ON CONFLICT(execution_request_id).

drop index if exists public.execution_validation_request_unique;

alter table public.execution_validation_records
  drop constraint if exists execution_validation_records_execution_request_id_key;

alter table public.execution_validation_records
  add constraint execution_validation_records_execution_request_id_key
  unique (execution_request_id);
