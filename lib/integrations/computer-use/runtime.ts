import "server-only";
import { isIP } from "node:net";
import type { ProviderSetupPlan } from "@/lib/integrations/connections/setup-plans";

export type BrowserControlMode = "ai" | "human" | "paused";
export type BrowserActionKind = "navigate" | "read" | "click" | "type_safe_value" | "select" | "scroll" | "wait" | "upload_safe_file";
export type BrowserRuntimeState = "starting" | "running" | "waiting_for_user" | "paused" | "stopped" | "failed" | "expired";

export type BrowserBootstrapCookie = {
  name: string;
  value: string;
  url: string;
  path?: string;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: "Strict" | "Lax" | "None";
};

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

export type CreateBrowserSessionInput = {
  sessionId: string;
  providerKey: string;
  allowedHosts: string[];
  startUrl: string;
  bootstrapCookies?: BrowserBootstrapCookie[];
};

export interface ComputerUseRuntime {
  readonly available: boolean;
  createSession(input: CreateBrowserSessionInput): Promise<BrowserSession>;
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

function assertSafeBootstrapCookie(cookie: BrowserBootstrapCookie, allowedHosts: string[]) {
  if (!cookie.name || cookie.name.length > 128) throw new Error("Browser bootstrap cookie name is invalid.");
  if (!cookie.value || cookie.value.length > 8192) throw new Error("Browser bootstrap cookie value is invalid.");
  assertSafeBrowserUrl(cookie.url, allowedHosts);
  if (cookie.path && !cookie.path.startsWith("/")) throw new Error("Browser bootstrap cookie path is invalid.");
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

  async createSession(input: CreateBrowserSessionInput) {
    assertSafeBrowserUrl(input.startUrl, input.allowedHosts);
    for (const cookie of input.bootstrapCookies ?? []) assertSafeBootstrapCookie(cookie, input.allowedHosts);
    return this.request<BrowserSession>("/v1/sessions", { method: "POST", body: JSON.stringify({ ...input, credentialCapture: false, screenshotRedaction: "sensitive-fields", privateNetworkAccess: false }) });
  }
  async getSession(browserSessionId: string) { return this.request<BrowserSession>(`/v1/sessions/${encodeURIComponent(browserSessionId)}`, { method: "GET" }); }
  async execute(browserSessionId: string, action: BrowserAction, plan: ProviderSetupPlan) {
    assertSafeBrowserAction(action, plan);
    return this.request<BrowserActionResult>(`/v1/sessions/${encodeURIComponent(browserSessionId)}/actions`, { method: "POST", body: JSON.stringify({ action, allowedHosts: plan.allowedHosts, forbidCredentialCapture: true }) });
  }
  async setControl(browserSessionId: string, mode: BrowserControlMode) { return this.request<BrowserSession>(`/v1/sessions/${encodeURIComponent(browserSessionId)}/control`, { method: "POST", body: JSON.stringify({ mode }) }); }
  async closeSession(browserSessionId: string) { await this.request<{ ok: boolean }>(`/v1/sessions/${encodeURIComponent(browserSessionId)}`, { method: "DELETE" }); }
}

type BrowserbaseSessionResponse = {
  id: string;
  status?: "PENDING" | "RUNNING" | "ERROR" | "TIMED_OUT" | "COMPLETED";
  expiresAt?: string | null;
  connectUrl?: string | null;
};
type BrowserbaseDebugResponse = {
  debuggerFullscreenUrl?: string;
  debuggerUrl?: string;
  pages?: Array<{ url?: string }>;
};

function mapBrowserbaseState(status?: BrowserbaseSessionResponse["status"]): BrowserRuntimeState {
  if (status === "PENDING") return "starting";
  if (status === "RUNNING") return "running";
  if (status === "TIMED_OUT") return "expired";
  if (status === "COMPLETED") return "stopped";
  if (status === "ERROR") return "failed";
  return "running";
}

class CdpConnection {
  private nextId = 1;
  private pending = new Map<number, { resolve: (value: any) => void; reject: (reason: Error) => void; timer: ReturnType<typeof setTimeout> }>();
  private constructor(private readonly socket: WebSocket) {
    socket.addEventListener("message", (event) => {
      let message: { id?: number; result?: any; error?: { message?: string } };
      try { message = JSON.parse(typeof event.data === "string" ? event.data : String(event.data)); } catch { return; }
      if (!message.id) return;
      const waiter = this.pending.get(message.id);
      if (!waiter) return;
      clearTimeout(waiter.timer);
      this.pending.delete(message.id);
      if (message.error) waiter.reject(new Error(message.error.message || "CDP command failed."));
      else waiter.resolve(message.result ?? {});
    });
    socket.addEventListener("close", () => {
      for (const waiter of this.pending.values()) { clearTimeout(waiter.timer); waiter.reject(new Error("Cloud browser CDP connection closed.")); }
      this.pending.clear();
    });
  }

  static connect(url: string) {
    return new Promise<CdpConnection>((resolve, reject) => {
      const socket = new WebSocket(url);
      const timer = setTimeout(() => { try { socket.close(); } catch { /* noop */ } reject(new Error("Cloud browser CDP connection timed out.")); }, 10_000);
      socket.addEventListener("open", () => { clearTimeout(timer); resolve(new CdpConnection(socket)); }, { once: true });
      socket.addEventListener("error", () => { clearTimeout(timer); reject(new Error("Cloud browser CDP connection failed.")); }, { once: true });
    });
  }

  request(method: string, params: Record<string, unknown> = {}, sessionId?: string) {
    const id = this.nextId++;
    return new Promise<any>((resolve, reject) => {
      const timer = setTimeout(() => { this.pending.delete(id); reject(new Error(`Cloud browser command timed out: ${method}`)); }, 15_000);
      this.pending.set(id, { resolve, reject, timer });
      this.socket.send(JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) }));
    });
  }

  close() { try { this.socket.close(); } catch { /* noop */ } }
}

class BrowserbaseComputerUseRuntime implements ComputerUseRuntime {
  readonly available = true;
  private readonly apiBase = "https://api.browserbase.com/v1";
  constructor(private readonly apiKey: string, private readonly projectId?: string) {}

  private async api<T>(path: string, init: RequestInit = {}): Promise<T> {
    const response = await fetch(`${this.apiBase}${path}`, {
      ...init,
      headers: { "content-type": "application/json", "x-bb-api-key": this.apiKey, ...init.headers },
      cache: "no-store",
      redirect: "error",
      signal: AbortSignal.timeout(30_000),
    });
    if (!response.ok) throw new Error(`Cloud browser provider request failed (${response.status}).`);
    return await response.json() as T;
  }

  private async debug(id: string) {
    return this.api<BrowserbaseDebugResponse>(`/sessions/${encodeURIComponent(id)}/debug`, { method: "GET" });
  }

  private async withPage<T>(id: string, work: (cdp: CdpConnection, pageSessionId: string) => Promise<T>) {
    const info = await this.api<BrowserbaseSessionResponse>(`/sessions/${encodeURIComponent(id)}`, { method: "GET" });
    if (!info.connectUrl) throw new Error("Cloud browser connection URL is unavailable.");
    const cdp = await CdpConnection.connect(info.connectUrl);
    try {
      const targets = await cdp.request("Target.getTargets") as { targetInfos?: Array<{ targetId: string; type: string }> };
      const page = targets.targetInfos?.find((target) => target.type === "page");
      if (!page) throw new Error("Cloud browser page target is unavailable.");
      const attached = await cdp.request("Target.attachToTarget", { targetId: page.targetId, flatten: true }) as { sessionId?: string };
      if (!attached.sessionId) throw new Error("Cloud browser page attachment failed.");
      return await work(cdp, attached.sessionId);
    } finally { cdp.close(); }
  }

  async createSession(input: CreateBrowserSessionInput) {
    assertSafeBrowserUrl(input.startUrl, input.allowedHosts);
    for (const cookie of input.bootstrapCookies ?? []) assertSafeBootstrapCookie(cookie, input.allowedHosts);
    const region = ["us-west-2","us-east-1","eu-central-1","ap-southeast-1"].includes(process.env.BROWSERBASE_REGION ?? "") ? process.env.BROWSERBASE_REGION : "eu-central-1";
    const created = await this.api<BrowserbaseSessionResponse>("/sessions", {
      method: "POST",
      body: JSON.stringify({
        ...(this.projectId ? { projectId: this.projectId } : {}),
        keepAlive: true,
        timeout: 7200,
        region,
        browserSettings: { recordSession: false, logSession: false, solveCaptchas: false },
        userMetadata: { rythmSessionId: input.sessionId, providerKey: input.providerKey },
      }),
    });
    if (!created.id) throw new Error("Cloud browser provider did not return a session ID.");
    await this.withPage(created.id, async (cdp, pageSessionId) => {
      if (input.bootstrapCookies?.length) {
        await cdp.request("Network.enable", {}, pageSessionId);
        for (const cookie of input.bootstrapCookies) {
          const result = await cdp.request("Network.setCookie", {
            name: cookie.name,
            value: cookie.value,
            url: cookie.url,
            ...(cookie.path ? { path: cookie.path } : {}),
            httpOnly: cookie.httpOnly ?? true,
            secure: cookie.secure ?? true,
            sameSite: cookie.sameSite ?? "Lax",
          }, pageSessionId) as { success?: boolean };
          if (result.success === false) throw new Error("Cloud browser OAuth bootstrap cookie could not be installed.");
        }
      }
      await cdp.request("Page.navigate", { url: input.startUrl }, pageSessionId);
    });
    const session = await this.getSession(created.id);
    if (session.currentUrl) {
      try { assertSafeBrowserUrl(session.currentUrl, input.allowedHosts); }
      catch (error) { await this.closeSession(created.id).catch(() => undefined); throw error; }
    }
    return session;
  }

  async getSession(browserSessionId: string): Promise<BrowserSession> {
    const info = await this.api<BrowserbaseSessionResponse>(`/sessions/${encodeURIComponent(browserSessionId)}`, { method: "GET" });
    let debug: BrowserbaseDebugResponse = {};
    if (info.status === "RUNNING" || info.status === "PENDING") debug = await this.debug(browserSessionId).catch(() => ({}));
    return {
      id: info.id,
      state: mapBrowserbaseState(info.status),
      controlMode: "ai",
      currentUrl: debug.pages?.[0]?.url ?? null,
      viewerUrl: debug.debuggerFullscreenUrl ?? debug.debuggerUrl ?? null,
      expiresAt: info.expiresAt ?? null,
    };
  }

  async execute(browserSessionId: string, action: BrowserAction, plan: ProviderSetupPlan): Promise<BrowserActionResult> {
    assertSafeBrowserAction(action, plan);
    if (action.kind === "upload_safe_file") throw new Error("Automated file upload is disabled; use Human Takeover for files.");
    await this.withPage(browserSessionId, async (cdp, pageSessionId) => {
      if (action.kind === "navigate") {
        if (!action.url) throw new Error("Navigation URL is required.");
        await cdp.request("Page.navigate", { url: action.url }, pageSessionId);
        return;
      }
      if (action.kind === "wait") { await new Promise((resolve) => setTimeout(resolve, 1000)); return; }
      if (action.kind === "scroll") {
        await cdp.request("Runtime.evaluate", { expression: "window.scrollBy({top: Math.max(320, window.innerHeight * 0.7), behavior: 'smooth'}); true", returnByValue: true }, pageSessionId);
        return;
      }
      if (action.kind === "read") {
        await cdp.request("Runtime.evaluate", { expression: "({url: location.href, title: document.title})", returnByValue: true }, pageSessionId);
        return;
      }
      const hint = JSON.stringify(action.targetHint ?? "");
      const finder = `(() => { const hint=${hint}; let el=null; try { el=document.querySelector(hint); } catch {} if(!el){ const h=hint.toLowerCase(); el=[...document.querySelectorAll('button,a,input,select,textarea,[role=button],[role=option]')].find((node)=>{ const e=node; const text=((e.innerText||e.textContent||'')+' '+(e.getAttribute('aria-label')||'')+' '+(e.getAttribute('name')||'')+' '+(e.getAttribute('placeholder')||'')).toLowerCase(); return text.includes(h); })||null; } return el; })()`;
      if (action.kind === "click") {
        const expression = `(() => { const el=${finder}; if(!el) return false; el.click(); return true; })()`;
        const result = await cdp.request("Runtime.evaluate", { expression, returnByValue: true }, pageSessionId) as { result?: { value?: boolean } };
        if (!result.result?.value) throw new Error("Safe browser target was not found.");
        return;
      }
      if (action.kind === "select") {
        const value = JSON.stringify(action.value ?? "");
        const expression = `(() => { const el=${finder}; if(!(el instanceof HTMLSelectElement)) return false; el.value=${value}; el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`;
        const result = await cdp.request("Runtime.evaluate", { expression, returnByValue: true }, pageSessionId) as { result?: { value?: boolean } };
        if (!result.result?.value) throw new Error("Safe select target was not found.");
        return;
      }
      if (action.kind === "type_safe_value") {
        const descriptorExpression = `(() => { const el=${finder}; if(!el) return null; return {tag:el.tagName,type:el.getAttribute('type')||'',name:el.getAttribute('name')||'',autocomplete:el.getAttribute('autocomplete')||'',aria:el.getAttribute('aria-label')||'',placeholder:el.getAttribute('placeholder')||''}; })()`;
        const descriptor = await cdp.request("Runtime.evaluate", { expression: descriptorExpression, returnByValue: true }, pageSessionId) as { result?: { value?: Record<string,string> | null } };
        const field = descriptor.result?.value;
        if (!field) throw new Error("Safe typing target was not found.");
        const fingerprint = Object.values(field).join(" ").toLowerCase();
        if (FORBIDDEN_VALUE_HINTS.some((term) => fingerprint.includes(term)) || field.type.toLowerCase() === "password" || /one-time-code|current-password|new-password/i.test(field.autocomplete)) throw new Error("Sensitive credential field is Human-only.");
        const value = JSON.stringify(action.value ?? "");
        const typeExpression = `(() => { const el=${finder}; if(!(el instanceof HTMLInputElement || el instanceof HTMLTextAreaElement)) return false; el.focus(); el.value=${value}; el.dispatchEvent(new Event('input',{bubbles:true})); el.dispatchEvent(new Event('change',{bubbles:true})); return true; })()`;
        const typed = await cdp.request("Runtime.evaluate", { expression: typeExpression, returnByValue: true }, pageSessionId) as { result?: { value?: boolean } };
        if (!typed.result?.value) throw new Error("Safe typing target was not writable.");
      }
    });
    const latest = await this.getSession(browserSessionId);
    if (latest.currentUrl) assertSafeBrowserUrl(latest.currentUrl, plan.allowedHosts);
    return { ok: true, state: latest.state, currentUrl: latest.currentUrl, message: "Cloud browser action completed safely." };
  }

  async setControl(browserSessionId: string, mode: BrowserControlMode) {
    const session = await this.getSession(browserSessionId);
    return { ...session, controlMode: mode, state: mode === "paused" ? "paused" : mode === "human" ? "waiting_for_user" : session.state };
  }

  async closeSession(browserSessionId: string) {
    await this.api<BrowserbaseSessionResponse>(`/sessions/${encodeURIComponent(browserSessionId)}`, {
      method: "POST",
      body: JSON.stringify({ status: "REQUEST_RELEASE", ...(this.projectId ? { projectId: this.projectId } : {}) }),
    });
  }
}

let singleton: ComputerUseRuntime | null = null;
export function getComputerUseRuntime(): ComputerUseRuntime {
  if (singleton) return singleton;
  const endpoint = process.env.RYTHM_COMPUTER_USE_ENDPOINT?.trim();
  const token = process.env.RYTHM_COMPUTER_USE_SERVICE_TOKEN?.trim();
  if (endpoint && token) return singleton = new HttpComputerUseRuntime(endpoint, token);
  const browserbaseKey = process.env.BROWSERBASE_API_KEY?.trim();
  if (browserbaseKey) return singleton = new BrowserbaseComputerUseRuntime(browserbaseKey, process.env.BROWSERBASE_PROJECT_ID?.trim() || undefined);
  return singleton = new DisabledComputerUseRuntime();
}
