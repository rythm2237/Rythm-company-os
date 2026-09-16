import "server-only";

import crypto from "node:crypto";
import type { DiscoveredResource } from "@/lib/integrations/connections/types";

export type GitHubAppInstallationEnvelope = {
  version: 1;
  provider: "github";
  auth_mode: "github_app_installation";
  installation_id: string;
  account_login?: string | null;
  account_id?: string | null;
  repository_selection?: string | null;
};

type Json = Record<string, unknown>;
const text = (value: unknown) => typeof value === "string" ? value : "";
const list = (value: unknown) => Array.isArray(value) ? value as Json[] : [];

export function githubAppConfig() {
  return {
    clientId: process.env.GITHUB_APP_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GITHUB_APP_CLIENT_SECRET?.trim() || "",
    appId: process.env.GITHUB_APP_ID?.trim() || "",
    slug: process.env.GITHUB_APP_SLUG?.trim() || "",
    privateKey: (process.env.GITHUB_APP_PRIVATE_KEY ?? "").replace(/\\n/g, "\n").trim(),
  };
}

export function assertGitHubAppConfigured() {
  const config = githubAppConfig();
  if (!config.clientId || !config.clientSecret || !config.slug || !config.privateKey) {
    throw new Error("GitHub App platform credentials are not configured.");
  }
  return config;
}

export function buildGitHubAppInstallUrl(state: string) {
  const { slug } = assertGitHubAppConfigured();
  const url = new URL(`https://github.com/apps/${encodeURIComponent(slug)}/installations/new`);
  url.searchParams.set("state", state);
  return url.toString();
}

function base64url(value: string | Buffer) {
  return Buffer.from(value).toString("base64url");
}

export function createGitHubAppJwt() {
  const config = assertGitHubAppConfigured();
  const now = Math.floor(Date.now() / 1000);
  const header = base64url(JSON.stringify({ alg: "RS256", typ: "JWT" }));
  const payload = base64url(JSON.stringify({ iat: now - 60, exp: now + 9 * 60, iss: config.clientId || config.appId }));
  const signingInput = `${header}.${payload}`;
  const signature = crypto.sign("RSA-SHA256", Buffer.from(signingInput), config.privateKey).toString("base64url");
  return `${signingInput}.${signature}`;
}

async function githubJson(url: string, init: RequestInit) {
  const response = await fetch(url, {
    ...init,
    headers: {
      Accept: "application/vnd.github+json",
      "X-GitHub-Api-Version": "2022-11-28",
      ...init.headers,
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) throw new Error(`GitHub App request failed (${response.status}).`);
  return body;
}

export async function verifyGitHubInstallation(installationId: string) {
  if (!/^\d+$/.test(installationId)) throw new Error("GitHub installation id is invalid.");
  const jwt = createGitHubAppJwt();
  const installation = await githubJson(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}`, {
    headers: { Authorization: `Bearer ${jwt}` },
  });
  const account = (installation.account && typeof installation.account === "object" ? installation.account : {}) as Json;
  return {
    installationId,
    accountLogin: text(account.login) || null,
    accountId: account.id == null ? null : String(account.id),
    repositorySelection: text(installation.repository_selection) || null,
    targetType: text(installation.target_type) || null,
  };
}

export async function createGitHubInstallationAccessToken(installationId: string) {
  const jwt = createGitHubAppJwt();
  const response = await githubJson(`https://api.github.com/app/installations/${encodeURIComponent(installationId)}/access_tokens`, {
    method: "POST",
    headers: { Authorization: `Bearer ${jwt}`, "Content-Type": "application/json" },
    body: JSON.stringify({}),
  });
  const token = text(response.token);
  if (!token) throw new Error("GitHub App did not return an installation access token.");
  return { token, expiresAt: text(response.expires_at) || null };
}

export async function discoverGitHubInstallationResources(accessToken: string) {
  const result = await githubJson("https://api.github.com/installation/repositories?per_page=100", {
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  const resources: DiscoveredResource[] = list(result.repositories).map(repo => ({
    resourceType: "repository",
    resourceId: String(repo.id ?? ""),
    resourceName: text(repo.full_name) || text(repo.name) || String(repo.id ?? "GitHub repository"),
    metadata: {
      private: Boolean(repo.private),
      default_branch: text(repo.default_branch),
      html_url: text(repo.html_url),
      owner: repo.owner ?? null,
    },
  })).filter(resource => Boolean(resource.resourceId));
  return resources;
}

export async function prepareGitHubInstallationConnection(installationId: string) {
  const installation = await verifyGitHubInstallation(installationId);
  const access = await createGitHubInstallationAccessToken(installationId);
  const resources = await discoverGitHubInstallationResources(access.token);
  const envelope: GitHubAppInstallationEnvelope = {
    version: 1,
    provider: "github",
    auth_mode: "github_app_installation",
    installation_id: installationId,
    account_login: installation.accountLogin,
    account_id: installation.accountId,
    repository_selection: installation.repositorySelection,
  };
  return {
    envelope,
    accessToken: access.token,
    accessTokenExpiresAt: access.expiresAt,
    accountRef: installation.accountLogin || installation.accountId,
    resources,
    grantedScopes: ["repository.installation"],
    detail: {
      installation_id: installationId,
      repository_selection: installation.repositorySelection,
      target_type: installation.targetType,
      repository_count: resources.length,
    },
  };
}
