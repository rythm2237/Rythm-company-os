import { randomUUID } from "node:crypto";
import { clampTier, getModelForTier, supportedReasoningLevel } from "@/lib/ai/model-registry";
import { DEFAULT_MODEL_POLICY, type AgentRoutingPolicy, type ModelPolicy, type ModelTier, type OperationType, type RequestIntelligence, type RiskLevel, type RoutingDecision, type RoutingReasonCode, type TaskComplexity, type TenantAiPolicy } from "@/lib/ai/routing-types";

const LANGUAGE_NAMES: Record<string, string> = { en: "English", fa: "Persian", ar: "Arabic", hu: "Hungarian", de: "German", fr: "French", es: "Spanish", it: "Italian", tr: "Turkish" };

function normalizeLanguage(value?: string | null) {
  if (!value?.trim()) return null;
  const lower = value.trim().toLowerCase();
  const byCode = Object.keys(LANGUAGE_NAMES).find((code) => lower === code || lower.startsWith(`${code}-`));
  if (byCode) return byCode;
  const byName = Object.entries(LANGUAGE_NAMES).find(([, name]) => lower === name.toLowerCase());
  return byName?.[0] ?? lower.slice(0, 16);
}

function lexiconLanguageClassifier(text: string) {
  const normalized = text.normalize("NFKC").toLowerCase();
  const scores: Record<string, number> = { en: 0, fa: 0, ar: 0, hu: 0, de: 0, fr: 0 };
  const lexicons: Record<string, string[]> = {
    fa: ["این", "اون", "برای", "که", "میخوام", "می‌خوام", "میشه", "می‌شود", "باید", "رو", "را", "با", "از", "تو", "اگر", "چطور", "لطفا", "لطفاً", "انجام", "بررسی"],
    ar: ["هذا", "هذه", "التي", "الذي", "من", "إلى", "على", "هل", "كيف", "ماذا", "يرجى", "يمكن", "يجب", "مع"],
    hu: ["hogy", "vagy", "nem", "egy", "van", "lesz", "kell", "szeretnék", "kérem", "holnap", "miért", "hogyan"],
    de: ["und", "oder", "nicht", "ich", "bitte", "kann", "möchte", "morgen", "warum", "wie", "mit"],
    fr: ["et", "ou", "pas", "je", "vous", "peux", "voudrais", "demain", "pourquoi", "comment", "avec"],
    en: ["the", "and", "or", "not", "please", "can", "should", "how", "why", "with", "review", "check"],
  };
  for (const [language, words] of Object.entries(lexicons)) {
    for (const word of words) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "iu").test(normalized)) scores[language] += 1;
    }
  }
  const ranked = Object.entries(scores).sort((a, b) => b[1] - a[1]);
  return ranked[0][1] > 0 && ranked[0][1] > ranked[1][1] ? ranked[0][0] : null;
}

function detectMessageLanguage(text: string) {
  const sample = text.normalize("NFKC").slice(0, 4000);
  if (!sample.trim()) return "en";
  const arabicScript = (sample.match(/[\u0600-\u06FF]/g) ?? []).length;
  const persianSpecific = (sample.match(/[پچژگک‌یۀ]/g) ?? []).length;
  if (arabicScript > 0) {
    const classified = lexiconLanguageClassifier(sample);
    if (classified === "fa" || classified === "ar") return classified;
    if (persianSpecific > 0) return "fa";
    return "fa";
  }
  return lexiconLanguageClassifier(sample) ?? "en";
}

function explicitLanguageFromPrompt(text: string) {
  const patterns: Array<[RegExp, string]> = [
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?persian\b|به فارسی (?:جواب|پاسخ)/i, "fa"],
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?english\b|به انگلیسی (?:جواب|پاسخ)/i, "en"],
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?german\b|به آلمانی (?:جواب|پاسخ)/i, "de"],
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?hungarian\b|به مجاری (?:جواب|پاسخ)/i, "hu"],
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?french\b|به فرانسوی (?:جواب|پاسخ)/i, "fr"],
  ];
  return patterns.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function inferOperation(text: string): OperationType {
  const p = text.toLowerCase();
  if (/\b(delete|remove permanently|erase|trash)\b|حذف کن|پاک کن/i.test(p)) return "delete";
  if (/\b(send|cancel|book|purchase|publish|deploy|merge|invite|email|message|transfer|pay)\b|ارسال کن|لغو کن|رزرو کن|منتشر کن|مرج کن|پرداخت کن/i.test(p)) return "external_action";
  if (/\b(update|edit|change|create|insert|save|write to)\b|تغییر بده|ویرایش کن|بساز|ذخیره کن/i.test(p)) return "write";
  if (/\b(recommend|suggest|should i|advise)\b|پیشنهاد|توصیه|بهتره/i.test(p)) return "recommend";
  if (/\b(analy[sz]e|compare|evaluate|diagnose|investigate|forecast)\b|تحلیل|مقایسه|بررسی عمیق|پیش.?بینی/i.test(p)) return "analyze";
  return "read";
}

function inferRisk(text: string, operation: OperationType): RiskLevel {
  const p = text.toLowerCase();
  if (/password|secret key|api key|credential|weapon|self-harm|suicide|malware|exploit|حذف دائمی|رمز عبور|کلید api/i.test(p)) return "restricted";
  if (/termination|terminate employee|fire employee|legal advice|medical diagnosis|security incident|bank transfer|contract signature|اخراج کارمند|مشاوره حقوقی|تشخیص پزشکی|انتقال وجه/i.test(p)) return "high";
  if (operation === "delete" || operation === "external_action") return "high";
  if (operation === "write" || /financial|finance|hr|privacy|personal data|حقوقی|مالی|منابع انسانی|حریم خصوصی/i.test(p)) return "medium";
  return "low";
}

function inferTools(text: string, allowedTools: string[] = []) {
  const wanted: string[] = [];
  const map: Array<[RegExp, string]> = [
    [/database|sql|record|table|دیتابیس|پایگاه داده/i, "company_database"],
    [/email|mail|ایمیل/i, "email"],
    [/calendar|meeting|جلسه|تقویم/i, "calendar"],
    [/file|document|attachment|spreadsheet|excel|فایل|سند|اکسل/i, "files"],
    [/project|پروژه/i, "projects"],
  ];
  for (const [pattern, tool] of map) if (pattern.test(text)) wanted.push(tool);
  return Array.from(new Set(wanted.filter((tool) => !allowedTools.length || allowedTools.includes(tool) || allowedTools.includes(tool.replace("company_", "")))));
}

function inferComplexity(text: string, operation: OperationType, tools: string[]): TaskComplexity {
  const words = text.trim().split(/\s+/).length;
  const highSignals = /architecture|root cause|multi[- ]?variable|end[- ]?to[- ]?end|strategy|migration|refactor|difficult debugging|معماری|استراتژی|ریشه.?یابی|چند.?متغیر/i.test(text);
  const mediumSignals = /analy[sz]e|compare|plan|recommend|synthesi[sz]e|workflow|document|تحلیل|مقایسه|برنامه|پیشنهاد|گردش کار/i.test(text);
  if (highSignals || tools.length >= 3 || words > 900) return "high";
  if (mediumSignals || tools.length >= 2 || words > 250 || operation === "recommend") return "medium";
  return "low";
}

function legacyIntelligence(input: { prompt: string; conversationLanguage?: string | null; agent?: AgentRoutingPolicy }): RequestIntelligence {
  const language = detectMessageLanguage(input.prompt);
  const responseLanguage = normalizeLanguage(explicitLanguageFromPrompt(input.prompt)) ?? normalizeLanguage(input.conversationLanguage) ?? normalizeLanguage(language) ?? normalizeLanguage(input.agent?.savedLanguage) ?? "en";
  const operation = inferOperation(input.prompt);
  const requiredTools = inferTools(input.prompt, input.agent?.allowedTools);
  const complexity = inferComplexity(input.prompt, operation, requiredTools);
  const risk = inferRisk(input.prompt, operation);
  const recommendedTier = complexity === "high" ? "sol" : complexity === "medium" ? "terra" : "luna";
  const reasoningRequirement = complexity === "high" ? "high" : complexity === "medium" ? "medium" : "low";
  const recommendedCapabilityTier = complexity === "high" ? "advanced_reasoning" : complexity === "medium" ? "standard" : "fast";
  const ambiguous = input.prompt.trim().length > 120 && !/classif|extract|format|summari[sz]e|rewrite|lookup|architecture|strategy|analy[sz]e|طبقه.?بندی|استخراج|فرمت|خلاصه|بازنویسی|معماری|استراتژی|تحلیل/i.test(input.prompt);
  const reasonCodes: RoutingReasonCode[] = [complexity === "high" ? "HIGH_COMPLEXITY" : complexity === "medium" ? "MEDIUM_COMPLEXITY" : "LOW_COMPLEXITY"];
  return {
    language,
    detectedLanguages: [language],
    responseLanguage,
    intent: operation === "external_action" || operation === "delete" ? "high_impact_action" : operation === "analyze" ? "analysis" : operation === "recommend" ? "decision_support" : "information",
    intentTaxonomyVersion: "legacy-intents-v1",
    taskType: operation,
    operation,
    complexity,
    risk,
    reasoningRequirement,
    reasoningDepth: complexity === "high" ? "deep" : complexity === "medium" ? "standard" : "minimal",
    requiredTools,
    unavailableTools: [],
    requiredCapabilities: complexity === "high" ? ["reasoning", "analysis"] : complexity === "medium" ? ["analysis"] : [],
    requiredModalities: ["text"],
    contextRequirements: [],
    estimatedInputTokens: Math.ceil(input.prompt.length / 4),
    latencyPreference: "normal",
    authorizationSignal: requiredTools.length ? "unknown" : "not_required",
    humanReviewRequired: risk === "high" || risk === "restricted",
    recommendedCapabilityTier,
    recommendedTier,
    reasonCodes,
    reasonSummary: "legacy routing compatibility",
    confidence: ambiguous ? 0.72 : 0.94,
    allowEscalation: risk !== "restricted",
    classificationSource: ambiguous ? "classifier" : "deterministic",
    classifierVersion: "request-intelligence-v1-compat",
  };
}

function mergePolicy(agent?: AgentRoutingPolicy, tenant?: TenantAiPolicy): ModelPolicy {
  return { ...DEFAULT_MODEL_POLICY, ...(tenant?.costStrategy ? { costStrategy: tenant.costStrategy } : {}), ...(agent?.modelPolicy ?? {}) };
}

function estimateCost(capability: ReturnType<typeof getModelForTier>, inputChars: number, maxOutputTokens = 1200) {
  if (!capability || capability.inputCostPerMillionUsd == null || capability.outputCostPerMillionUsd == null) return null;
  return (Math.ceil(inputChars / 4) / 1_000_000) * capability.inputCostPerMillionUsd + (maxOutputTokens / 1_000_000) * capability.outputCostPerMillionUsd;
}

function applyCostStrategy(tier: ModelTier, policy: ModelPolicy, risk: RiskLevel, complexity: TaskComplexity) {
  if (risk === "high" || risk === "restricted" || complexity === "high") return tier;
  if (policy.costStrategy === "quality" && tier === "luna") return "terra";
  if (policy.costStrategy === "economy" && tier === "sol") return "terra";
  return tier;
}

function decision(input: { intelligence: RequestIntelligence; requestId: string; capability: NonNullable<ReturnType<typeof getModelForTier>>; estimatedCostUsd: number | null; escalationIndex: number; fixed?: boolean }): RoutingDecision {
  return {
    ...input.intelligence,
    reasonCodes: input.fixed ? [...input.intelligence.reasonCodes, "FIXED_MODEL_EXCEPTION"] : input.intelligence.reasonCodes,
    requestId: input.requestId,
    selectedCapabilityTier: input.fixed ? input.intelligence.recommendedCapabilityTier : input.capability.capabilityTiers[0] ?? input.intelligence.recommendedCapabilityTier,
    selectedTier: input.capability.tier,
    selectedProvider: input.capability.provider,
    selectedModel: input.capability.model,
    reasoningLevel: supportedReasoningLevel(input.capability, input.intelligence.reasoningRequirement),
    estimatedCostUsd: input.estimatedCostUsd,
    estimatedLatencyMs: input.capability.estimatedLatencyMs ?? null,
    escalationIndex: input.escalationIndex,
    escalationReasons: [],
    routingVersion: "adaptive-v1-compat",
    policyVersion: "adaptive-policy-v1-compat",
    modelRegistryVersion: "legacy-model-registry-v1-compat",
  };
}

/** Existing Production behavior retained until each caller passes Phase 1D. */
export function routeLegacyRequest(input: { prompt: string; requestId?: string; requestType?: string; conversationLanguage?: string | null; attachments?: Array<{ mimeType: string }>; contextCharacterCount?: number | null; agent?: AgentRoutingPolicy; tenant?: TenantAiPolicy; escalationIndex?: number; forcedTier?: ModelTier }): RoutingDecision {
  const intelligence = legacyIntelligence(input);
  const policy = mergePolicy(input.agent, input.tenant);
  const requestId = input.requestId ?? randomUUID();
  if (intelligence.risk === "restricted") throw new Error("RYTHM routing blocked this request because it requires restricted handling.");
  if (policy.mode === "fixed" && policy.fixedModel && policy.fixedProvider) {
    const base = getModelForTier(policy.preferredTier ?? "terra", input.tenant?.allowedTiers);
    if (!base) throw new Error("No configured RYTHM model tier is available for this request.");
    return decision({ intelligence, requestId, capability: { ...base, provider: policy.fixedProvider, model: policy.fixedModel }, estimatedCostUsd: null, escalationIndex: input.escalationIndex ?? 0, fixed: true });
  }
  let tier = input.forcedTier ?? intelligence.recommendedTier;
  tier = applyCostStrategy(tier, policy, intelligence.risk, intelligence.complexity);
  tier = clampTier(tier, policy.minimumTier, policy.maximumTier);
  if (input.tenant?.advancedReasoningAllowed === false && intelligence.reasoningRequirement === "high" && tier === "sol") tier = clampTier("terra", policy.minimumTier, policy.maximumTier);
  const capability = getModelForTier(tier, input.tenant?.allowedTiers);
  if (!capability) throw new Error("No configured RYTHM model tier is available for this request.");
  const maxTokens = policy.maxTokens ?? 3200;
  const estimatedCostUsd = estimateCost(capability, input.prompt.length, Math.min(maxTokens, 3200));
  if (policy.maxCostPerRequest != null && estimatedCostUsd != null && estimatedCostUsd > policy.maxCostPerRequest) {
    const cheaper = getModelForTier("luna", input.tenant?.allowedTiers);
    if (!cheaper || intelligence.complexity === "high" || intelligence.risk === "high") throw new Error("AI request exceeds the configured per-request budget.");
    return decision({ intelligence, requestId, capability: cheaper, estimatedCostUsd: estimateCost(cheaper, input.prompt.length, Math.min(maxTokens, 3200)), escalationIndex: input.escalationIndex ?? 0 });
  }
  return decision({ intelligence, requestId, capability, estimatedCostUsd, escalationIndex: input.escalationIndex ?? 0 });
}
