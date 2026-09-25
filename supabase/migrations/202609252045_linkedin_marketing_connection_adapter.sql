-- Prepare LinkedIn Marketing for customer OAuth connection after provider approval.
-- Access remains read-only by default; publishing/write permissions are not enabled here.

update public.integration_providers
set
  supports_oauth = true,
  supports_token = false,
  setup_availability = 'setup_available',
  connection_adapter_key = 'linkedin_marketing',
  resource_discovery_supported = true,
  ai_setup_enabled = false,
  ai_setup_rollout = 'off',
  setup_plan = jsonb_build_object(
    'authorization', 'oauth',
    'redirect_uri', 'https://rythm-os.com/api/integrations/linkedin-marketing/callback',
    'resource_type', 'linkedin_organization',
    'resource_discovery', 'organizationAcls approved administrator pages',
    'api_version', '202609',
    'scopes', jsonb_build_array('r_organization_admin', 'r_organization_social'),
    'readonly', true,
    'provider_approval_required', true
  ),
  updated_at = now()
where provider_key = 'linkedin_marketing';
