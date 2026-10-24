/** Browser-safe intake contract. Classification is a suggestion, never a business fact. */
export type ProjectIntakeSuggestion = {
  title: string;
  objective: string;
  summary: string;
  category: string;
  capabilities: string[];
  resources: Array<"website" | "github" | "drive" | "figma">;
  source: "ai" | "fallback";
};

const intakeProfiles = [
  { match: /(?:website|web site|application|app).*?(?:redesign|design|ui|ux)|(?:redesign|ui|ux).*?(?:website|application|app)/i, title: "Website UI/UX Audit & Redesign Recommendations", category: "experience_design", capabilities: ["requirements engineering", "user experience", "solution architecture", "quality assurance"], resources: ["website", "github", "figma"] as const },
  { match: /(?:website|web site).*?(?:audit|review)|(?:audit|review).*?(?:website|web site)/i, title: "Website Experience Audit", category: "website_audit", capabilities: ["user experience", "research", "quality assurance"], resources: ["website", "figma"] as const },
  { match: /(?:customer acquisition|growth|advertis|marketing|campaign|restaurant)/i, title: "Customer Growth Discovery & Strategy", category: "business_growth", capabilities: ["business analysis", "strategy", "analytics", "market research"], resources: ["website", "drive"] as const },
  { match: /(?:software|application|app|saas|develop|repository)/i, title: "Application Discovery & Delivery", category: "software_delivery", capabilities: ["requirements engineering", "solution architecture", "engineering", "security", "quality assurance"], resources: ["github", "website", "figma"] as const },
  { match: /(?:report|analysis|dataset|spreadsheet)/i, title: "Business Reporting & Analysis", category: "reporting", capabilities: ["analytics", "business analysis"], resources: ["drive"] as const },
];

export function suggestProjectIntake(description: string): ProjectIntakeSuggestion {
  const objective = description.trim().slice(0, 5000);
  const profile = intakeProfiles.find(item => item.match.test(objective));
  const words = objective.replace(/^(?:please\s+)?(?:i (?:want|need)(?: you)? to\s+|help me\s+|can you\s+)/i, "").replace(/[.!?\n][\s\S]*$/, "").split(/\s+/).filter(Boolean);
  const fallbackTitle = words.slice(0, 7).join(" ").slice(0, 100);
  return {
    title: profile?.title ?? (fallbackTitle.length >= 3 ? fallbackTitle[0].toUpperCase() + fallbackTitle.slice(1) : "New Business Project"),
    objective,
    summary: objective.length > 220 ? `${objective.slice(0, 217)}…` : objective,
    category: profile?.category ?? "business_project",
    capabilities: profile?.capabilities ?? ["business analysis", "project planning"],
    resources: profile ? [...profile.resources] : ["drive"],
    source: "fallback",
  };
}

export function validateIntakeSuggestion(value: unknown, fallback: ProjectIntakeSuggestion): ProjectIntakeSuggestion {
  if (!value || typeof value !== "object") return fallback;
  const row = value as Record<string, unknown>;
  if (typeof row.title !== "string" || row.title.trim().length < 3 || row.title.length > 120 || /[\r\n]/.test(row.title)) return fallback;
  return { ...fallback, title: row.title.trim(), objective: typeof row.objective === "string" && row.objective.trim() ? row.objective.trim().slice(0, 5000) : fallback.objective, summary: typeof row.summary === "string" ? row.summary.slice(0, 500) : fallback.summary, category: fallback.category, capabilities: fallback.capabilities, source: "ai" };
}

/** Submitted references are unverified. No server-side fetching occurs during intake. */
export function validateProjectResourceUrl(value: string): boolean {
  if (!value) return true;
  try {
    const url = new URL(value);
    return ["https:", "http:"].includes(url.protocol) && !url.username && !url.password && !/^(localhost|127\.|0\.|10\.|192\.168\.|169\.254\.|\[|.*\.local$)/i.test(url.hostname) && !/^172\.(1[6-9]|2\d|3[01])\./.test(url.hostname);
  } catch { return false; }
}
