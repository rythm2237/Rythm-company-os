import "server-only";

export type CoreProviderKey = "google_analytics" | "google_workspace" | "microsoft_365" | "github" | "vercel" | "supabase" | "cloudflare";

export type CoreProviderReadiness = {
  providerKey: CoreProviderKey;
  mode: "google_oauth" | "microsoft_oauth" | "github_app" | "vercel_integration" | "supabase_oauth" | "cloudflare_oauth";
  configured: boolean;
  missingConfigKeys: string[];
  callbackUrl: string;
  platformAction: string;
};

const origin = () => process.env.RYTHM_PUBLIC_APP_ORIGIN?.trim()?.replace(/\/$/, "") || "https://rythm-os.com";
const present = (...keys: string[]) => keys.some(key => Boolean(process.env[key]?.trim()));

export function getCoreProviderReadiness(providerKey: string): CoreProviderReadiness | null {
  const base = origin();
  if (providerKey === "google_analytics" || providerKey === "google_workspace") {
    const missing: string[] = [];
    if (!present("GOOGLE_WORKSPACE_CLIENT_ID", "GOOGLE_CLIENT_ID")) missing.push("GOOGLE_WORKSPACE_CLIENT_ID");
    if (!present("GOOGLE_WORKSPACE_CLIENT_SECRET", "GOOGLE_CLIENT_SECRET")) missing.push("GOOGLE_WORKSPACE_CLIENT_SECRET");
    return { providerKey, mode: "google_oauth", configured: missing.length === 0, missingConfigKeys: missing, callbackUrl: `${base}/api/integrations/${providerKey === "google_analytics" ? "google-analytics" : "google-workspace"}/callback`, platformAction: "Configure the RYTHM Google OAuth app, required APIs/scopes and production verification." };
  }
  if (providerKey === "microsoft_365") {
    const missing: string[] = [];
    if (!present("MICROSOFT_365_CLIENT_ID", "MICROSOFT_CLIENT_ID")) missing.push("MICROSOFT_365_CLIENT_ID");
    if (!present("MICROSOFT_365_CLIENT_SECRET", "MICROSOFT_CLIENT_SECRET")) missing.push("MICROSOFT_365_CLIENT_SECRET");
    return { providerKey, mode: "microsoft_oauth", configured: missing.length === 0, missingConfigKeys: missing, callbackUrl: `${base}/api/integrations/microsoft-365/callback`, platformAction: "Create the RYTHM Microsoft Entra app registration and grant delegated User.Read, Mail.Read and Calendars.Read permissions." };
  }
  if (providerKey === "github") {
    const missing = ["GITHUB_APP_CLIENT_ID", "GITHUB_APP_CLIENT_SECRET", "GITHUB_APP_SLUG", "GITHUB_APP_PRIVATE_KEY"].filter(key => !process.env[key]?.trim());
    return { providerKey, mode: "github_app", configured: missing.length === 0, missingConfigKeys: missing, callbackUrl: `${base}/api/integrations/github/callback`, platformAction: "Create the RYTHM GitHub App with repository installation permissions and callback/setup URLs." };
  }
  if (providerKey === "vercel") {
    const missing = ["VERCEL_INTEGRATION_CLIENT_ID", "VERCEL_INTEGRATION_CLIENT_SECRET", "VERCEL_INTEGRATION_SLUG"].filter(key => !process.env[key]?.trim());
    return { providerKey, mode: "vercel_integration", configured: missing.length === 0, missingConfigKeys: missing, callbackUrl: `${base}/api/integrations/vercel/callback`, platformAction: "Create the RYTHM connectable Vercel Integration and configure its installation callback." };
  }
  if (providerKey === "supabase") {
    const missing = ["SUPABASE_OAUTH_CLIENT_ID", "SUPABASE_OAUTH_CLIENT_SECRET"].filter(key => !process.env[key]?.trim());
    return { providerKey, mode: "supabase_oauth", configured: missing.length === 0, missingConfigKeys: missing, callbackUrl: `${base}/api/integrations/supabase/callback`, platformAction: "Create the RYTHM OAuth App in Supabase organization settings with Management API project-read access." };
  }
  if (providerKey === "cloudflare") {
    const missing = ["CLOUDFLARE_OAUTH_CLIENT_ID", "CLOUDFLARE_OAUTH_CLIENT_SECRET", "CLOUDFLARE_OAUTH_SCOPES"].filter(key => !process.env[key]?.trim());
    return { providerKey, mode: "cloudflare_oauth", configured: missing.length === 0, missingConfigKeys: missing, callbackUrl: `${base}/api/integrations/cloudflare/callback`, platformAction: "Create and domain-verify the RYTHM Cloudflare OAuth client with account/zone read scopes." };
  }
  return null;
}

export function listCoreProviderReadiness() {
  return (["google_analytics", "google_workspace", "microsoft_365", "github", "vercel", "supabase", "cloudflare"] as const).map(key => getCoreProviderReadiness(key)!);
}

export function assertCoreProviderPlatformReady(providerKey: string) {
  const readiness = getCoreProviderReadiness(providerKey);
  if (!readiness || readiness.configured) return readiness;
  throw new Error(`${providerKey} platform configuration is incomplete. Missing: ${readiness.missingConfigKeys.join(", ")}.`);
}
