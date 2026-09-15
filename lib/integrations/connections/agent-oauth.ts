import "server-only";
import crypto from "node:crypto";
import type { BrowserBootstrapCookie } from "@/lib/integrations/computer-use/runtime";

export type AgentOAuthProviderKey = "google_search_console" | "google_analytics" | "google_workspace" | "microsoft_365";

export type AgentOAuthStatePayload = {
  agent: true;
  sessionId: string;
  organizationId: string;
  integrationId: string;
  userId: string;
  projectId?: string | null;
  providerKey: AgentOAuthProviderKey;
  nonce: string;
  issuedAt: number;
};

type ProviderConfig = {
  clientId: string;
  clientSecret: string;
  redirectPath: string;
  scopes: string[];
  authorizationUrl: string;
  prompt?: string;
};

const GOOGLE_GSC_SCOPE = "https://www.googleapis.com/auth/webmasters.readonly";
const GOOGLE_GA_SCOPE = "https://www.googleapis.com/auth/analytics.readonly";
const GOOGLE_WORKSPACE_SCOPES = [
  "openid",
  "email",
  "https://www.googleapis.com/auth/gmail.readonly",
  "https://www.googleapis.com/auth/calendar.readonly",
];
const MICROSOFT_SCOPES = ["openid", "profile", "email", "offline_access", "User.Read"];
const GOOGLE_SHARED_CALLBACK = "/api/integrations/google-workspace/callback";

export const AGENT_OAUTH_COOKIE_NAMES = [
  "rythm_agent_oauth_state",
  "rythm_agent_oauth_session",
  "rythm_agent_oauth_integration",
  "rythm_agent_oauth_user",
  "rythm_agent_oauth_provider",
  "rythm_agent_oauth_pkce",
] as const;

export function isAgentOAuthProvider(providerKey: string): providerKey is AgentOAuthProviderKey {
  return ["google_search_console", "google_analytics", "google_workspace", "microsoft_365"].includes(providerKey);
}

export function agentOAuthCallbackPath(providerKey: AgentOAuthProviderKey) {
  return providerKey === "microsoft_365" ? "/api/integrations/microsoft-365/callback" : GOOGLE_SHARED_CALLBACK;
}

export function connectionAgentOrigin() {
  const configured = process.env.RYTHM_PUBLIC_APP_ORIGIN?.trim() || process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return new URL(configured).origin;
  if (process.env.VERCEL_ENV === "preview" && process.env.VERCEL_URL) return `https://${process.env.VERCEL_URL}`;
  return "https://rythm-os.com";
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

function config(providerKey: AgentOAuthProviderKey): ProviderConfig {
  if (providerKey === "microsoft_365") {
    const { clientId, clientSecret, tenant } = microsoftCredentials();
    return {
      clientId,
      clientSecret,
      redirectPath: agentOAuthCallbackPath(providerKey),
      scopes: MICROSOFT_SCOPES,
      authorizationUrl: `https://login.microsoftonline.com/${encodeURIComponent(tenant)}/oauth2/v2.0/authorize`,
      prompt: "select_account",
    };
  }
  const { clientId, clientSecret } = googleCredentials();
  if (providerKey === "google_search_console") return {
    clientId, clientSecret, redirectPath: agentOAuthCallbackPath(providerKey),
    scopes: ["openid", "email", GOOGLE_GSC_SCOPE], authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth", prompt: "consent",
  };
  if (providerKey === "google_analytics") return {
    clientId, clientSecret, redirectPath: agentOAuthCallbackPath(providerKey),
    scopes: ["openid", "email", GOOGLE_GA_SCOPE], authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth", prompt: "consent",
  };
  return {
    clientId, clientSecret, redirectPath: agentOAuthCallbackPath(providerKey),
    scopes: GOOGLE_WORKSPACE_SCOPES, authorizationUrl: "https://accounts.google.com/o/oauth2/v2/auth", prompt: "consent",
  };
}

function sign(providerKey: AgentOAuthProviderKey, payload: AgentOAuthStatePayload) {
  const { clientSecret } = config(providerKey);
  if (!clientSecret) throw new Error(`${providerKey} OAuth server credentials are not configured.`);
  const encoded = Buffer.from(JSON.stringify(payload), "utf8").toString("base64url");
  const signature = crypto.createHmac("sha256", clientSecret).update(encoded).digest("base64url");
  return `${encoded}.${signature}`;
}

export function verifyAgentOAuthState(providerKey: string, state: string): AgentOAuthStatePayload | null {
  if (!isAgentOAuthProvider(providerKey)) return null;
  const { clientSecret } = config(providerKey);
  const [encoded, supplied] = state.split(".");
  if (!clientSecret || !encoded || !supplied) return null;
  const expected = crypto.createHmac("sha256", clientSecret).update(encoded).digest("base64url");
  const a = Buffer.from(supplied);
  const b = Buffer.from(expected);
  if (a.length !== b.length || !crypto.timingSafeEqual(a, b)) return null;
  try {
    const payload = JSON.parse(Buffer.from(encoded, "base64url").toString("utf8")) as AgentOAuthStatePayload;
    if (
      payload.agent !== true || payload.providerKey !== providerKey || !payload.sessionId || !payload.organizationId ||
      !payload.integrationId || !payload.userId || !payload.nonce || !Number.isFinite(payload.issuedAt) ||
      Date.now() - payload.issuedAt > 10 * 60 * 1000 || payload.issuedAt > Date.now() + 60_000
    ) return null;
    return payload;
  } catch { return null; }
}

export function prepareAgentOAuthLaunch(input: {
  providerKey: AgentOAuthProviderKey;
  sessionId: string;
  organizationId: string;
  integrationId: string;
  userId: string;
  projectId?: string | null;
  origin?: string;
}) {
  const origin = input.origin ?? connectionAgentOrigin();
  const provider = config(input.providerKey);
  if (!provider.clientId || !provider.clientSecret) throw new Error(`${input.providerKey} OAuth platform credentials are not configured.`);

  const payload: AgentOAuthStatePayload = {
    agent: true,
    sessionId: input.sessionId,
    organizationId: input.organizationId,
    integrationId: input.integrationId,
    userId: input.userId,
    projectId: input.projectId ?? null,
    providerKey: input.providerKey,
    nonce: crypto.randomBytes(24).toString("base64url"),
    issuedAt: Date.now(),
  };
  const state = sign(input.providerKey, payload);
  const verifier = crypto.randomBytes(48).toString("base64url");
  const challenge = crypto.createHash("sha256").update(verifier).digest("base64url");
  const redirectUri = `${origin}${provider.redirectPath}`;
  const authorizationUrl = new URL(provider.authorizationUrl);
  authorizationUrl.searchParams.set("client_id", provider.clientId);
  authorizationUrl.searchParams.set("response_type", "code");
  authorizationUrl.searchParams.set("redirect_uri", redirectUri);
  authorizationUrl.searchParams.set("scope", provider.scopes.join(" "));
  authorizationUrl.searchParams.set("state", state);
  authorizationUrl.searchParams.set("code_challenge", challenge);
  authorizationUrl.searchParams.set("code_challenge_method", "S256");
  if (input.providerKey === "microsoft_365") {
    authorizationUrl.searchParams.set("response_mode", "query");
    authorizationUrl.searchParams.set("prompt", provider.prompt || "select_account");
  } else {
    authorizationUrl.searchParams.set("access_type", "offline");
    authorizationUrl.searchParams.set("include_granted_scopes", "true");
    authorizationUrl.searchParams.set("prompt", provider.prompt || "consent");
  }

  const callbackUrl = `${origin}${provider.redirectPath}`;
  const cookiePath = provider.redirectPath.replace(/\/callback$/, "");
  const cookie = (name: string, value: string): BrowserBootstrapCookie => ({
    name, value, url: callbackUrl, path: cookiePath, httpOnly: true, secure: true, sameSite: "Lax",
  });
  const bootstrapCookies: BrowserBootstrapCookie[] = [
    cookie("rythm_agent_oauth_state", state),
    cookie("rythm_agent_oauth_session", input.sessionId),
    cookie("rythm_agent_oauth_integration", input.integrationId),
    cookie("rythm_agent_oauth_user", input.userId),
    cookie("rythm_agent_oauth_provider", input.providerKey),
    cookie("rythm_agent_oauth_pkce", verifier),
  ];

  return { authorizationUrl: authorizationUrl.toString(), bootstrapCookies, redirectUri };
}
