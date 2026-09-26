import { executeAiRequest } from "@/lib/ai/request-gateway";
import { normalizeAiGatewayError } from "@/lib/ai/gateway-errors";
import type { SeoProviderEvidence } from "@/lib/integrations/adapters/seo-provider-analytics";
import type { SeoCheck, SeoMonitoringSnapshot } from "@/lib/seo/monitoring-engine";

export type SeoFindingSeverity = "critical" | "high" | "medium" | "low" | "info";
export type SeoActionAuthority = "read" | "recommend" | "execute_low_risk" | "human_approval_required";

export type SeoFinding = {
  id: string;
  severity: SeoFindingSeverity;
  title: string;
  explanation: string;
  recommendation: string;
  authority: SeoActionAuthority;
  evidence: string[];
};

export type SeoIntelligenceReport = {
  version: "seo-intelligence-v1";
  generatedAt: string;
  site: string;
  healthScore: number;
  summary: string;
  findings: SeoFinding[];
  knowledgeVersion: string;
  guardrails: string[];
};

export type SeoAiReasoning = {
  outputText: string;
  correlationId: string;
  routingMode: string;
  model: string;
};

export const SEO_INTELLIGENCE_KNOWLEDGE = {
  version: "2026-09-26",
  objectives: [
    "Keep canonical RYTHM public URLs crawlable, indexable and discoverable.",
    "Detect technical SEO regressions before recommending content or authority work.",
    "Correlate search, indexing and technical evidence before claiming causality.",
    "Prefer provider evidence and deterministic checks over unsupported inference.",
  ],
  architecture: [
    "Google Search Console, Bing Webmaster, IndexNow and GA4 are established RYTHM data sources.",
    "IndexNow may be used for safe canonical URL discovery notifications.",
    "Provider tokens and customer resources must stay tenant-scoped.",
    "The agent never mutates robots, canonical, redirects, sitemap logic or structured data without human approval.",
  ],
  priorities: [
    "P0: availability, crawlability, indexing, sitemap, canonical, discovery and severe traffic regressions.",
    "P1: search performance trends, structured data, Core Web Vitals, organic attribution and video SEO.",
    "P2+: authority/distribution integrations and optional external intelligence providers.",
  ],
} as const;

function severityFor(check: SeoCheck): SeoFindingSeverity {
  if (check.status === "fail" && (check.id === "homepage.http" || check.id === "robots.http" || check.id === "homepage.canonical")) return "critical";
  if (check.status === "fail") return "high";
  if (check.status === "warning") return "medium";
  if (check.status === "unavailable") return "low";
  return "info";
}

function recommendationFor(check: SeoCheck) {
  switch (check.id) {
    case "homepage.http": return "Restore a successful canonical homepage response before lower-priority SEO work.";
    case "homepage.canonical": return "Verify the homepage canonical resolves to the intended canonical production URL; require approval before changing canonical logic.";
    case "robots.http": return "Review crawl directives and confirm production is not globally blocked; any robots.txt change requires human approval.";
    case "sitemap.http": return "Repair sitemap availability or XML shape, then re-check Google Search Console and Bing sitemap state.";
    case "homepage.title": return "Review the homepage title for clarity, uniqueness and search intent without changing positioning automatically.";
    case "homepage.description": return "Review the homepage description for useful search-result copy; treat length only as a heuristic, not a ranking rule.";
    case "homepage.jsonld": return "Validate whether Organization, WebSite or SoftwareApplication JSON-LD is appropriate, then implement through reviewed code changes.";
    case "indexnow.key": return "Restore IndexNow ownership verification before automated URL notifications continue.";
    default: return "Inspect the underlying evidence and create a reviewed SEO action if intervention is justified.";
  }
}

function authorityFor(check: SeoCheck): SeoActionAuthority {
  if (check.id === "indexnow.key") return "recommend";
  if (["homepage.canonical", "robots.http", "sitemap.http", "homepage.jsonld"].includes(check.id)) return "human_approval_required";
  return "recommend";
}

export function runSeoIntelligenceAgent(snapshot: SeoMonitoringSnapshot): SeoIntelligenceReport {
  const findings = snapshot.checks.filter((check) => check.status !== "pass").map<SeoFinding>((check) => ({
    id: `finding.${check.id}`,
    severity: severityFor(check),
    title: check.title,
    explanation: check.detail,
    recommendation: recommendationFor(check),
    authority: authorityFor(check),
    evidence: [check.url, check.metric == null ? null : String(check.metric)].filter((value): value is string => Boolean(value)),
  })).sort((a, b) => ["critical", "high", "medium", "low", "info"].indexOf(a.severity) - ["critical", "high", "medium", "low", "info"].indexOf(b.severity));

  const serious = findings.filter((item) => item.severity === "critical" || item.severity === "high").length;
  const summary = findings.length === 0 ? `Technical baseline passed all ${snapshot.checks.length} monitored checks.` : `${findings.length} item${findings.length === 1 ? "" : "s"} need attention; ${serious} are high or critical priority.`;
  return { version: "seo-intelligence-v1", generatedAt: new Date().toISOString(), site: snapshot.site, healthScore: snapshot.score, summary, findings, knowledgeVersion: SEO_INTELLIGENCE_KNOWLEDGE.version, guardrails: [
    "Read and recommend are allowed without approval.",
    "Low-risk execution must use the governed integration/execution layer.",
    "Canonical, robots, redirects, sitemap logic and structured-data mutations require human approval.",
    "Do not infer search-engine indexing, ranking impact or causality without corresponding provider evidence.",
  ] };
}

function commonSystemInstructions(knowledge: string) {
  return `You are RYTHM's SEO Intelligence Agent. Use only supplied monitoring evidence and provider evidence. Never invent indexing, ranking, traffic, Core Web Vitals or causal claims. Separate facts from hypotheses. Prefer quantitative trend analysis over generic prose. Do not execute changes. High-risk SEO changes require human approval. Knowledge and operating policy:\n${knowledge}`;
}

function evidencePayload(input: {
  snapshot: SeoMonitoringSnapshot;
  deterministicReport: SeoIntelligenceReport;
  providerEvidence?: SeoProviderEvidence | null;
}) {
  return `Monitoring snapshot:\n${JSON.stringify(input.snapshot)}\n\nDeterministic report:\n${JSON.stringify(input.deterministicReport)}\n\nProvider evidence:\n${JSON.stringify(input.providerEvidence ?? null)}`;
}

export async function runSeoAiReasoning(input: {
  organizationId: string;
  actorUserId: string;
  snapshot: SeoMonitoringSnapshot;
  deterministicReport: SeoIntelligenceReport;
  providerEvidence?: SeoProviderEvidence | null;
}): Promise<SeoAiReasoning> {
  const knowledge = [...SEO_INTELLIGENCE_KNOWLEDGE.objectives, ...SEO_INTELLIGENCE_KNOWLEDGE.architecture, ...SEO_INTELLIGENCE_KNOWLEDGE.priorities, ...input.deterministicReport.guardrails].map((item) => `- ${item}`).join("\n");
  const baseRequest = {
    organizationId: input.organizationId,
    actor: { type: "user" as const, userId: input.actorUserId },
    feature: "internal.unspecified" as const,
    mode: "task" as const,
    telemetryPolicy: "required" as const,
    conversationLanguage: "en",
    systemInstructions: commonSystemInstructions(knowledge),
  };

  try {
    const response = await executeAiRequest({
      ...baseRequest,
      maxOutputTokens: 1100,
      prompt: `Analyze the technical snapshot plus Google Search Console/Bing evidence. Return a compact operational analysis optimized for a visual dashboard: (1) 3-5 quantified highlights, (2) anomalies or risks, (3) likely explanations explicitly marked as hypotheses, (4) prioritized actions with approval level, and (5) evidence gaps. Compare recent movement when daily data supports it; do not claim a trend from insufficient data.\n\n${evidencePayload(input)}`,
    });
    return { outputText: response.outputText, correlationId: response.correlationId, routingMode: response.routingMode, model: response.routingDecision.selectedModel };
  } catch (error) {
    const normalized = normalizeAiGatewayError(error);
    if (!normalized.retryable) throw error;

    const response = await executeAiRequest({
      ...baseRequest,
      maxOutputTokens: 700,
      prompt: `Evidence-only SEO summary. Do not request or use tools. Do not perform workflow coordination. Based strictly on the supplied snapshot and provider evidence, return: three concise quantitative observations where supported, up to three risks, and up to three recommended next actions. Label every unsupported explanation as a hypothesis. If evidence is insufficient, say so.\n\n${evidencePayload(input)}`,
    });
    return { outputText: response.outputText, correlationId: response.correlationId, routingMode: response.routingMode, model: response.routingDecision.selectedModel };
  }
}
