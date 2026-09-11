-- Prepare Authority Monitoring to use Crawly's read-only backlink API.
-- Activation remains fail-closed until CRAWLY_API_KEY is present and a live provider check succeeds.

update public.automation_tasks
set
  config = coalesce(config, '{}'::jsonb) || jsonb_build_object(
    'provider', 'crawly',
    'provider_state', 'CONFIGURATION_REQUIRED',
    'required_integration', 'crawly_backlink_api',
    'required_env', 'CRAWLY_API_KEY',
    'domain', 'rythm-os.com',
    'endpoint', 'https://www.getcrawly.com/api/v1/backlinks',
    'free_tier_requests_per_day', 100,
    'index_refresh', 'monthly'
  ),
  configuration_status = 'needs_configuration',
  updated_at = now()
where slug = 'authority-monitoring';
