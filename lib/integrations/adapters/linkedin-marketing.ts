import "server-only";
import type { ConnectionVerification, ProviderConnectionAdapter } from "../connections/types";

type Json = Record<string, unknown>;

export const LINKEDIN_MARKETING_API_VERSION = "202609";
export const LINKEDIN_MARKETING_READ_SCOPES = ["r_organization_admin", "r_organization_social"] as const;

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function object(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function list(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function linkedInHeaders(accessToken: string) {
  return {
    Accept: "application/json",
    Authorization: `Bearer ${accessToken}`,
    "Linkedin-Version": LINKEDIN_MARKETING_API_VERSION,
    "X-Restli-Protocol-Version": "2.0.0",
  };
}

function providerError(message: string, status?: number) {
  const error = new Error(message) as Error & { status?: number };
  error.status = status;
  return error;
}

export type LinkedInTokenResponse = {
  access_token?: string;
  expires_in?: number;
  refresh_token?: string;
  refresh_token_expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

export async function exchangeLinkedInAuthorizationCode(input: {
  code: string;
  clientId: string;
  clientSecret: string;
  redirectUri: string;
}) {
  const response = await fetch("https://www.linkedin.com/oauth/v2/accessToken", {
    method: "POST",
    headers: { Accept: "application/json", "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code: input.code,
      redirect_uri: input.redirectUri,
      client_id: input.clientId,
      client_secret: input.clientSecret,
    }),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const tokens = await response.json().catch(() => ({})) as LinkedInTokenResponse;
  if (!response.ok || !tokens.access_token) {
    const detail = tokens.error_description || tokens.error;
    throw providerError(detail ? `LinkedIn token exchange failed: ${detail}` : `LinkedIn token exchange failed (${response.status}).`, response.status);
  }
  return tokens;
}

function organizationId(value: unknown) {
  const raw = text(value);
  const match = raw.match(/^urn:li:organization:(\d+)$/);
  return match?.[1] ?? "";
}

async function getOrganization(accessToken: string, id: string) {
  const response = await fetch(`https://api.linkedin.com/rest/organizations/${encodeURIComponent(id)}`, {
    headers: linkedInHeaders(accessToken),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) return null;
  return body;
}

export async function discoverLinkedInOrganizations(accessToken: string): Promise<ConnectionVerification> {
  const token = accessToken.trim();
  if (!token) throw new Error("LinkedIn access token is missing.");

  const url = new URL("https://api.linkedin.com/rest/organizationAcls");
  url.searchParams.set("q", "roleAssignee");
  url.searchParams.set("role", "ADMINISTRATOR");
  url.searchParams.set("state", "APPROVED");
  url.searchParams.set("count", "100");

  const response = await fetch(url, {
    headers: linkedInHeaders(token),
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    const message = text(body.message) || text(object(body.error).message);
    const base = response.status === 401
      ? "LinkedIn rejected the OAuth credential. Reauthorization is required"
      : response.status === 403
        ? "LinkedIn has not granted the required Community Management permission"
        : `LinkedIn organization discovery failed (${response.status})`;
    throw providerError(message ? `${base}: ${message}` : `${base}.`, response.status);
  }

  const ids = Array.from(new Set(
    list(body.elements)
      .map((entry) => organizationId(entry.organization))
      .filter(Boolean),
  ));
  if (!ids.length) throw new Error("LinkedIn returned no Company Page where the authorized member is an approved administrator.");

  const organizations = await Promise.all(ids.map(async (id) => ({ id, profile: await getOrganization(token, id) })));
  const resources = organizations.map(({ id, profile }) => {
    const data = object(profile);
    const localizedName = text(data.localizedName);
    const vanityName = text(data.vanityName);
    return {
      resourceType: "linkedin_organization",
      resourceId: id,
      resourceName: localizedName || vanityName || `LinkedIn organization ${id}`,
      metadata: {
        urn: `urn:li:organization:${id}`,
        vanity_name: vanityName || null,
        website: text(data.website) || null,
        localized_description: text(data.localizedDescription) || null,
        linkedin_api_version: LINKEDIN_MARKETING_API_VERSION,
        admin_role_verified: true,
      },
    };
  });

  return {
    accountRef: resources[0]?.resourceId ?? null,
    grantedScopes: [...LINKEDIN_MARKETING_READ_SCOPES],
    resources,
    detail: {
      organization_count: resources.length,
      verification_endpoint: "rest/organizationAcls?q=roleAssignee&role=ADMINISTRATOR&state=APPROVED",
      linkedin_api_version: LINKEDIN_MARKETING_API_VERSION,
      readonly: true,
    },
  };
}

export const linkedinMarketingAdapter: ProviderConnectionAdapter = {
  providerKey: "linkedin_marketing",
  authorization: "oauth",
  verifyCredential: discoverLinkedInOrganizations,
  async discoverResources(token) {
    return (await discoverLinkedInOrganizations(token)).resources;
  },
  async healthCheck(token) {
    try {
      await discoverLinkedInOrganizations(token);
      return { healthy: true, code: "verified" };
    } catch (error) {
      const status = (error as { status?: number }).status;
      return {
        healthy: false,
        code: status === 401 ? "reauth_required" : status === 403 ? "provider_access_required" : "provider_error",
      };
    }
  },
};
