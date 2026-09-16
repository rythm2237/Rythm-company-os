import "server-only";

import type { DiscoveredResource } from "@/lib/integrations/connections/types";

export type PlatformOAuthProviderKey = "vercel" | "supabase" | "cloudflare";

export type PlatformOAuthToken = {
  access_token: string;
  refresh_token?: string;
  expires_in?: number;
  token_type?: string;
  scope?: string;
  team_id?: string | null;
  user_id?: string | null;
  configuration_id?: string | null;
  [key: string]: unknown;
};

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  redirectPath: string;
  authorizationUrl: string;
  tokenUrl: string;
  scopes: string[];
  slug?: string;
};

type Json = Record<string, unknown>;

const text = (value: unknown) => typeof value === "string" ? value : "";
const list = (value: unknown) => Array.isArray(value) ? value as Json[] : [];

export function isPlatformOAuthProvider(providerKey: string): providerKey is PlatformOAuthProviderKey {
  return ["vercel", "supabase", "cloudflare"].includes(providerKey);
}

export function platformOAuthConfig(providerKey: PlatformOAuthProviderKey): ProviderConfig {
  if (providerKey === "vercel") return {
    clientId: process.env.VERCEL_INTEGRATION_CLIENT_ID?.trim() || "",
    clientSecret: process.env.VERCEL_INTEGRATION_CLIENT_SECRET?.trim() || "",
    slug: process.env.VERCEL_INTEGRATION_SLUG?.trim() || "",
    redirectPath: "/api/integrations/vercel/callback",
    authorizationUrl: "https://vercel.com/integrations",
    tokenUrl: "https://api.vercel.com/v2/oauth/access_token",
    scopes: [],
  };
  if (providerKey === "supabase") return {
    clientId: process.env.SUPABASE_OAUTH_CLIENT_ID?.trim() || "",
    clientSecret: process.env.SUPABASE_OAUTH_CLIENT_SECRET?.trim() || "",
    redirectPath: "/api/integrations/supabase/callback",
    authorizationUrl: "https://api.supabase.com/v1/oauth/authorize",
    tokenUrl: "https://api.supabase.com/v1/oauth/token",
    scopes: [],
  };
  return {
    clientId: process.env.CLOUDFLARE_OAUTH_CLIENT_ID?.trim() || "",
    clientSecret: process.env.CLOUDFLARE_OAUTH_CLIENT_SECRET?.trim() || "",
    redirectPath: "/api/integrations/cloudflare/callback",
    authorizationUrl: "https://dash.cloudflare.com/oauth2/auth",
    tokenUrl: "https://dash.cloudflare.com/oauth2/token",
    scopes: (process.env.CLOUDFLARE_OAUTH_SCOPES ?? "").split(/[\s,]+/).map(value => value.trim()).filter(Boolean),
  };
}

export function assertPlatformOAuthConfigured(providerKey: PlatformOAuthProviderKey) {
  const config = platformOAuthConfig(providerKey);
  if (!config.clientId || !config.clientSecret) throw new Error(`${providerKey} OAuth platform credentials are not configured.`);
  if (providerKey === "vercel" && !config.slug) throw new Error("Vercel Integration slug is not configured.");
  if (providerKey === "cloudflare" && !config.scopes.length) throw new Error("Cloudflare OAuth scopes are not configured.");
  return config;
}

export function buildPlatformAuthorizationUrl(input: {
  providerKey: PlatformOAuthProviderKey;
  state: string;
  redirectUri: string;
  codeChallenge?: string;
}) {
  const config = assertPlatformOAuthConfigured(input.providerKey);
  if (input.providerKey === "vercel") {
    const url = new URL(`https://vercel.com/integrations/${encodeURIComponent(String(config.slug))}/new`);
    url.searchParams.set("state", input.state);
    return url.toString();
  }
  const url = new URL(config.authorizationUrl);
  url.searchParams.set("client_id", config.clientId);
  url.searchParams.set("redirect_uri", input.redirectUri);
  url.searchParams.set("response_type", "code");
  url.searchParams.set("state", input.state);
  if (input.codeChallenge) {
    url.searchParams.set("code_challenge", input.codeChallenge);
    url.searchParams.set("code_challenge_method", "S256");
  }
  if (input.providerKey === "cloudflare" && config.scopes.length) url.searchParams.set("scope", config.scopes.join(" "));
  return url.toString();
}

async function responseJson(response: Response) {
  return await response.json().catch(() => ({})) as Json;
}

export async function exchangePlatformOAuthCode(input: {
  providerKey: PlatformOAuthProviderKey;
  code: string;
  redirectUri: string;
  codeVerifier?: string;
  configurationId?: string | null;
}): Promise<PlatformOAuthToken> {
  const config = assertPlatformOAuthConfigured(input.providerKey);
  let response: Response;
  if (input.providerKey === "vercel") {
    response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({ client_id: config.clientId, client_secret: config.clientSecret, code: input.code, redirect_uri: input.redirectUri }),
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  } else {
    const body = new URLSearchParams({ grant_type: "authorization_code", code: input.code, redirect_uri: input.redirectUri });
    if (input.codeVerifier) body.set("code_verifier", input.codeVerifier);
    response = await fetch(config.tokenUrl, {
      method: "POST",
      headers: {
        "Content-Type": "application/x-www-form-urlencoded",
        Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`,
      },
      body,
      cache: "no-store",
      signal: AbortSignal.timeout(20_000),
    });
  }
  const raw = await responseJson(response);
  if (!response.ok || !text(raw.access_token)) {
    const detail = text(raw.error_description) || text(raw.error) || `HTTP ${response.status}`;
    throw new Error(`${input.providerKey} token exchange failed: ${detail}`);
  }
  return {
    ...(raw as PlatformOAuthToken),
    access_token: text(raw.access_token),
    configuration_id: (input.configurationId ?? text(raw.configuration_id)) || null,
  };
}

async function apiJson(url: string, accessToken: string) {
  const response = await fetch(url, {
    headers: { Accept: "application/json", Authorization: `Bearer ${accessToken}` },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await responseJson(response);
  if (!response.ok) throw new Error(`Provider resource discovery failed (${response.status}).`);
  return body;
}

export async function discoverPlatformOAuthResources(providerKey: PlatformOAuthProviderKey, accessToken: string, token: PlatformOAuthToken) {
  if (providerKey === "vercel") {
    const teamId = text(token.team_id);
    const [userResult, projectResult] = await Promise.all([
      apiJson("https://api.vercel.com/v2/user", accessToken),
      apiJson(`https://api.vercel.com/v9/projects?limit=100${teamId ? `&teamId=${encodeURIComponent(teamId)}` : ""}`, accessToken),
    ]);
    const user = (userResult.user && typeof userResult.user === "object" ? userResult.user : {}) as Json;
    const resources: DiscoveredResource[] = list(projectResult.projects).map(project => ({
      resourceType: "project",
      resourceId: String(project.id ?? ""),
      resourceName: text(project.name) || String(project.id ?? "Vercel project"),
      metadata: { framework: text(project.framework), account_id: (project.accountId ?? teamId) || null, team_id: teamId || null },
    })).filter(resource => Boolean(resource.resourceId));
    return { accountRef: teamId || text(user.email) || text(user.username) || String(user.id ?? "") || null, resources, grantedScopes: ["project.read", "deployment.read"], detail: { team_id: teamId || null, configuration_id: token.configuration_id ?? null } };
  }
  if (providerKey === "supabase") {
    const result = await apiJson("https://api.supabase.com/v1/projects", accessToken);
    const projects = Array.isArray(result) ? result as unknown as Json[] : list(result.projects);
    const resources: DiscoveredResource[] = projects.map(project => ({
      resourceType: "project",
      resourceId: text(project.ref) || String(project.id ?? ""),
      resourceName: text(project.name) || text(project.ref) || String(project.id ?? "Supabase project"),
      metadata: { region: text(project.region), status: text(project.status), organization_id: project.organization_id ?? null },
    })).filter(resource => Boolean(resource.resourceId));
    return { accountRef: null, resources, grantedScopes: ["project.read"], detail: { project_count: resources.length } };
  }
  const [profileRaw, zones] = await Promise.all([
    apiJson("https://dash.cloudflare.com/oauth2/userinfo", accessToken).catch((): Json => ({})),
    apiJson("https://api.cloudflare.com/client/v4/zones?per_page=50", accessToken),
  ]);
  const profile = profileRaw as Json;
  const resources: DiscoveredResource[] = list(zones.result).map(zone => ({
    resourceType: "zone",
    resourceId: String(zone.id ?? ""),
    resourceName: text(zone.name) || String(zone.id ?? "Cloudflare zone"),
    metadata: { status: text(zone.status), account: zone.account ?? null },
  })).filter(resource => Boolean(resource.resourceId));
  return { accountRef: text(profile.email) || text(profile.sub) || null, resources, grantedScopes: platformOAuthConfig("cloudflare").scopes, detail: { zone_count: resources.length } };
}

export async function refreshPlatformOAuthToken(providerKey: PlatformOAuthProviderKey, refreshToken: string): Promise<PlatformOAuthToken> {
  const config = assertPlatformOAuthConfigured(providerKey);
  if (providerKey === "vercel") throw new Error("Vercel connectable-account access tokens are refreshed by reinstalling or reauthorizing the integration.");
  const body = new URLSearchParams({ grant_type: "refresh_token", refresh_token: refreshToken });
  const response = await fetch(config.tokenUrl, {
    method: "POST",
    headers: {
      "Content-Type": "application/x-www-form-urlencoded",
      Authorization: `Basic ${Buffer.from(`${config.clientId}:${config.clientSecret}`, "utf8").toString("base64")}`,
    },
    body,
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const raw = await responseJson(response);
  if (!response.ok || !text(raw.access_token)) throw new Error(`${providerKey} refresh token exchange failed.`);
  return { ...(raw as PlatformOAuthToken), access_token: text(raw.access_token), refresh_token: text(raw.refresh_token) || refreshToken };
}
