-- Phase 1B least-privilege follow-up: service-role telemetry/configuration
-- writers do not need TRUNCATE, REFERENCES or TRIGGER privileges.

revoke all on table public.ai_routing_decisions from service_role;
grant select, insert, update, delete on table public.ai_routing_decisions to service_role;

revoke all on table public.ai_routing_rollout_config from service_role;
grant select, insert, update, delete on table public.ai_routing_rollout_config to service_role;
