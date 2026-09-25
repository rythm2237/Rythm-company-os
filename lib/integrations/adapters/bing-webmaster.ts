import "server-only";
import type { ConnectionVerification, ProviderConnectionAdapter } from "../connections/types";

type BingSite = {
  Url?: string;
  IsVerified?: boolean;
  AuthenticationCode?: string;
  DnsVerificationCode?: string;
};

type BingSitesResponse = { d?: BingSite[] } | BingSite[];

function normalizeSites(body: BingSitesResponse): BingSite[] {
  if (Array.isArray(body)) return body;
  return Array.isArray(body?.d) ? body.d : [];
}

export async function discoverBingWebmasterSites(accessToken: string): Promise<ConnectionVerification> {
  const token = accessToken.trim();
  if (!token) throw new Error("Bing Webmaster access token is missing.");

  const response = await fetch("https://www.bing.com/webmaster/api.svc/json/GetUserSites", {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Bearer ${token}`,
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });

  const body = await response.json().catch(() => ({})) as BingSitesResponse;
  if (!response.ok) {
    const error = new Error(
      response.status === 401
        ? "Bing Webmaster rejected the OAuth access token. Reauthorization is required."
        : `Bing Webmaster site discovery failed (${response.status}).`,
    ) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const sites = normalizeSites(body);
  const resources = sites
    .filter((site) => Boolean(site.Url))
    .map((site) => ({
      resourceType: "bing_webmaster_site",
      resourceId: String(site.Url),
      resourceName: String(site.Url),
      metadata: {
        verified: Boolean(site.IsVerified),
      },
    }));

  return {
    accountRef: null,
    grantedScopes: ["Webmaster.read"],
    resources,
    detail: {
      site_count: resources.length,
      verified_site_count: resources.filter((resource) => resource.metadata?.verified === true).length,
      verification_endpoint: "webmaster/api.svc/json/GetUserSites",
      readonly: true,
    },
  };
}

export const bingWebmasterAdapter: ProviderConnectionAdapter = {
  providerKey: "bing_webmaster",
  authorization: "oauth",
  verifyCredential: discoverBingWebmasterSites,
  async discoverResources(token) {
    return (await discoverBingWebmasterSites(token)).resources;
  },
  async healthCheck(token) {
    try {
      await discoverBingWebmasterSites(token);
      return { healthy: true, code: "verified" };
    } catch (error) {
      const status = (error as { status?: number }).status;
      return { healthy: false, code: status === 401 ? "reauth_required" : "provider_error" };
    }
  },
};
