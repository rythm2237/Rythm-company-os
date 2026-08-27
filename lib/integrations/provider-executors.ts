import { wrapReadOnlySql } from "@/lib/security/read-only-sql";
import { executeJsonRequest } from "@/lib/integrations/adapters/http";

type Json = Record<string, any>;

type ProviderExecution = {
  providerKey: string;
  capabilityKey: string;
  credential: string;
  accountRef?: string | null;
  baseUrl?: string | null;
  input: Json;
  idempotencyKey?: string;
  timeoutMs?: number;
};

async function jsonFetch(url: string, init: RequestInit, timeoutMs = 20_000) {
  return executeJsonRequest(new URL(url), init, timeoutMs);
}

function segment(value: unknown) {
  return encodeURIComponent(String(value));
}
function contentPath(value: unknown) {
  return String(value).replace(/^\/+/, "").split("/").map(segment).join("/");
}

function requireFields(input: Json, fields: string[]) {
  for (const field of fields)
    if (input[field] == null || input[field] === "")
      throw new Error(`Missing provider input: ${field}`);
}

async function executeGitHub(args: ProviderExecution) {
  const base = args.baseUrl || "https://api.github.com";
  const headers = {
    Authorization: `Bearer ${args.credential}`,
    Accept: "application/vnd.github+json",
    "X-GitHub-Api-Version": "2022-11-28",
    "Content-Type": "application/json",
  };
  const i = args.input;
  if (args.capabilityKey === "repo.read") {
    requireFields(i, ["owner", "repo"]);
    const path = i.path ? `/${String(i.path).replace(/^\//, "")}` : "";
    const ref = i.ref ? `?ref=${encodeURIComponent(i.ref)}` : "";
    return jsonFetch(
      `${base}/repos/${segment(i.owner)}/${segment(i.repo)}/contents${path ? `/${contentPath(i.path)}` : ""}${ref}`,
      { headers },
      args.timeoutMs,
    );
  }
  if (args.capabilityKey === "branch.create") {
    requireFields(i, ["owner", "repo", "branch", "fromSha"]);
    return jsonFetch(
      `${base}/repos/${segment(i.owner)}/${segment(i.repo)}/git/refs`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({ ref: `refs/heads/${i.branch}`, sha: i.fromSha }),
      },
      args.timeoutMs,
    );
  }
  if (args.capabilityKey === "code.write") {
    requireFields(i, ["owner", "repo", "path", "content", "message", "branch"]);
    return jsonFetch(
      `${base}/repos/${segment(i.owner)}/${segment(i.repo)}/contents/${contentPath(i.path)}`,
      {
        method: "PUT",
        headers,
        body: JSON.stringify({
          message: i.message,
          content: Buffer.from(String(i.content), "utf8").toString("base64"),
          branch: i.branch,
          ...(i.sha ? { sha: i.sha } : {}),
        }),
      },
      args.timeoutMs,
    );
  }
  if (args.capabilityKey === "pull_request.create") {
    requireFields(i, ["owner", "repo", "title", "head", "base"]);
    return jsonFetch(
      `${base}/repos/${segment(i.owner)}/${segment(i.repo)}/pulls`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          title: i.title,
          head: i.head,
          base: i.base,
          body: i.body || "",
        }),
      },
      args.timeoutMs,
    );
  }
  if (args.capabilityKey === "pull_request.merge") {
    requireFields(i, ["owner", "repo", "pullNumber"]);
    return jsonFetch(
      `${base}/repos/${segment(i.owner)}/${segment(i.repo)}/pulls/${segment(i.pullNumber)}/merge`,
      {
        method: "PUT",
        headers: {
          ...headers,
          ...(args.idempotencyKey
            ? { "Idempotency-Key": args.idempotencyKey }
            : {}),
        },
        body: JSON.stringify({ merge_method: i.mergeMethod || "merge" }),
      },
      args.timeoutMs,
    );
  }
  throw new Error(`Unsupported GitHub capability: ${args.capabilityKey}`);
}

async function executeVercel(args: ProviderExecution) {
  const base = args.baseUrl || "https://api.vercel.com";
  const i = args.input;
  const team = i.teamId || args.accountRef;
  const qs = team ? `?teamId=${encodeURIComponent(team)}` : "";
  const headers = {
    Authorization: `Bearer ${args.credential}`,
    "Content-Type": "application/json",
  };
  if (args.capabilityKey === "deployment.read") {
    if (i.deploymentId)
      return jsonFetch(
        `${base}/v13/deployments/${segment(i.deploymentId)}${qs}`,
        { headers },
        args.timeoutMs,
      );
    const query = new URLSearchParams();
    if (team) query.set("teamId", team);
    if (i.projectId) query.set("projectId", i.projectId);
    if (i.limit) query.set("limit", String(i.limit));
    return jsonFetch(`${base}/v6/deployments?${query.toString()}`, { headers });
  }
  if (
    args.capabilityKey === "preview.deploy" ||
    args.capabilityKey === "production.deploy"
  ) {
    requireFields(i, ["name"]);
    const body = {
      name: i.name,
      ...(i.project ? { project: i.project } : {}),
      ...(i.gitSource ? { gitSource: i.gitSource } : {}),
      ...(i.files ? { files: i.files } : {}),
      target:
        args.capabilityKey === "production.deploy" ? "production" : undefined,
      projectSettings: i.projectSettings,
    };
    return jsonFetch(
      `${base}/v13/deployments${qs}`,
      {
        method: "POST",
        headers: {
          ...headers,
          ...(args.idempotencyKey
            ? { "Idempotency-Key": args.idempotencyKey }
            : {}),
        },
        body: JSON.stringify(body),
      },
      args.timeoutMs,
    );
  }
  throw new Error(`Unsupported Vercel capability: ${args.capabilityKey}`);
}

async function executeSupabase(args: ProviderExecution) {
  const base = args.baseUrl || "https://api.supabase.com";
  const i = args.input;
  const projectRef = i.projectRef || args.accountRef;
  if (!projectRef) throw new Error("Missing provider input: projectRef");
  const headers = {
    Authorization: `Bearer ${args.credential}`,
    "Content-Type": "application/json",
  };
  if (args.capabilityKey === "schema.read") {
    const sql = wrapReadOnlySql(
      "select table_schema,table_name,column_name,data_type from information_schema.columns where table_schema='public' order by table_name,ordinal_position limit 500",
    );
    return jsonFetch(
      `${base}/v1/projects/${segment(projectRef)}/database/query`,
      { method: "POST", headers, body: JSON.stringify({ query: sql }) },
      args.timeoutMs,
    );
  }
  if (args.capabilityKey === "sql.read") {
    requireFields(i, ["sql"]);
    const sql = wrapReadOnlySql(String(i.sql));
    return jsonFetch(
      `${base}/v1/projects/${segment(projectRef)}/database/query`,
      { method: "POST", headers, body: JSON.stringify({ query: sql }) },
      args.timeoutMs,
    );
  }
  if (args.capabilityKey === "migration.apply") {
    requireFields(i, ["sql"]);
    return jsonFetch(
      `${base}/v1/projects/${segment(projectRef)}/database/query`,
      { method: "POST", headers, body: JSON.stringify({ query: i.sql }) },
      args.timeoutMs,
    );
  }
  throw new Error(`Unsupported Supabase capability: ${args.capabilityKey}`);
}

async function executeCloudflare(args: ProviderExecution) {
  const base = args.baseUrl || "https://api.cloudflare.com/client/v4";
  const i = args.input;
  const headers = {
    Authorization: `Bearer ${args.credential}`,
    "Content-Type": "application/json",
  };
  if (args.capabilityKey === "dns.read") {
    requireFields(i, ["zoneId"]);
    const suffix = i.recordId ? `/${segment(i.recordId)}` : "";
    return jsonFetch(
      `${base}/zones/${segment(i.zoneId)}/dns_records${suffix}`,
      { headers },
      args.timeoutMs,
    );
  }
  if (args.capabilityKey === "dns.write") {
    requireFields(i, ["zoneId", "type", "name", "content"]);
    if (i.recordId)
      return jsonFetch(
        `${base}/zones/${segment(i.zoneId)}/dns_records/${segment(i.recordId)}`,
        {
          method: "PUT",
          headers,
          body: JSON.stringify({
            type: i.type,
            name: i.name,
            content: i.content,
            ttl: i.ttl || 1,
            proxied: i.proxied,
          }),
        },
        args.timeoutMs,
      );
    return jsonFetch(
      `${base}/zones/${segment(i.zoneId)}/dns_records`,
      {
        method: "POST",
        headers,
        body: JSON.stringify({
          type: i.type,
          name: i.name,
          content: i.content,
          ttl: i.ttl || 1,
          proxied: i.proxied,
        }),
      },
      args.timeoutMs,
    );
  }
  throw new Error(`Unsupported Cloudflare capability: ${args.capabilityKey}`);
}

async function executeStripe(args: ProviderExecution) {
  const base = args.baseUrl || "https://api.stripe.com";
  const i = args.input;
  const headers = { Authorization: `Bearer ${args.credential}` };
  if (args.capabilityKey === "billing.read") {
    const path = i.path || "/v1/customers";
    if (!String(path).startsWith("/v1/"))
      throw new Error("Stripe read path must start with /v1/.");
    return jsonFetch(`${base}${path}`, { headers });
  }
  if (args.capabilityKey === "refund.create") {
    if (!i.paymentIntent && !i.charge)
      throw new Error("paymentIntent or charge is required.");
    const body = new URLSearchParams();
    if (i.paymentIntent) body.set("payment_intent", i.paymentIntent);
    if (i.charge) body.set("charge", i.charge);
    if (i.amount) body.set("amount", String(i.amount));
    return jsonFetch(
      `${base}/v1/refunds`,
      {
        method: "POST",
        headers: {
          ...headers,
          "Content-Type": "application/x-www-form-urlencoded",
          ...(args.idempotencyKey
            ? { "Idempotency-Key": args.idempotencyKey }
            : {}),
        },
        body,
      },
      args.timeoutMs,
    );
  }
  throw new Error(`Unsupported Stripe capability: ${args.capabilityKey}`);
}

async function executeGoogle(args: ProviderExecution) {
  const i = args.input;
  const headers = {
    Authorization: `Bearer ${args.credential}`,
    "Content-Type": "application/json",
  };
  if (args.capabilityKey === "calendar.read") {
    const calendarId = encodeURIComponent(i.calendarId || "primary");
    return jsonFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events?maxResults=${i.maxResults || 20}&singleEvents=true&orderBy=startTime`,
      { headers },
    );
  }
  if (args.capabilityKey === "calendar.write") {
    const calendarId = encodeURIComponent(i.calendarId || "primary");
    requireFields(i, ["event"]);
    return jsonFetch(
      `https://www.googleapis.com/calendar/v3/calendars/${calendarId}/events`,
      { method: "POST", headers, body: JSON.stringify(i.event) },
    );
  }
  if (args.capabilityKey === "email.send") {
    requireFields(i, ["raw"]);
    return jsonFetch(
      "https://gmail.googleapis.com/gmail/v1/users/me/messages/send",
      { method: "POST", headers, body: JSON.stringify({ raw: i.raw }) },
    );
  }
  throw new Error(
    `Unsupported Google Workspace capability: ${args.capabilityKey}`,
  );
}

async function executeMicrosoft(args: ProviderExecution) {
  const i = args.input;
  const headers = {
    Authorization: `Bearer ${args.credential}`,
    "Content-Type": "application/json",
  };
  if (args.capabilityKey === "calendar.read")
    return jsonFetch("https://graph.microsoft.com/v1.0/me/events?$top=20", {
      headers,
    });
  if (args.capabilityKey === "calendar.write") {
    requireFields(i, ["event"]);
    return jsonFetch("https://graph.microsoft.com/v1.0/me/events", {
      method: "POST",
      headers,
      body: JSON.stringify(i.event),
    });
  }
  if (args.capabilityKey === "email.send") {
    requireFields(i, ["message"]);
    return jsonFetch("https://graph.microsoft.com/v1.0/me/sendMail", {
      method: "POST",
      headers,
      body: JSON.stringify({ message: i.message, saveToSentItems: true }),
    });
  }
  throw new Error(
    `Unsupported Microsoft 365 capability: ${args.capabilityKey}`,
  );
}

export async function executeProviderCapability(args: ProviderExecution) {
  switch (args.providerKey) {
    case "github":
      return executeGitHub(args);
    case "vercel":
      return executeVercel(args);
    case "supabase":
      return executeSupabase(args);
    case "cloudflare":
      return executeCloudflare(args);
    case "stripe":
      return executeStripe(args);
    case "google_workspace":
      return executeGoogle(args);
    case "microsoft_365":
      return executeMicrosoft(args);
    default:
      throw new Error(
        `No executor is registered for provider ${args.providerKey}.`,
      );
  }
}
