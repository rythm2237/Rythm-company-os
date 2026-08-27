import { executeJsonRequest, secureProviderUrl } from "@/lib/integrations/adapters/http";
import { INTEGRATION_ADAPTERS } from "@/lib/integrations/adapters/provider-adapters";
import type { AdapterContext } from "@/lib/integrations/adapters/types";
import { TOOL_REGISTRY, type ToolMetadata, type ToolOperationMetadata } from "@/lib/integrations/registry";

const TOOL_ID = "google_workspace.bootstrap";
let registered = false;

function bootstrapReadOperation(permission: string, scopes: string[]): ToolOperationMetadata {
  return {
    operation: "read",
    readWrite: "read",
    external: true,
    riskLevel: "low",
    riskCeiling: "low",
    approvalPolicy: "not_required",
    reversibility: "not_applicable",
    dataSensitivity: "confidential",
    externalSideEffect: false,
    financialImpact: false,
    requiredAgentPermissions: [permission],
    requiredUserPermissions: ["read"],
    requiredScopes: scopes,
    idempotencySupported: true,
    timeoutMs: 20_000,
    retryPolicy: { maxAttempts: 3, baseDelayMs: 200, maxDelayMs: 1_500 },
    rateLimit: {
      userPerHour: 20,
      organizationPerHour: 100,
      agentPerHour: 20,
      integrationPerHour: 100,
      operationPerHour: 50,
    },
    allowedEnvironments: ["development", "preview", "production"],
    rollbackSupported: false,
  };
}

function accessToken(credential: string) {
  const trimmed = credential.trim();
  if (!trimmed) throw new Error("Provider credential is unavailable.");
  if (!trimmed.startsWith("{")) return trimmed;
  try {
    const envelope = JSON.parse(trimmed) as { access_token?: unknown; provider?: unknown };
    const token = typeof envelope.access_token === "string" ? envelope.access_token.trim() : "";
    if (!token) throw new Error("Google OAuth access token is unavailable.");
    if (envelope.provider && envelope.provider !== "google_workspace")
      throw new Error("Google OAuth credential provider does not match the integration.");
    return token;
  } catch (error) {
    if (error instanceof Error && error.message.startsWith("Google OAuth")) throw error;
    throw new Error("Google OAuth credential envelope is invalid.");
  }
}

function headerValue(headers: Array<{ name?: string; value?: string }> | undefined, name: string) {
  return headers?.find((header) => header.name?.toLowerCase() === name.toLowerCase())?.value ?? null;
}

function splitRecipients(value: string | null) {
  if (!value) return [];
  return value.split(",").map((item) => item.trim()).filter(Boolean).slice(0, 20);
}

async function readGmailMetadata(context: AdapterContext) {
  const headers = { Authorization: `Bearer ${accessToken(context.credential)}` };
  const maxResults = Math.max(1, Math.min(Number(context.request.input.maxResults ?? 50), 100));
  const days = Math.max(1, Math.min(Number(context.request.input.days ?? 90), 365));
  const q = `newer_than:${days}d`;
  const listUrl = await secureProviderUrl(
    `https://gmail.googleapis.com/gmail/v1/users/me/messages?maxResults=${maxResults}&q=${encodeURIComponent(q)}`,
    ["gmail.googleapis.com"],
  );
  const profileUrl = await secureProviderUrl(
    "https://gmail.googleapis.com/gmail/v1/users/me/profile",
    ["gmail.googleapis.com"],
  );
  const [listRaw, profileRaw] = await Promise.all([
    executeJsonRequest(listUrl, { headers }, context.request.timeoutMs),
    executeJsonRequest(profileUrl, { headers }, context.request.timeoutMs),
  ]);
  const list = (listRaw ?? {}) as { messages?: Array<{ id?: string; threadId?: string }> };
  const profile = (profileRaw ?? {}) as { emailAddress?: string };
  const ids = (list.messages ?? []).map((message) => message.id).filter((id): id is string => Boolean(id));
  const messages = await Promise.all(
    ids.map(async (id) => {
      const url = await secureProviderUrl(
        `https://gmail.googleapis.com/gmail/v1/users/me/messages/${encodeURIComponent(id)}?format=metadata&metadataHeaders=From&metadataHeaders=To&metadataHeaders=Subject&metadataHeaders=Date`,
        ["gmail.googleapis.com"],
      );
      const raw = (await executeJsonRequest(url, { headers }, context.request.timeoutMs)) as {
        id?: string;
        threadId?: string;
        internalDate?: string;
        payload?: { headers?: Array<{ name?: string; value?: string }> };
      };
      const metadataHeaders = raw.payload?.headers;
      return {
        id: raw.id ?? id,
        threadId: raw.threadId ?? null,
        from: headerValue(metadataHeaders, "From"),
        to: splitRecipients(headerValue(metadataHeaders, "To")),
        subject: headerValue(metadataHeaders, "Subject"),
        date: headerValue(metadataHeaders, "Date"),
        internalDate: raw.internalDate ?? null,
      };
    }),
  );
  return {
    accountEmail: profile.emailAddress ?? null,
    messages,
    rawBodiesPersisted: false,
    attachmentsPersisted: false,
  };
}

async function readCalendarMetadata(context: AdapterContext) {
  const headers = { Authorization: `Bearer ${accessToken(context.credential)}` };
  const maxResults = Math.max(1, Math.min(Number(context.request.input.maxResults ?? 100), 100));
  const lookbackDays = Math.max(1, Math.min(Number(context.request.input.lookbackDays ?? 180), 365));
  const lookaheadDays = Math.max(0, Math.min(Number(context.request.input.lookaheadDays ?? 90), 365));
  const timeMin = new Date(Date.now() - lookbackDays * 86_400_000).toISOString();
  const timeMax = new Date(Date.now() + lookaheadDays * 86_400_000).toISOString();
  const calendarId = encodeURIComponent(String(context.request.input.calendarId ?? "primary"));
  const fields = "items(id,summary,organizer(email),attendees(email),start(date,dateTime)),nextPageToken";
  const url = await secureProviderUrl(
    `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?maxResults=${maxResults}&singleEvents=true&orderBy=startTime&timeMin=${encodeURIComponent(timeMin)}&timeMax=${encodeURIComponent(timeMax)}&fields=${encodeURIComponent(fields)}`,
    ["www.googleapis.com"],
  );
  const raw = (await executeJsonRequest(url, { headers }, context.request.timeoutMs)) as {
    items?: Array<{
      id?: string;
      summary?: string;
      organizer?: { email?: string };
      attendees?: Array<{ email?: string }>;
      start?: { date?: string; dateTime?: string };
    }>;
  };
  return {
    events: (raw.items ?? []).map((event) => ({
      id: event.id ?? "",
      summary: event.summary ?? null,
      organizer: event.organizer?.email ?? null,
      attendees: (event.attendees ?? []).map((attendee) => attendee.email).filter((email): email is string => Boolean(email)).slice(0, 50),
      start: event.start?.dateTime ?? event.start?.date ?? null,
    })),
    descriptionsPersisted: false,
    locationsPersisted: false,
  };
}

export function registerPhase3BootstrapTools() {
  if (registered) return;
  const tool: ToolMetadata = {
    toolId: TOOL_ID,
    integrationId: "google_workspace",
    name: "Google Workspace Company Bootstrap",
    version: "3.0.0-pilot",
    category: "company_bootstrap",
    adapterVersion: "google_workspace-bootstrap-v1",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "gmail.bootstrap.read": bootstrapReadOperation("read_email_metadata", ["gmail.readonly"]),
      "calendar.bootstrap.read": bootstrapReadOperation("read_calendar_metadata", ["calendar.readonly"]),
    },
  };
  TOOL_REGISTRY[TOOL_ID] = tool;
  const baseAdapter = INTEGRATION_ADAPTERS.google_workspace;
  if (!baseAdapter) throw new Error("Google Workspace adapter is unavailable.");
  const originalExecute = baseAdapter.execute.bind(baseAdapter);
  const originalValidate = baseAdapter.validate.bind(baseAdapter);
  const supportedTools = [...new Set([...baseAdapter.supportedTools, TOOL_ID])];
  INTEGRATION_ADAPTERS.google_workspace = {
    ...baseAdapter,
    version: "google_workspace-adapter-v2+bootstrap-v1",
    supportedTools,
    validate(context) {
      if (context.request.tool === TOOL_ID) {
        accessToken(context.credential);
        if (!tool.operations[context.request.operation]) throw new Error("Bootstrap operation is not supported.");
        return;
      }
      return originalValidate(context);
    },
    async execute(context, prepared) {
      if (context.request.tool !== TOOL_ID) return originalExecute(context, prepared);
      if (context.request.operation === "gmail.bootstrap.read")
        return { rawResult: await readGmailMetadata(context), externalReferenceId: null, rollbackReference: null };
      if (context.request.operation === "calendar.bootstrap.read")
        return { rawResult: await readCalendarMetadata(context), externalReferenceId: null, rollbackReference: null };
      throw new Error("Unsupported bootstrap operation.");
    },
  };
  registered = true;
}

export const PHASE3_BOOTSTRAP_TOOL_ID = TOOL_ID;
