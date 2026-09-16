import "server-only";
import { NextResponse } from "next/server";
import { createExecutionServiceClient } from "@/lib/integrations/service-runner";
import { discoverGoogleResources, googleProfile } from "@/lib/integrations/connections/providers";
import { AGENT_OAUTH_COOKIE_NAMES, agentOAuthCallbackPath, type AgentOAuthProviderKey, verifyAgentOAuthState } from "@/lib/integrations/connections/agent-oauth";
import { dispatchConnectionSetupSessions, signalConnectionAuthorizationCompleted } from "@/lib/integrations/connection-setup-agent";
import { prepareGitHubInstallationConnection } from "@/lib/integrations/connections/github-app";
import { discoverPlatformOAuthResources, exchangePlatformOAuthCode, isPlatformOAuthProvider } from "@/lib/integrations/connections/platform-oauth";

type Json = Record<string, unknown>;
type TokenResponse = {
  access_token?: string;
  refresh_token?: string;
  expires_in?: number;
  scope?: string;
  token_type?: string;
  error?: string;
  error_description?: string;
};

const providerLabel: Record<AgentOAuthProviderKey, string> = {
  google_search_console: "Google Search Console",
  google_analytics: "Google Analytics 4",
  google_workspace: "Google Workspace",
  microsoft_365: "Microsoft 365",
  github: "GitHub",
  vercel: "Vercel",
  supabase: "Supabase",
  cloudflare: "Cloudflare",
};

function cookieMap(request: Request) {
  const raw = request.headers.get("cookie") ?? "";
  return new Map(raw.split(";").map(value => value.trim()).filter(Boolean).map(value => {
    const index = value.indexOf("=");
    return index < 0 ? [value, ""] : [value.slice(0, index), decodeURIComponent(value.slice(index + 1))];
  }));
}

function callbackPath(providerKey: AgentOAuthProviderKey) {
  return agentOAuthCallbackPath(providerKey);
}

function completion(request: Request, providerKey: AgentOAuthProviderKey, ok: boolean, message: string) {
  const safe = message.replace(/[<>&]/g, value => value === "<" ? "&lt;" : value === ">" ? "&gt;" : "&amp;");
  const label = providerLabel[providerKey];
  const response = new NextResponse(`<!doctype html><html><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>${label} · RYTHM</title><style>html,body{margin:0;min-height:100%;background:#070b15;color:#edf3ff;font-family:Inter,ui-sans-serif,system-ui}body{display:grid;place-items:center;overflow:hidden}.shell{width:min(760px,88vw);padding:54px;border:1px solid rgba(131,154,255,.24);border-radius:30px;background:radial-gradient(circle at 15% 10%,rgba(73,92,255,.18),transparent 42%),linear-gradient(145deg,rgba(18,25,45,.96),rgba(7,11,21,.98));box-shadow:0 38px 100px rgba(0,0,0,.55);position:relative}.orb{width:74px;height:74px;border-radius:50%;display:grid;place-items:center;background:${ok ? "rgba(74,222,128,.12)" : "rgba(248,113,113,.12)"};border:1px solid ${ok ? "rgba(74,222,128,.48)" : "rgba(248,113,113,.48)"};font-size:30px;box-shadow:0 0 60px ${ok ? "rgba(74,222,128,.15)" : "rgba(248,113,113,.12)"}}.eyebrow{margin:26px 0 9px;color:#8ea3ff;font-size:12px;letter-spacing:.22em;font-weight:800}.title{font-size:clamp(34px,5vw,58px);line-height:.98;margin:0;letter-spacing:-.045em}.copy{margin:22px 0 0;color:#aebbd3;font-size:17px;line-height:1.7}.state{margin-top:30px;display:inline-flex;gap:9px;align-items:center;border:1px solid rgba(255,255,255,.12);border-radius:999px;padding:10px 14px;color:#dbe6fa;font-size:13px}.dot{width:8px;height:8px;border-radius:50%;background:${ok ? "#4ade80" : "#f87171"};box-shadow:0 0 16px currentColor}</style></head><body><main class="shell"><div class="orb">${ok ? "✓" : "!"}</div><div class="eyebrow">RYTHM CONNECTION FLIGHT DECK</div><h1 class="title">${ok ? "Authorization verified." : "Authorization needs attention."}</h1><p class="copy">${safe}</p><div class="state"><span class="dot"></span>${ok ? "Control is returning to the Connection Agent" : "The Agent is waiting for your decision"}</div></main></body></html>`, {
    status: ok ? 200 : 400,
    headers: { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" },
  });
  const path = callbackPath(providerKey).replace(/\/callback$/, "");
  for (const name of AGENT_OAUTH_COOKIE_NAMES) response.cookies.set(name, "", { httpOnly: true, secure: true, sameSite: "lax", path, maxAge: 0 });
  return response;
}

function googleCredentials() {
  return {
    clientId: process.env.GOOGLE_WORKSPACE_CLIENT_ID?.trim() || process.env.GOOGLE_CLIENT_ID?.trim() || "",
    clientSecret: process.env.GOOGLE_WORKSPACE_CLIENT_SECRET?.trim() || process.env.GOOGLE_CLIENT_SECRET?.trim() || "",
  };
}

function microsoftCredentials() {
  return {
    clientId: process.env.MICROSOFT_365_CLIENT_ID?.trim() || process.env.MICROSOFT_CLIENT_ID?.trim() || "",
    clientSecret: process.env.MICROSOFT_365_CLIENT_SECRET?.trim() || process.env.MICROSOFT_CLIENT_SECRET?.trim() || "",
    tenant: process.env.MICROSOFT_365_TENANT_ID?.trim() || process.env.MICROSOFT_TENANT_ID?.trim() || "common",
  };
}

async function exchangeGoogle(code: string, verifier: string, redirectUri: string) {
  const { clientId, clientSecret } = googleCredentials();
  if (!clientId || !clientSecret) throw new Error("Google OAuth platform credentials are not configured.");
  const response = await fetch("https://oauth2.googleapis.com/token", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ code, client_id: clientId, client_secret: clientSecret, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const tokens = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !tokens.access_token) throw new Error(`Google token exchange failed${tokens.error ? `: ${tokens.error}` : "."}`);
  if (!tokens.refresh_token) throw new Error("Google did not return an offline refresh token. Approve access again.");
  return tokens;
}

async function exchangeMicrosoft(code: string, verifier: string, redirectUri: string) {
  const { clientId, clientSecret, tenant } = microsoftCredentials();
  if (!clientId || !clientSecret) throw new Error("Microsoft 365 OAuth platform credentials are not configured.");
  const response = await fetch(`https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({ client_id: clientId, client_secret: clientSecret, code, redirect_uri: redirectUri, grant_type: "authorization_code", code_verifier: verifier }),
    cache: "no-store",
    signal: AbortSignal.timeout(20_000),
  });
  const tokens = await response.json().catch(() => ({})) as TokenResponse;
  if (!response.ok || !tokens.access_token) throw new Error(`Microsoft token exchange failed${tokens.error ? `: ${tokens.error}` : "."}`);
  if (!tokens.refresh_token) throw new Error("Microsoft did not return an offline refresh token. Approve access again.");
  return tokens;
}

export async function maybeHandleAgentOAuthCallback(request: Request, providerKey: AgentOAuthProviderKey) {
  const url = new URL(request.url);
  const state = url.searchParams.get("state")?.trim() || "";
  const payload = state ? verifyAgentOAuthState(providerKey, state) : null;
  if (!payload) return null;

  const jar = cookieMap(request);
  const code = url.searchParams.get("code")?.trim() || "";
  const providerError = url.searchParams.get("error")?.trim();
  if (providerError) return completion(request, providerKey, false, `Provider authorization was not completed: ${providerError}`);
  if (
    jar.get("rythm_agent_oauth_state") !== state || jar.get("rythm_agent_oauth_session") !== payload.sessionId ||
    jar.get("rythm_agent_oauth_integration") !== payload.integrationId || jar.get("rythm_agent_oauth_user") !== payload.userId ||
    jar.get("rythm_agent_oauth_provider") !== providerKey
  ) return completion(request, providerKey, false, "Secure Agent OAuth state validation failed. Return to RYTHM and restart the connection.");
  if (providerKey !== "github" && (!code || !jar.get("rythm_agent_oauth_pkce"))) return completion(request, providerKey, false, "Provider authorization code or PKCE verification is missing. Restart the connection.");

  const service = createExecutionServiceClient();
  const sessionResult = await service.from("integration_setup_sessions")
    .select("id,organization_id,connection_id,provider_key,project_id,started_by_user_id,session_status")
    .eq("id", payload.sessionId).eq("organization_id", payload.organizationId).eq("connection_id", payload.integrationId).maybeSingle();
  const session = sessionResult.data;
  if (!session || session.provider_key !== providerKey || session.started_by_user_id !== payload.userId || ["completed", "failed", "cancelled", "expired"].includes(String(session.session_status))) {
    return completion(request, providerKey, false, "The RYTHM connection session is no longer valid.");
  }
  const integrationResult = await service.from("organization_integrations").select("id,provider_key").eq("id", payload.integrationId).eq("organization_id", payload.organizationId).maybeSingle();
  if (!integrationResult.data || integrationResult.data.provider_key !== providerKey) return completion(request, providerKey, false, "This provider connection no longer belongs to the active RYTHM company.");

  try {
    const redirectUri = `${url.origin}${callbackPath(providerKey)}`;
    const verifier = String(jar.get("rythm_agent_oauth_pkce") ?? "");
    let accountRef: string | null = null;
    let grantedScopes: string[] = [];
    let resources: Array<{ resourceType: string; resourceId: string; resourceName: string; metadata?: Json }> = [];
    let detail: Json = {};
    let envelope: Json;

    if (providerKey === "github") {
      const installationId = url.searchParams.get("installation_id")?.trim() || "";
      if (!installationId) throw new Error("GitHub App installation was not completed.");
      const prepared = await prepareGitHubInstallationConnection(installationId);
      accountRef = prepared.accountRef;
      grantedScopes = prepared.grantedScopes;
      resources = prepared.resources;
      detail = prepared.detail;
      envelope = prepared.envelope as unknown as Json;
    } else if (isPlatformOAuthProvider(providerKey)) {
      const tokens = await exchangePlatformOAuthCode({ providerKey, code, redirectUri, codeVerifier: verifier, configurationId: url.searchParams.get("configurationId") });
      const normalizedTokens = { ...tokens, team_id: url.searchParams.get("teamId") || tokens.team_id };
      const discovered = await discoverPlatformOAuthResources(providerKey, tokens.access_token, normalizedTokens);
      accountRef = discovered.accountRef;
      grantedScopes = discovered.grantedScopes;
      resources = discovered.resources;
      detail = discovered.detail;
      envelope = {
        version: 1,
        provider: providerKey,
        auth_mode: "oauth",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token || null,
        token_type: tokens.token_type || "Bearer",
        scope: tokens.scope || grantedScopes.join(" "),
        expires_at: tokens.expires_in ? new Date(Date.now() + Math.max(60, Number(tokens.expires_in)) * 1000).toISOString() : null,
        configuration_id: tokens.configuration_id ?? null,
        team_id: normalizedTokens.team_id || null,
      };
    } else {
      const tokens = providerKey === "microsoft_365" ? await exchangeMicrosoft(code, verifier, redirectUri) : await exchangeGoogle(code, verifier, redirectUri);
      const scopes = new Set((tokens.scope ?? "").split(/\s+/).filter(Boolean));
      if (providerKey === "google_search_console" && !scopes.has("https://www.googleapis.com/auth/webmasters.readonly")) throw new Error("Google did not grant the required read-only Search Console scope.");
      if (providerKey === "google_analytics" && !scopes.has("https://www.googleapis.com/auth/analytics.readonly")) throw new Error("Google did not grant the required read-only Analytics scope.");
      if (providerKey === "google_workspace" && (!scopes.has("https://www.googleapis.com/auth/gmail.readonly") || !scopes.has("https://www.googleapis.com/auth/calendar.readonly"))) throw new Error("Google did not grant the requested read-only Gmail and Calendar scopes.");
      if (providerKey === "microsoft_365" && (!scopes.has("User.Read") || !scopes.has("Mail.Read") || !scopes.has("Calendars.Read"))) throw new Error("Microsoft did not grant the required read-only identity, mail and calendar scopes.");

      if (providerKey === "microsoft_365") {
        const profileResponse = await fetch("https://graph.microsoft.com/v1.0/me?$select=id,displayName,userPrincipalName,mail", { headers: { Authorization: `Bearer ${tokens.access_token}` }, cache: "no-store", signal: AbortSignal.timeout(20_000) });
        if (!profileResponse.ok) throw new Error("Microsoft authorized the account, but RYTHM could not verify Microsoft Graph access.");
        const profile = await profileResponse.json().catch(() => ({})) as { id?: string; displayName?: string; userPrincipalName?: string; mail?: string };
        accountRef = profile.mail || profile.userPrincipalName || profile.id || null;
        grantedScopes = [...scopes];
        resources = [{ resourceType: "microsoft_account", resourceId: String(profile.id ?? accountRef ?? payload.integrationId), resourceName: String(profile.displayName ?? accountRef ?? "Microsoft 365 account"), metadata: { user_principal_name: profile.userPrincipalName ?? null } }];
        detail = { microsoft_user_id: profile.id ?? null, microsoft_display_name: profile.displayName ?? null };
      } else {
        const profile = await googleProfile(String(tokens.access_token));
        accountRef = typeof profile.email === "string" ? profile.email : null;
        if (providerKey === "google_search_console" || providerKey === "google_analytics") {
          resources = await discoverGoogleResources(providerKey, String(tokens.access_token));
          grantedScopes = providerKey === "google_search_console" ? ["read.search_console"] : ["read.analytics"];
        } else {
          grantedScopes = ["gmail.readonly", "calendar.readonly"];
          resources = [{ resourceType: "google_workspace_account", resourceId: accountRef ?? payload.integrationId, resourceName: accountRef ?? "Google Workspace account", metadata: { google_email_verified: profile.verified_email === true } }];
          detail = { google_email_verified: profile.verified_email === true };
        }
      }
      envelope = {
        version: 1,
        provider: providerKey,
        auth_mode: "oauth",
        access_token: tokens.access_token,
        refresh_token: tokens.refresh_token,
        token_type: tokens.token_type || "Bearer",
        scope: tokens.scope || "",
        expires_at: new Date(Date.now() + Math.max(60, Number(tokens.expires_in ?? 3600)) * 1000).toISOString(),
      };
    }

    const stored = await service.rpc("store_organization_integration_secret_unverified_v1", { target_integration_id: payload.integrationId, secret_value: JSON.stringify(envelope) });
    if (stored.error) throw new Error(`Provider credential could not be stored securely: ${stored.error.message}`);

    const verifiedAt = new Date().toISOString();
    await service.from("integration_resources").update({ available: false }).eq("integration_id", payload.integrationId).eq("organization_id", payload.organizationId);
    if (resources.length) {
      const saved = await service.from("integration_resources").upsert(resources.map(resource => ({
        organization_id: payload.organizationId,
        integration_id: payload.integrationId,
        provider_key: providerKey,
        resource_type: resource.resourceType,
        resource_id: resource.resourceId,
        resource_name: resource.resourceName,
        resource_metadata: resource.metadata ?? {},
        last_verified_at: verifiedAt,
        available: true,
      })), { onConflict: "integration_id,resource_type,resource_id" });
      if (saved.error) throw new Error("Verified provider resources could not be saved.");
    }

    const updated = await service.from("organization_integrations").update({
      account_ref: accountRef,
      auth_type: "oauth",
      status: "connected",
      enabled: true,
      granted_scopes: grantedScopes,
      connected_at: verifiedAt,
      last_verified_at: verifiedAt,
      last_health_check_at: verifiedAt,
      last_error_at: null,
      last_error_code: null,
      last_error_message: null,
      metadata: {
        verification_result: "verified",
        oauth_flow: providerKey === "github" ? "github_app_installation_v1" : "connection_agent_oauth_v2",
        credential_format: providerKey === "github" ? "github_app_installation_v1" : "oauth_token_envelope_v1",
        setup_state: "verified",
        resource_count: resources.length,
        readonly: true,
        ...detail,
      },
      updated_at: verifiedAt,
    }).eq("id", payload.integrationId).eq("organization_id", payload.organizationId);
    if (updated.error) throw new Error(`Provider was authorized, but the connection registry could not be updated: ${updated.error.message}`);

    await service.from("audit_events").insert({
      organization_id: payload.organizationId,
      actor_type: "user",
      actor_user_id: payload.userId,
      event_type: `integration.${providerKey}_connected`,
      object_type: "organization_integration",
      object_id: payload.integrationId,
      risk_level: "low",
      payload: { auth_type: providerKey === "github" ? "github_app" : "oauth", resource_count: resources.length, connection_agent_session_id: payload.sessionId },
    });

    await signalConnectionAuthorizationCompleted(service, { organizationId: payload.organizationId, connectionId: payload.integrationId, providerKey });
    await dispatchConnectionSetupSessions(service, { limit: 4 });
    return completion(request, providerKey, true, `${providerLabel[providerKey]} authorization is verified. RYTHM is continuing resource discovery and connection verification in the background.`);
  } catch (error) {
    const message = error instanceof Error ? error.message : "Provider authorization could not be completed.";
    await service.from("organization_integrations").update({ last_error_at: new Date().toISOString(), last_error_code: "agent_oauth_callback_failed", last_error_message: message.slice(0, 500) }).eq("id", payload.integrationId).eq("organization_id", payload.organizationId);
    return completion(request, providerKey, false, message);
  }
}
