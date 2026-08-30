-- RYTHM OS — Phase 5 readiness RPC hardening
-- Readiness data includes protected evaluation evidence, so browser-authenticated clients must not execute the SECURITY DEFINER function directly.
-- Server-side assessment and benchmark runtimes use the service-role evaluation boundary.

begin;

revoke all on function public.agent_level_readiness(uuid,text) from public, anon, authenticated;
grant execute on function public.agent_level_readiness(uuid,text) to service_role;

commit;
