-- Universal Connection Flight Deck rollout
-- Keep the feature internal/allowlisted while enabling the same governed Agent experience
-- across all priority customer connection providers.

update public.integration_providers
set
  ai_setup_enabled = true,
  ai_setup_rollout = 'internal',
  browser_playbook_ready = true,
  updated_at = now()
where provider_key in (
  'google_search_console',
  'google_analytics',
  'google_workspace',
  'microsoft_365',
  'github',
  'vercel',
  'supabase',
  'cloudflare'
);
