import "server-only";
import { isIP } from "node:net";
import type { ProviderSetupPlan } from "@/lib/integrations/connections/setup-plans";

export type BrowserControlMode = "ai" | "human" | "paused";
export type BrowserActionKind = "navigate" | "read" | "click" | "type_safe_value" | "select" | "scroll" | "wait" | "upload_safe_file";
export type BrowserRuntimeState = "starting" | "running" | "waiting_for_user" | "paused" | "stopped" | "failed" | "expired";

export type BrowserAction = {
  kind: BrowserActionKind;
  url?: string;
  targetHint?: string;
  value?: string;
  fileRef?: string;
  confidence?: number;
};

export type BrowserSession = {
  id: string;
  state: BrowserRuntimeState;
  controlMode: BrowserControlMode;
  currentUrl: string | null;
  viewerUrl: string | null;
  expiresAt: string | null;
};

export type BrowserActionResult = {
  ok: boolean;
  state: BrowserRuntimeState;
  currentUrl: string | null;
  message: string;
  requiresUserAction?: boolean;
};

export interface ComputerUseRuntime {
  readonly available: boolean;
  createSession(input: { sessionId: string; providerKey: string; allowedHosts: string[]; startUrl: string }): Promise<BrowserSession>;
  getSession(browserSessionId: string): Promise<BrowserSession>;
  execute(browserSessionId: string, action: BrowserAction, plan: ProviderSetupPlan): Promise<BrowserActionResult>;
  setControl(browserSessionId: string, mode: BrowserControlMode): Promise<BrowserSession>;
  closeSession(browserSessionId: string): Promise<void>;
}

const FORBIDDEN_VALUE_HINTS = ["password", "passcode", "otp", "mfa", "verification code", "security code", "passkey", "captcha", "secret", "private key"];

function hostAllowed(hostname: string, allowedHosts: string[]) {
  const host = hostname.toLowerCase().replace(/\.$/, "");
  return allowedHosts.some((allowed) => {
    const normalized = allowed.toLowerCase().replace(/\.$/, "");
    return host === normalized || host.endsWith(`.${normalized}`);
  });
}

function isPrivateIpv4(host: string) {
  const parts = host.split(".").map(Number);
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false;
  return parts[0] === 10 || parts[0] === 127 || (parts[0] === 169 && parts[1] === 254) || (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) || (parts[0] === 192 && parts[1] === 168);
}

export function assertSafeBrowserUrl(rawUrl: string, allowedHosts: string[]) {
  let url: URL;
  try { url = new URL(rawUrl); } catch { throw new Error("Browser navigation URL is invalid."); }
  if (url.protocol !== "https:") throw new Error("Browser navigation is restricted to HTTPS.");
  if (url.username || url.password) throw new Error("Credential-bearing URLs are forbidden.");
  const host = url.hostname.toLowerCase();
  if (host === "localhost" || host.endsWith(".localhost") || isPrivateIpv4(host) || (isIP(host) && !hostAllowed(host, allowedHosts))) throw new Error("Private or local network navigation is blocked.");
  if (!hostAllowed(host, allowedHosts)) throw new Error(`Unexpected browser domain blocked: ${host}`);
  return url;
}

export function assertSafeBrowserAction(action: BrowserAction, plan: ProviderSetupPlan) {
  if (action.url) assertSafeBrowserUrl(action.url, plan.allowedHosts);
  if (action.kind === "type_safe_value") {
    const hint = `${action.targetHint ?? ""} ${action.value ?? ""}`.toLowerCase();
    if (FORBIDDEN_VALUE_HINTS.some((term) => hint.includes(term))) throw new Error("Sensitive credential input is Human-only.");
    if (!action.targetHint || typeof action.value !== "string") throw new Error("Safe typing requires a semantic target and explicit non-sensitive value.");
  }
  if (["click", "select", "type_safe_value"].includes(action.kind) && (action.confidence ?? 0) < 0.8) throw new Error("Browser action confidence is below the safe execution threshold.");
  if (action.kind === "upload_safe_file" && !action.fileRef) throw new Error("Safe file upload requires an explicit approved file reference.");
}

class DisabledComputerUseRuntime implements ComputerUseRuntime {
  readonly available = false;
  private unavailable(): never { throw new Error("Computer Use runtime is not configured for this environment."); }
  async createSession(): Promise<BrowserSession> { return this.unavailable(); }
  async getSession(): Promise<BrowserSession> { return this.unavailable(); }
  async execute(): Promise<BrowserActionResult> { return this.unavailable(); }
  async setControl(): Promise<BrowserSession> { return this.unavailable(); }
  async closeSession(): Promise<void> { return this.unavailable(); }
}

class HttpComputerUseRuntime implements ComputerUseRuntime {
  readonly available = true;
  constructor(private readonly endpoint: string, private readonly serviceToken: string) {}

  private async request<T>(path: string, init: RequestInit): Promise<T> {
    const endpoint = new URL(path, this.endpoint);
    const response = await fetch(endpoint, {
      ...init,
      headers: { "content-type": "application/json", authorization: `Bearer ${this.serviceToken}`, ...init.headers },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Computer Use runtime request failed (${response.status}).`);
    return await response.json() as T;
  }

  async createSession(input: { sessionId: string; providerKey: string; allowedHosts: string[]; startUrl: string }) {
    assertSafeBrowserUrl(input.startUrl, input.allowedHosts);
    return this.request<BrowserSession>("/v1/sessions", { method: "POST", body: JSON.stringify({ ...input, credentialCapture: false, screenshotRedaction: "sensitive-fields", privateNetworkAccess: false }) });
  }

  async getSession(browserSessionId: string) {
    return this.request<BrowserSession>(`/v1/sessions/${encodeURIComponent(browserSessionId)}`, { method: "GET" });
  }

  async execute(browserSessionId: string, action: BrowserAction, plan: ProviderSetupPlan) {
    assertSafeBrowserAction(action, plan);
    return this.request<BrowserActionResult>(`/v1/sessions/${encodeURIComponent(browserSessionId)}/actions`, { method: "POST", body: JSON.stringify({ action, allowedHosts: plan.allowedHosts, forbidCredentialCapture: true }) });
  }

  async setControl(browserSessionId: string, mode: BrowserControlMode) {
    return this.request<BrowserSession>(`/v1/sessions/${encodeURIComponent(browserSessionId)}/control`, { method: "POST", body: JSON.stringify({ mode }) });
  }

  async closeSession(browserSessionId: string) {
    await this.request<{ ok: boolean }>(`/v1/sessions/${encodeURIComponent(browserSessionId)}`, { method: "DELETE" });
  }
}

let singleton: ComputerUseRuntime | null = null;
export function getComputerUseRuntime(): ComputerUseRuntime {
  if (singleton) return singleton;
  const endpoint = process.env.RYTHM_COMPUTER_USE_ENDPOINT?.trim();
  const token = process.env.RYTHM_COMPUTER_USE_SERVICE_TOKEN?.trim();
  singleton = endpoint && token ? new HttpComputerUseRuntime(endpoint, token) : new DisabledComputerUseRuntime();
  return singleton;
}
