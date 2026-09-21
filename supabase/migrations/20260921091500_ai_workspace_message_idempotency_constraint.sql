-- Make AI Workspace message idempotency compatible with PostgREST ON CONFLICT.
-- PostgreSQL unique indexes permit multiple NULL values, so a non-partial unique index
-- preserves legacy rows without client_request_key while allowing deterministic upserts.
drop index if exists public.aiw_message_client_role_unique;
create unique index aiw_message_client_role_unique
  on public.aiw_messages(workspace_id, client_request_key, role);
