update public.integration_providers
set
  setup_availability = 'available',
  connection_adapter_key = 'youtube',
  resource_discovery_supported = true,
  updated_at = now()
where provider_key = 'youtube';
