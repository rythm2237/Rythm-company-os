export type ConnectionSetupStepType =
  | "NAVIGATE" | "READ_PAGE" | "CLICK" | "TYPE_SAFE_VALUE" | "SELECT" | "WAIT" | "VERIFY_PAGE"
  | "OAUTH_START" | "USER_LOGIN" | "USER_MFA" | "USER_CONSENT" | "RESOURCE_DISCOVERY"
  | "RESOURCE_SELECTION" | "RESOURCE_BINDING" | "CONNECTION_VERIFY" | "COMPLETE";

export type ConnectionHumanActionType =
  | "LOGIN_REQUIRED" | "MFA_REQUIRED" | "CAPTCHA_REQUIRED" | "CONSENT_REQUIRED"
  | "ADMIN_CONSENT_REQUIRED" | "RESOURCE_CHOICE_REQUIRED" | "BUSINESS_DECISION_REQUIRED"
  | "PAYMENT_REQUIRED" | "LEGAL_ACCEPTANCE_REQUIRED";

export type SetupAutomationMode = "automatic" | "human_only" | "api_first" | "browser_if_needed";
export type AiSetupSupport = "ready" | "oauth_only" | "manual_handoff" | "unsupported";

export type ConnectionSetupStep = {
  stepKey: string;
  title: string;
  description: string;
  type: ConnectionSetupStepType;
  automationMode: SetupAutomationMode;
  expectedUrl?: string;
  targetHint?: string;
  inputRequirements?: string[];
  completionCondition: string;
  risk: "low" | "medium" | "high";
  userInteractionRequired: boolean;
  humanActionType?: ConnectionHumanActionType;
  retryPolicy: { maxAttempts: number; backoffSeconds: number };
};

export type ProviderSetupPlan = {
  setupPlanId: string;
  providerKey: string;
  version: number;
  title: string;
  intro: string;
  securityNote: string;
  purpose: string;
  requiredResourceType: string | null;
  aiSetupSupport: AiSetupSupport;
  entryUrl: string;
  allowedHosts: string[];
  safeAutomatedActions: string[];
  humanOnlyActions: string[];
  resourceDiscoveryMethod: string;
  verificationMethod: string;
  reauthorizationPath: string;
  failurePatterns: string[];
  steps: ConnectionSetupStep[];
};

const retry = { maxAttempts: 3, backoffSeconds: 5 } as const;
const step = (value: Omit<ConnectionSetupStep, "retryPolicy"> & { retryPolicy?: ConnectionSetupStep["retryPolicy"] }): ConnectionSetupStep => ({ ...value, retryPolicy: value.retryPolicy ?? retry });

const oauthPlan = (input: Omit<ProviderSetupPlan, "steps"> & { consentAction?: ConnectionHumanActionType }): ProviderSetupPlan => ({
  ...input,
  steps: [
    step({ stepKey: "open_authorization", title: "Open authorization", description: `Open ${input.title} authorization using the provider-approved entry point.`, type: "OAUTH_START", automationMode: "api_first", expectedUrl: input.entryUrl, completionCondition: "Provider authorization flow started", risk: "low", userInteractionRequired: false }),
    step({ stepKey: "identity", title: "Sign in", description: "Human identity verification is required. RYTHM must not enter passwords, passkeys or MFA codes.", type: "USER_LOGIN", automationMode: "human_only", completionCondition: "Provider confirms authenticated identity", risk: "medium", userInteractionRequired: true, humanActionType: "LOGIN_REQUIRED" }),
    step({ stepKey: "consent", title: "Review consent", description: "Review the provider permission request, installation scope or resource access. Broad or admin consent is never approved autonomously.", type: "USER_CONSENT", automationMode: "human_only", completionCondition: "Provider returns successful authorization callback", risk: "medium", userInteractionRequired: true, humanActionType: input.consentAction ?? "CONSENT_REQUIRED" }),
    step({ stepKey: "discover", title: "Discover resources", description: "Read the resources available to the verified account using the provider API.", type: "RESOURCE_DISCOVERY", automationMode: "api_first", completionCondition: "Verified provider resources persisted", risk: "low", userInteractionRequired: false }),
    step({ stepKey: "select", title: "Select project resource", description: "Recommend only a clearly matching project resource. Ambiguity requires Human choice.", type: "RESOURCE_SELECTION", automationMode: "browser_if_needed", completionCondition: "One exact project resource selected or confirmed", risk: "medium", userInteractionRequired: true, humanActionType: "RESOURCE_CHOICE_REQUIRED" }),
    step({ stepKey: "bind", title: "Bind verified resource", description: "Bind the selected verified resource with least-privilege capabilities.", type: "RESOURCE_BINDING", automationMode: "automatic", completionCondition: "Verified project binding exists", risk: "low", userInteractionRequired: false }),
    step({ stepKey: "verify", title: "Verify connection", description: "Confirm provider access and required project binding before completing the roadmap dependency.", type: "CONNECTION_VERIFY", automationMode: "api_first", completionCondition: "Provider access and project binding both verified", risk: "low", userInteractionRequired: false }),
    step({ stepKey: "complete", title: "Complete", description: "Mark the setup complete only after verification evidence exists.", type: "COMPLETE", automationMode: "automatic", completionCondition: "Session completed with audit evidence", risk: "low", userInteractionRequired: false }),
  ],
});

const tokenPlan = (input: Omit<ProviderSetupPlan, "steps">): ProviderSetupPlan => ({
  ...input,
  steps: [
    step({ stepKey: "open_provider", title: "Open provider settings", description: `Open ${input.title} account settings on an allowlisted provider domain.`, type: "NAVIGATE", automationMode: "browser_if_needed", expectedUrl: input.entryUrl, completionCondition: "Provider settings page reached", risk: "low", userInteractionRequired: false }),
    step({ stepKey: "human_credential", title: "Create restricted credential", description: "Credential creation and any sensitive value handling stays under Human control. RYTHM never reads password/MFA fields or browser password-manager data.", type: "USER_CONSENT", automationMode: "human_only", completionCondition: "Human completes provider credential authorization", risk: "medium", userInteractionRequired: true, humanActionType: "CONSENT_REQUIRED" }),
    step({ stepKey: "verify", title: "Verify provider access", description: "Verify the provider-issued credential against the provider API before storing a Connected state.", type: "CONNECTION_VERIFY", automationMode: "api_first", completionCondition: "Provider API verification succeeds", risk: "low", userInteractionRequired: true, humanActionType: "BUSINESS_DECISION_REQUIRED" }),
    step({ stepKey: "discover", title: "Discover resources", description: "Discover resources using the verified provider API credential.", type: "RESOURCE_DISCOVERY", automationMode: "api_first", completionCondition: "Verified resources persisted", risk: "low", userInteractionRequired: false }),
    step({ stepKey: "select", title: "Select project resource", description: "Recommend a clear match; require Human confirmation when multiple resources are plausible.", type: "RESOURCE_SELECTION", automationMode: "automatic", completionCondition: "One exact project resource selected or confirmed", risk: "medium", userInteractionRequired: true, humanActionType: "RESOURCE_CHOICE_REQUIRED" }),
    step({ stepKey: "bind", title: "Bind verified resource", description: "Bind only the selected resource and requested capabilities.", type: "RESOURCE_BINDING", automationMode: "automatic", completionCondition: "Verified binding exists", risk: "low", userInteractionRequired: false }),
    step({ stepKey: "complete", title: "Complete", description: "Complete after provider verification and binding evidence exist.", type: "COMPLETE", automationMode: "automatic", completionCondition: "Session completed with audit evidence", risk: "low", userInteractionRequired: false }),
  ],
});

export const PROVIDER_SETUP_PLANS: Record<string, ProviderSetupPlan> = {
  google_search_console: oauthPlan({ setupPlanId: "google_search_console.customer.v2", providerKey: "google_search_console", version: 2, title: "Google Search Console", intro: "Connect the Search Console property used for SEO evidence and monitoring.", securityNote: "RYTHM never enters your Google password or MFA code. Read-only Search Console access is the default.", purpose: "Search indexing evidence, query analysis and SEO monitoring", requiredResourceType: "search_console_property", aiSetupSupport: "oauth_only", entryUrl: "https://accounts.google.com/", allowedHosts: ["rythm-os.com", "accounts.google.com", "oauth2.googleapis.com", "www.googleapis.com", "search.google.com", "searchconsole.google.com", "searchconsole.googleapis.com"], safeAutomatedActions: ["navigate", "read", "start_oauth", "discover_resources", "verify_read_access"], humanOnlyActions: ["password", "mfa", "passkey", "captcha", "consent", "ambiguous_resource_choice"], resourceDiscoveryMethod: "Google Search Console API sites.list", verificationMethod: "read-only Search Console API access", reauthorizationPath: "/api/integrations/google-search-console/connect", failurePatterns: ["wrong_account", "oauth_cancelled", "missing_scope", "no_properties", "token_expired"] }),
  google_analytics: oauthPlan({ setupPlanId: "google_analytics.customer.v2", providerKey: "google_analytics", version: 2, title: "Google Analytics 4", intro: "Connect the GA4 property used to measure traffic and conversion outcomes.", securityNote: "Analytics setup remains read-only for normal project analysis.", purpose: "Traffic and conversion measurement", requiredResourceType: "ga4_property", aiSetupSupport: "oauth_only", entryUrl: "https://accounts.google.com/", allowedHosts: ["rythm-os.com", "accounts.google.com", "oauth2.googleapis.com", "analytics.google.com", "analyticsadmin.googleapis.com", "www.googleapis.com"], safeAutomatedActions: ["navigate", "read", "start_oauth", "discover_resources", "verify_read_access"], humanOnlyActions: ["password", "mfa", "passkey", "captcha", "consent", "ambiguous_resource_choice"], resourceDiscoveryMethod: "Google Analytics Admin API accounts/properties", verificationMethod: "read-only Analytics Admin API access", reauthorizationPath: "/api/integrations/google-analytics/connect", failurePatterns: ["wrong_account", "oauth_cancelled", "missing_scope", "no_properties", "token_expired"] }),
  google_workspace: oauthPlan({ setupPlanId: "google_workspace.customer.v2", providerKey: "google_workspace", version: 2, title: "Google Workspace", intro: "Connect the company Google account through the normal Google sign-in flow.", securityNote: "Passwords, passkeys and MFA stay on Google-owned pages and are never recorded by RYTHM.", purpose: "Company Google identity and approved Workspace access", requiredResourceType: null, aiSetupSupport: "oauth_only", entryUrl: "https://accounts.google.com/", allowedHosts: ["rythm-os.com", "accounts.google.com", "oauth2.googleapis.com", "www.googleapis.com", "workspace.google.com"], safeAutomatedActions: ["navigate", "read", "start_oauth", "verify_profile"], humanOnlyActions: ["password", "mfa", "passkey", "captcha", "consent", "admin_consent"], resourceDiscoveryMethod: "Provider profile / capability-specific APIs", verificationMethod: "Google userinfo verification", reauthorizationPath: "/api/integrations/google-workspace/connect", failurePatterns: ["wrong_account", "oauth_cancelled", "admin_consent_required", "token_expired"] }),
  microsoft_365: oauthPlan({ setupPlanId: "microsoft_365.customer.v3", providerKey: "microsoft_365", version: 3, title: "Microsoft 365", intro: "Connect the intended Microsoft tenant/account with least-privilege Graph access.", securityNote: "RYTHM never enters Microsoft passwords, passkeys or MFA codes. Organization-wide admin consent is Human-only.", purpose: "Microsoft 365 identity, mail and calendar read access", requiredResourceType: null, aiSetupSupport: "oauth_only", entryUrl: "https://login.microsoftonline.com/", allowedHosts: ["rythm-os.com", "login.microsoftonline.com", "microsoft.com", "www.microsoft.com", "office.com", "graph.microsoft.com"], safeAutomatedActions: ["navigate", "read", "start_oauth", "verify_graph_access"], humanOnlyActions: ["password", "mfa", "passkey", "captcha", "consent", "admin_consent"], resourceDiscoveryMethod: "Microsoft Graph identity / capability APIs", verificationMethod: "Microsoft Graph identity, Mail.Read and Calendars.Read scopes", reauthorizationPath: "/api/integrations/microsoft-365/connect", failurePatterns: ["wrong_account", "oauth_cancelled", "mfa_timeout", "admin_consent_required", "token_expired"] }),
  github: oauthPlan({ setupPlanId: "github.customer.v3", providerKey: "github", version: 3, title: "GitHub", intro: "Install the RYTHM GitHub App and choose only the repositories this company is allowed to use.", securityNote: "Repository access is installation-scoped. RYTHM stores the installation identity, not a long-lived personal token.", purpose: "Repository discovery and project binding", requiredResourceType: "repository", aiSetupSupport: "oauth_only", entryUrl: "https://github.com/", allowedHosts: ["rythm-os.com", "github.com", "api.github.com"], safeAutomatedActions: ["navigate", "read", "start_oauth", "discover_repositories", "verify_installation"], humanOnlyActions: ["password", "mfa", "passkey", "captcha", "app_installation", "repository_selection", "ambiguous_repository_choice"], resourceDiscoveryMethod: "GitHub App installation repositories", verificationMethod: "GitHub App installation identity + installation repository listing", reauthorizationPath: "/api/integrations/github/connect", failurePatterns: ["installation_cancelled", "installation_removed", "sso_required", "no_repositories"] }),
  vercel: oauthPlan({ setupPlanId: "vercel.customer.v3", providerKey: "vercel", version: 3, title: "Vercel", intro: "Install the RYTHM Vercel integration for the account or team that owns the intended projects.", securityNote: "Production deployment authority remains separate from read-only project discovery and is governed by approvals.", purpose: "Deployment project discovery and binding", requiredResourceType: "project", aiSetupSupport: "oauth_only", entryUrl: "https://vercel.com/integrations", allowedHosts: ["rythm-os.com", "vercel.com", "api.vercel.com"], safeAutomatedActions: ["navigate", "read", "start_oauth", "discover_projects", "verify_read_access"], humanOnlyActions: ["password", "mfa", "passkey", "captcha", "installation_consent", "team_choice", "production_change"], resourceDiscoveryMethod: "Vercel Integration OAuth + Projects API", verificationMethod: "Vercel user/team and projects APIs", reauthorizationPath: "/api/integrations/vercel/connect", failurePatterns: ["installation_cancelled", "wrong_team", "no_projects", "authorization_revoked"] }),
  supabase: oauthPlan({ setupPlanId: "supabase.customer.v3", providerKey: "supabase", version: 3, title: "Supabase", intro: "Authorize the RYTHM OAuth App for the Supabase organization that owns the intended project.", securityNote: "Project discovery does not grant autonomous database writes. Schema/data changes remain separately governed.", purpose: "Supabase project discovery and binding", requiredResourceType: "project", aiSetupSupport: "oauth_only", entryUrl: "https://api.supabase.com/v1/oauth/authorize", allowedHosts: ["rythm-os.com", "supabase.com", "api.supabase.com"], safeAutomatedActions: ["navigate", "read", "start_oauth", "discover_projects", "verify_read_access"], humanOnlyActions: ["password", "mfa", "passkey", "captcha", "consent", "database_write"], resourceDiscoveryMethod: "Supabase OAuth + Management API projects", verificationMethod: "Supabase Management API project listing", reauthorizationPath: "/api/integrations/supabase/connect", failurePatterns: ["oauth_cancelled", "no_projects", "token_expired", "authorization_revoked"] }),
  cloudflare: oauthPlan({ setupPlanId: "cloudflare.customer.v3", providerKey: "cloudflare", version: 3, title: "Cloudflare", intro: "Authorize the RYTHM Cloudflare OAuth client for the account and zones this company is expected to use.", securityNote: "Initial setup requests scoped read access. DNS/edge changes remain approval-governed capabilities.", purpose: "Cloudflare zone discovery and binding", requiredResourceType: "zone", aiSetupSupport: "oauth_only", entryUrl: "https://dash.cloudflare.com/oauth2/auth", allowedHosts: ["rythm-os.com", "dash.cloudflare.com", "cloudflare.com", "api.cloudflare.com"], safeAutomatedActions: ["navigate", "read", "start_oauth", "discover_zones", "verify_read_access"], humanOnlyActions: ["password", "mfa", "passkey", "captcha", "consent", "account_choice", "dns_change"], resourceDiscoveryMethod: "Cloudflare OAuth + Zones API", verificationMethod: "Cloudflare OAuth identity + zone listing", reauthorizationPath: "/api/integrations/cloudflare/connect", failurePatterns: ["oauth_cancelled", "missing_zone_scope", "no_zones", "token_expired"] }),
};

export function getCanonicalSetupPlan(providerKey: string) {
  return PROVIDER_SETUP_PLANS[providerKey] ?? null;
}

export function listPriorityProviderSetupPlans() {
  return Object.values(PROVIDER_SETUP_PLANS);
}
