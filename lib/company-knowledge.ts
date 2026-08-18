import type { AgentAttachmentInput } from "@/lib/ai/agent-provider";

type KnowledgeAgent = {
  id: string;
  role_title: string;
  department?: string | null;
};

type KnowledgeRow = {
  id: string;
  title: string;
  category: string;
  source_type: string;
  content: string | null;
  source_url: string | null;
  storage_path: string | null;
  mime_type: string | null;
  confidentiality: "public" | "internal" | "confidential" | "restricted";
  allowed_departments: string[] | null;
  allowed_role_keywords: string[] | null;
  updated_at: string;
};

type KnowledgeContext = {
  organizationId: string;
  organization: { name?: string | null; mission?: string | null; vision?: string | null };
  supabase: any;
};

const CATEGORY_ROLE_HINTS: Record<string, string[]> = {
  brand: ["design", "creative", "brand", "marketing", "product", "growth", "sales", "ceo", "founder"],
  people: ["hr", "people", "talent", "operations", "manager", "ceo", "founder", "assistant"],
  contact: ["design", "brand", "marketing", "sales", "support", "operations", "assistant", "ceo", "founder"],
  finance: ["finance", "cfo", "account", "analyst", "strategy", "ceo", "founder"],
  analytics: ["analyst", "analytics", "data", "finance", "operations", "strategy", "ceo", "founder"],
  legal: ["legal", "counsel", "compliance", "risk", "ceo", "founder"],
  sales: ["sales", "growth", "marketing", "commercial", "revenue", "ceo", "founder"],
  operations: ["operations", "project", "delivery", "manager", "analyst", "ceo", "founder"],
  process: ["operations", "project", "delivery", "manager", "analyst", "ceo", "founder"],
  product: ["product", "design", "engineering", "marketing", "sales", "support", "strategy", "ceo", "founder"],
  service: ["delivery", "sales", "support", "marketing", "strategy", "operations", "ceo", "founder"],
};

function normalize(value: string | null | undefined) {
  return String(value ?? "").toLowerCase();
}

function roleCanUse(item: KnowledgeRow, agent: KnowledgeAgent) {
  const role = normalize(agent.role_title);
  const department = normalize(agent.department);
  const explicitDepartments = item.allowed_departments ?? [];
  const explicitRoles = item.allowed_role_keywords ?? [];

  if (explicitDepartments.length || explicitRoles.length) {
    return explicitDepartments.some((value) => department.includes(normalize(value))) || explicitRoles.some((value) => role.includes(normalize(value)));
  }

  const hints = CATEGORY_ROLE_HINTS[item.category];
  if (!hints?.length) return true;
  return hints.some((hint) => role.includes(hint) || department.includes(hint));
}

async function fileFromKnowledge(context: KnowledgeContext, item: KnowledgeRow): Promise<AgentAttachmentInput | null> {
  try {
    let buffer: Buffer | null = null;
    let mimeType = item.mime_type || "application/octet-stream";
    let filename = item.title.replace(/[^a-zA-Z0-9._ -]+/g, "-").slice(0, 120) || "company-reference";

    if (item.storage_path) {
      const { data, error } = await context.supabase.storage.from("company-knowledge").download(item.storage_path);
      if (error || !data) return null;
      buffer = Buffer.from(await data.arrayBuffer());
      if (data.type) mimeType = data.type;
    } else if (item.source_url && item.mime_type && /^(image\/|application\/pdf)/.test(item.mime_type)) {
      const response = await fetch(item.source_url, { signal: AbortSignal.timeout(8000), redirect: "follow" });
      if (!response.ok) return null;
      buffer = Buffer.from(await response.arrayBuffer());
      mimeType = response.headers.get("content-type")?.split(";")[0] || mimeType;
      try {
        const pathname = new URL(item.source_url).pathname;
        filename = pathname.split("/").filter(Boolean).pop() || filename;
      } catch {}
    }

    if (!buffer?.length || buffer.length > 15 * 1024 * 1024) return null;
    return { filename, mimeType, base64: buffer.toString("base64") };
  } catch {
    return null;
  }
}

export async function loadCompanyKnowledgeForAgent(context: KnowledgeContext, agent: KnowledgeAgent) {
  const { data } = await context.supabase
    .from("company_knowledge")
    .select("id,title,category,source_type,content,source_url,storage_path,mime_type,confidentiality,allowed_departments,allowed_role_keywords,updated_at")
    .eq("organization_id", context.organizationId)
    .eq("status", "active")
    .order("updated_at", { ascending: false })
    .limit(80);

  const relevant = ((data ?? []) as KnowledgeRow[]).filter((item) => roleCanUse(item, agent));
  const baseline = [
    `Company: ${context.organization?.name || "Current company"}`,
    context.organization?.mission ? `Mission: ${context.organization.mission}` : "",
    context.organization?.vision ? `Vision: ${context.organization.vision}` : "",
  ].filter(Boolean).join("\n");

  const entries = relevant
    .filter((item) => item.content?.trim() || item.source_url)
    .map((item) => {
      const source = item.source_url ? ` Source: ${item.source_url}` : "";
      const body = item.content?.trim() ? item.content.trim().slice(0, 5000) : "Reference asset available to this Agent.";
      return `[${item.category.toUpperCase()} · ${item.confidentiality.toUpperCase()}] ${item.title}\n${body}${source}`;
    });

  const contextText = `Current Company Knowledge — use this as authoritative company context. It is live company-scoped knowledge and must not be treated as transferable personal knowledge.\n${baseline}${entries.length ? `\n\n${entries.join("\n\n")}` : ""}`.slice(0, 32000);

  const attachmentCandidates = relevant.filter((item) => item.storage_path || (item.source_url && item.mime_type && /^(image\/|application\/pdf)/.test(item.mime_type))).slice(0, 5);
  const attachments = (await Promise.all(attachmentCandidates.map((item) => fileFromKnowledge(context, item)))).filter(Boolean) as AgentAttachmentInput[];

  return { contextText, attachments, knowledgeCount: relevant.length };
}
