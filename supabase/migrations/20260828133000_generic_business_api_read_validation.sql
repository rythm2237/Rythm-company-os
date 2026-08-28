-- RYTHM OS — Phase 4 Generic Business API controlled read pilot
-- Enables only the read path needed for Production validation. External writes remain fail-closed.

begin;

insert into public.integration_tool_registry (
  tool_id,
  integration_key,
  name,
  version,
  category,
  metadata,
  adapter_version,
  enabled,
  kill_switch,
  updated_at
)
values (
  'generic_business_api.request',
  'generic_business_api',
  'Generic Business API',
  '1.0.0-pilot',
  'business_integration',
  jsonb_build_object(
    'operations', jsonb_build_array('api.read','api.write','webhook.send'),
    'pilot', 'read_only',
    'file_exchange_enabled', false
  ),
  'generic-business-api-v1',
  true,
  false,
  now()
)
on conflict (tool_id) do update set
  integration_key = excluded.integration_key,
  name = excluded.name,
  version = excluded.version,
  category = excluded.category,
  metadata = excluded.metadata,
  adapter_version = excluded.adapter_version,
  enabled = true,
  kill_switch = false,
  updated_at = now();

update public.integration_providers
set enabled = true, kill_switch = false, updated_at = now()
where provider_key = 'generic_business_api';

update public.integration_capabilities
set enabled = (capability_key = 'api.read'),
    kill_switch = false
where provider_key = 'generic_business_api'
  and capability_key in ('api.read','api.write','webhook.send','file.exchange');

commit;
