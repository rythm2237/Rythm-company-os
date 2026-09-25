import "server-only";
import type { ConnectionVerification, ProviderConnectionAdapter } from "./types";

type Json = Record<string, unknown>;

function asObject(value: unknown): Json {
  return value && typeof value === "object" && !Array.isArray(value) ? value as Json : {};
}

function asList(value: unknown): Json[] {
  return Array.isArray(value) ? value.filter((item): item is Json => Boolean(item) && typeof item === "object" && !Array.isArray(item)) : [];
}

function text(value: unknown) {
  return typeof value === "string" ? value : "";
}

function errorDetail(body: Json) {
  const meta = asObject(body.meta);
  const error = asObject(body.error);
  return [
    text(error.code) || text(meta.status_code),
    text(error.message) || text(error.error_message) || text(body.message),
  ].filter(Boolean).join(": ").slice(0, 320);
}

async function verifySemrush(token: string): Promise<ConnectionVerification> {
  const key = token.trim();
  if (!key || key.length < 16 || /\s/.test(key)) throw new Error("Semrush returned an invalid API key format.");

  const response = await fetch("https://api.semrush.com/apis/v4/projects/v1/projects?scope=ALL&limit=100&offset=0", {
    method: "GET",
    headers: {
      Accept: "application/json",
      Authorization: `Apikey ${key}`,
    },
    cache: "no-store",
    redirect: "error",
    signal: AbortSignal.timeout(20_000),
  });
  const body = await response.json().catch(() => ({})) as Json;
  if (!response.ok) {
    const detail = errorDetail(body);
    const base = response.status === 401
      ? "Semrush rejected the API key"
      : response.status === 403
        ? "Semrush account does not have the required API entitlement"
        : `Semrush verification failed (${response.status})`;
    const error = new Error(detail ? `${base}: ${detail}` : `${base}.`) as Error & { status?: number };
    error.status = response.status;
    throw error;
  }

  const meta = asObject(body.meta);
  if (meta.success === false) {
    const detail = errorDetail(body);
    throw new Error(detail ? `Semrush verification failed: ${detail}` : "Semrush verification failed.");
  }

  const data = Array.isArray(body.data) ? body.data : asObject(body.data).projects;
  const projects = asList(data);
  const resources = projects.map((project) => {
    const projectId = String(project.project_id ?? project.id ?? "").trim();
    const domain = text(project.domain) || text(project.domain_unicode);
    const name = text(project.project_name) || text(project.name) || domain || projectId;
    return {
      resourceType: "semrush_project",
      resourceId: projectId || domain || name,
      resourceName: name,
      metadata: {
        domain: domain || null,
        project_id: projectId || null,
      },
    };
  }).filter((resource) => Boolean(resource.resourceId));

  return {
    accountRef: null,
    grantedScopes: ["seo.read"],
    resources,
    detail: {
      api_version: "v4",
      project_count: resources.length,
      verification_endpoint: "apis/v4/projects/v1/projects",
      authorization: "Apikey",
    },
  };
}

export const semrushAdapter: ProviderConnectionAdapter = {
  providerKey: "semrush",
  authorization: "token",
  verifyCredential: verifySemrush,
  async discoverResources(token) {
    return (await verifySemrush(token)).resources;
  },
  async healthCheck(token) {
    try {
      await verifySemrush(token);
      return { healthy: true, code: "verified" };
    } catch (error) {
      const status = (error as { status?: number }).status;
      return { healthy: false, code: status === 401 ? "reauth_required" : "provider_error" };
    }
  },
};
