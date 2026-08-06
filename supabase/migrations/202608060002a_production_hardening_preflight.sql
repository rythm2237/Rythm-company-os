-- Preflight for production hardening migration.
-- The previous agent-run trigger requires an authenticated Owner context and
-- therefore blocks administrative backfill updates executed from Supabase SQL Editor.
-- The main production-hardening migration recreates this trigger with the new guardrails.

drop trigger if exists agent_run_control_plane_guardrails on public.agent_runs;
