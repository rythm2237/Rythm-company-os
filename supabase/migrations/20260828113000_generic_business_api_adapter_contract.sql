-- RYTHM OS — Phase 4 Generic Business API runtime binding
-- Binds the fail-closed provider contract to the canonical execution tool.
-- Provider and capabilities intentionally remain disabled until controlled Production validation passes.

begin;

update public.integration_capabilities
set
  tool_id = 'generic_business_api.request',
  operation = capability_key,
  adapter_version = 'generic-business-api-v1'
where provider_key = 'generic_business_api'
  and capability_key in ('api.read','api.write','webhook.send','file.exchange');

-- File exchange remains contract-only. It is deliberately not executable in v1.
update public.integration_capabilities
set enabled = false
where provider_key = 'generic_business_api'
  and capability_key = 'file.exchange';

-- Do not enable the provider or any capability in this migration.
update public.integration_providers
set enabled = false, updated_at = now()
where provider_key = 'generic_business_api';

update public.integration_capabilities
set enabled = false
where provider_key = 'generic_business_api';

commit;
