import { evaluateCanonicalPermission, type CanonicalActionClass } from "@/lib/security/permissions";
import type {
  AgentRoutingPolicy,
  CapabilityTier,
  ContextRequirement,
  IntentClass,
  LanguageSignals,
  LatencyPreference,
  OperationType,
  ReasoningDepth,
  RequestIntelligence,
  RiskLevel,
  RoutingReasonCode,
  TaskComplexity,
  TenantAiPolicy,
} from "@/lib/ai/routing-types";

export const REQUEST_INTELLIGENCE_VERSION = "request-intelligence-v2.1.0";
export const INTENT_TAXONOMY_VERSION = "rythm-intents-v1";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", fa: "Persian", ar: "Arabic", ja: "Japanese", hu: "Hungarian", de: "German", fr: "French", es: "Spanish", it: "Italian", tr: "Turkish",
};

const LATIN_LEXICONS: Record<string, string[]> = {
  en: ["the", "and", "please", "should", "how", "why", "with", "review", "summarize", "write", "plan"],
  de: ["der", "die", "das", "und", "nicht", "ich", "bitte", "kann", "möchte", "warum", "wie", "zusammenfassen"],
  fr: ["le", "la", "les", "et", "pas", "je", "vous", "peux", "voudrais", "pourquoi", "comment", "résumer"],
  hu: ["hogy", "vagy", "nem", "egy", "van", "lesz", "kell", "szeretnék", "kérem", "hogyan"],
};

export function normalizeLanguage(value?: string | null) {
  if (!value?.trim()) return null;
  const lower = value.trim().toLowerCase();
  const byCode = Object.keys(LANGUAGE_NAMES).find((code) => lower === code || lower.startsWith(`${code}-`));
  if (byCode) return byCode;
  const byName = Object.entries(LANGUAGE_NAMES).find(([, name]) => lower === name.toLowerCase());
  return byName?.[0] ?? lower.slice(0, 16);
}

function countLetters(text: string, expression: RegExp) {
  return (text.match(expression) ?? []).length;
}

function lexiconScores(text: string) {
  const normalized = text.normalize("NFKC").toLowerCase();
  const scores: Record<string, number> = { en: 0, fa: 0, ar: 0, hu: 0, de: 0, fr: 0, ja: 0 };
  const script = {
    arabic: countLetters(normalized, /[\u0600-\u06ff]/g),
    persian: countLetters(normalized, /[پچژگک‌یۀ]/g),
    latin: countLetters(normalized, /[a-zà-ÿ]/g),
    japanese: countLetters(normalized, /[\u3040-\u30ff]/g),
  };
  if (script.japanese) scores.ja += 10 + script.japanese / 8;
  if (script.arabic) scores[script.persian ? "fa" : "ar"] += 8 + script.arabic / 20;
  if (/[éèêëàâçîïôùûüÿœ]/i.test(normalized)) scores.fr += 4;
  if (/[äöüß]/i.test(normalized)) scores.de += 4;
  for (const [language, words] of Object.entries(LATIN_LEXICONS)) {
    for (const word of words) {
      const escaped = word.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
      if (new RegExp(`(^|[^\\p{L}])${escaped}([^\\p{L}]|$)`, "iu").test(normalized)) scores[language] += 1;
    }
  }
  if (script.latin && Math.max(scores.en, scores.de, scores.fr, scores.hu) === 0) scores.en += 1;
  return { scores, script };
}

export function detectRequestLanguages(text: string) {
  const sample = text.normalize("NFKC").slice(0, 12000);
  if (!sample.trim()) return { primary: "en", detected: ["en"], mixed: false, confidence: 0.5 };
  const { scores, script } = lexiconScores(sample);
  const ranked = Object.entries(scores).filter(([, score]) => score > 0).sort((a, b) => b[1] - a[1]);
  const primary = ranked[0]?.[0] ?? "en";
  const detected = [primary];
  const hasArabicAndLatin = script.arabic >= 2 && script.latin >= 4;
  if (hasArabicAndLatin) {
    const secondary = primary === "fa" || primary === "ar" ? "en" : script.persian ? "fa" : "ar";
    if (!detected.includes(secondary)) detected.push(secondary);
  }
  const mixed = detected.length > 1;
  const lead = ranked[0]?.[1] ?? 1;
  const next = ranked[1]?.[1] ?? 0;
  const confidence = mixed ? 0.86 : Math.min(0.99, Math.max(0.62, lead / Math.max(lead + next, 1)));
  return { primary, detected, mixed, confidence };
}

export function detectMessageLanguage(text: string) {
  return detectRequestLanguages(text).primary;
}

export function resolveResponseLanguage(signals: LanguageSignals) {
  return normalizeLanguage(signals.explicitLanguage)
    ?? normalizeLanguage(signals.messageLanguage)
    ?? normalizeLanguage(signals.conversationLanguage)
    ?? normalizeLanguage(signals.savedLanguage)
    ?? normalizeLanguage(signals.systemDefault)
    ?? "en";
}

function explicitLanguageFromPrompt(text: string) {
  const patterns: Array<[RegExp, string]> = [
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?persian\b|به فارسی (?:جواب|پاسخ|بنویس)/i, "fa"],
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?english\b|به انگلیسی (?:جواب|پاسخ|بنویس)/i, "en"],
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?german\b|به آلمانی (?:جواب|پاسخ|بنویس)/i, "de"],
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?french\b|به فرانسوی (?:جواب|پاسخ|بنویس)/i, "fr"],
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?japanese\b|به ژاپنی (?:جواب|پاسخ|بنویس)/i, "ja"],
    [/\b(?:reply|respond|answer|write)\s+(?:in\s+)?hungarian\b|به مجاری (?:جواب|پاسخ|بنویس)/i, "hu"],
  ];
  return patterns.find(([pattern]) => pattern.test(text))?.[1] ?? null;
}

function inferOperation(text: string): OperationType {
  const p = text.normalize("NFKC").toLowerCase();
  if (/\b(delete|erase|destroy|drop|purge|remove permanently)\b|حذف(?: دائمی)? کن|پاک کن|از بین ببر/i.test(p)) return "delete";
  if (/\b(send|publish|deploy|merge|invite|book|cancel|purchase|transfer|pay|sign|submit)\b|ارسال کن|منتشر کن|دیپلوی کن|مرج کن|دعوت کن|رزرو کن|لغو کن|پرداخت کن|امضا کن/i.test(p)) return "external_action";
  if (/\b(?:create|insert|update|edit|change|save)\s+(?:the\s+)?(?:record|database|table|account|setting|project|task)\b|(?:رکورد|دیتابیس|جدول|حساب|تنظیمات|پروژه|تسک) را (?:بساز|تغییر|ویرایش|ذخیره)/i.test(p)) return "write";
  if (/\b(recommend|suggest|should (?:i|we)|advise|choose between)\b|پیشنهاد|توصیه|بهتره|انتخاب کنیم/i.test(p)) return "recommend";
  if (/\b(analy[sz]e|compare|evaluate|diagnose|investigate|forecast|review)\b|تحلیل|مقایسه|ارزیابی|بررسی عمیق|پیش.?بینی/i.test(p)) return "analyze";
  return "read";
}

function inferIntent(text: string, operation: OperationType): IntentClass {
  const p = text.toLowerCase();
  if (operation === "delete" || operation === "external_action") return "high_impact_action";
  if (/boardroom|deliberat|executive meeting|جلسه هیئت|جلسه مدیران|اتاق هیئت/i.test(p)) return "meeting_deliberation";
  if (/coordinate|handoff|workflow|assign .* to|cross[- ]department|هماهنگ|گردش کار|تحویل بین|بین.?دپارتمان/i.test(p)) return "workflow_coordination";
  if (/\b(run|execute|use|call|query)\b.*\b(tool|api|database|calendar|email|github)\b|از ابزار|با api|در تقویم|در دیتابیس/i.test(p)) return "tool_execution";
  if (/\b(code|function|class|typescript|javascript|python|sql|debug|bug|stack trace|api endpoint|architecture review)\b|کد|دیباگ|باگ|تایپ.?اسکریپت|پایتون/i.test(p)) return "coding";
  if (/\b(summari[sz]e|tl;dr|executive summary|condense)\b|خلاصه/i.test(p)) return "summarization";
  if (/\b(rewrite|translate|reformat|convert|extract|classify)\b|بازنویسی|ترجمه|تبدیل|استخراج|طبقه.?بندی/i.test(p)) return "transformation";
  if (/\b(plan|roadmap|strategy|milestone|go-to-market)\b|برنامه|نقشه راه|استراتژی/i.test(p)) return "planning";
  if (operation === "recommend") return "decision_support";
  if (operation === "analyze") return "analysis";
  if (/\b(draft|write|compose|generate|create copy)\b|پیش.?نویس|متن بنویس|تولید کن/i.test(p)) return "drafting";
  if (/\b(search|find|retrieve|look up|company knowledge|memory)\b|جستجو|پیدا کن|دانش شرکت|حافظه شرکت/i.test(p)) return "knowledge_retrieval";
  return "information";
}

function inferTools(text: string) {
  const p = text.toLowerCase();
  const wanted: string[] = [];
  const map: Array<[RegExp, string]> = [
    [/database|\bsql\b|record|table|دیتابیس|پایگاه داده|جدول/i, "company_database"],
    [/gmail|outlook|mailbox|\b(?:send|read|search|find|reply to|forward)\b.{0,24}\b(?:email|mail)\b|\b(?:email|mail)\b.{0,24}\b(?:send|read|search|find|reply|forward)\b|جیمیل|ایمیل را (?:ارسال|بخوان|جستجو)/i, "email"],
    [/calendar|schedule (?:a |the )?meeting|تقویم|زمان.?بندی جلسه/i, "calendar"],
    [/github|pull request|repository|commit|گیت.?هاب|پول ریکوئست/i, "github"],
    [/file|document|attachment|spreadsheet|excel|فایل|سند|پیوست|اکسل/i, "files"],
    [/project|task|پروژه|تسک|وظیفه/i, "projects"],
  ];
  for (const [pattern, tool] of map) if (pattern.test(p)) wanted.push(tool);
  return Array.from(new Set(wanted));
}

function inferModalities(text: string, attachments: Array<{ mimeType: string }> = []) {
  const modalities = new Set<"text" | "image" | "file" | "audio">(["text"]);
  for (const attachment of attachments) {
    if (attachment.mimeType.startsWith("image/")) modalities.add("image");
    else if (attachment.mimeType.startsWith("audio/")) modalities.add("audio");
    else modalities.add("file");
  }
  if (/inspect (?:this|the) image|analy[sz]e (?:this|the) image|image attachment|تصویر (?:پیوست|ضمیمه)|این عکس/i.test(text)) modalities.add("image");
  if (/listen to|transcribe (?:this|the) audio|فایل صوتی|صدا را/i.test(text)) modalities.add("audio");
  return [...modalities];
}

function inferContextRequirements(text: string, requestType?: string): ContextRequirement[] {
  const p = text.toLowerCase();
  const result = new Set<ContextRequirement>();
  if (/earlier|previous|conversation|we discussed|قبلاً|گفتگو|صحبت کردیم/i.test(p)) result.add("conversation");
  if (/company|organization|business|شرکت|سازمان|کسب.?و.?کار/i.test(p)) result.add("company");
  if (/project|milestone|task|پروژه|تسک|وظیفه/i.test(p)) result.add("project");
  if (/boardroom|meeting|decision record|جلسه|تصمیم هیئت/i.test(p) || requestType?.startsWith("boardroom.")) result.add("boardroom");
  if (/knowledge|policy|procedure|customer record|memory|دانش|سیاست|رویه|حافظه/i.test(p)) result.add("company_knowledge");
  if (/my role|agent role|your role|نقش تو|نقش عامل/i.test(p)) result.add("agent");
  return [...result];
}

function inferRisk(text: string, operation: OperationType): RiskLevel {
  const p = text.toLowerCase();
  if (/\b(?:reveal|show|dump|steal|exfiltrate)\b.{0,30}\b(?:password|api key|access token|refresh token|credential|secret)\b|ساخت بدافزار|سرقت رمز|نمایش کلید api/i.test(p)) return "restricted";
  if (/\b(?:wire|bank transfer|pay|purchase|sign (?:the )?contract|terminate employee|fire employee|delete production|drop database|publish publicly|change admin|grant privileged)\b|انتقال وجه|پرداخت کن|امضای قرارداد|اخراج کارمند|حذف پروداکشن|انتشار عمومی|دسترسی ادمین/i.test(p)) return "high";
  if (operation === "delete" || operation === "external_action") return "high";
  if (operation === "write" || /\b(?:legal|financial|medical|privacy|personal data|security incident|hr)\b|حقوقی|مالی|پزشکی|حریم خصوصی|داده شخصی|امنیتی|منابع انسانی/i.test(p)) return "medium";
  return "low";
}

function complexityClassification(text: string, intent: IntentClass, tools: string[], contexts: ContextRequirement[]) {
  const p = text.toLowerCase();
  let score = 0;
  const reasons: string[] = [];
  if (/architecture|root cause|multi[- ](?:step|constraint|variable)|end[- ]to[- ]end|migration strategy|threat model|معماری|ریشه.?یابی|چند.?مرحله|چند.?محدودیت/i.test(p)) { score += 3; reasons.push("multi_step_synthesis"); }
  if (/cross[- ]functional|cross[- ]department|finance.*legal|marketing.*operations|بین.?دپارتمان|مالی.*حقوقی/i.test(p)) { score += 2; reasons.push("cross_department"); }
  if (/ambiguous|trade-?off|scenario|assumption|uncertain|ابهام|سناریو|فرض|مصالحه/i.test(p)) { score += 1; reasons.push("ambiguity_or_tradeoff"); }
  if (intent === "planning" || intent === "decision_support" || intent === "meeting_deliberation") { score += 2; reasons.push("planning_or_deliberation"); }
  if (intent === "coding" && /debug|architecture|security|concurrency|distributed|دیباگ|معماری|امنیت|همزمانی/i.test(p)) { score += 2; reasons.push("technical_depth"); }
  if (tools.length >= 2) { score += 1; reasons.push("multiple_tool_dependencies"); }
  if (contexts.length >= 3) { score += 1; reasons.push("broad_context_synthesis"); }
  const explicitConstraints = (text.match(/(?:^|\n)\s*(?:[-*]|\d+[.)])\s+/gm) ?? []).length;
  if (explicitConstraints >= 4) { score += 2; reasons.push("many_constraints"); }
  else if (explicitConstraints >= 2) { score += 1; reasons.push("multiple_constraints"); }
  const words = text.trim().split(/\s+/).filter(Boolean).length;
  if (words > 900 && score > 0) { score += 1; reasons.push("large_input_with_other_complexity"); }
  const complexity: TaskComplexity = score >= 5 ? "high" : score >= 2 ? "medium" : "low";
  return { complexity, score, reasons };
}

function reasoningFor(complexity: TaskComplexity, intent: IntentClass, risk: RiskLevel): { depth: ReasoningDepth; level: "low" | "medium" | "high" } {
  if (risk === "high" || risk === "restricted") return { depth: "expert", level: "high" };
  if (complexity === "high") return { depth: "deep", level: "high" };
  if (complexity === "medium" || intent === "analysis" || intent === "decision_support") return { depth: "standard", level: "medium" };
  return { depth: "minimal", level: "low" };
}

function canonicalAction(operation: OperationType): CanonicalActionClass | null {
  if (operation === "read" || operation === "analyze" || operation === "recommend") return "read";
  if (operation === "write") return "update";
  if (operation === "delete") return "delete";
  if (operation === "execute") return "privileged";
  if (operation === "external_action") return "external_communication";
  return null;
}

function authorizationSignal(operation: OperationType, tools: string[], agent: AgentRoutingPolicy | undefined, tenant: TenantAiPolicy | undefined) {
  if (!tools.length && operation === "read") return "not_required" as const;
  const action = canonicalAction(operation);
  if (!action || !agent?.permissions || !tenant?.userPermissions) return "unknown" as const;
  return evaluateCanonicalPermission(agent.permissions, action).allowed && evaluateCanonicalPermission(tenant.userPermissions, action).allowed
    ? "allowed" as const
    : "denied" as const;
}

function capabilityTier(input: { intent: IntentClass; complexity: TaskComplexity; risk: RiskLevel; modalities: string[]; reasoningDepth: ReasoningDepth; specialized: boolean }): CapabilityTier {
  if (input.risk === "high" || input.risk === "restricted") return "high_accuracy";
  if (input.modalities.some((item) => item !== "text")) return "multimodal";
  if (input.complexity === "high" || input.reasoningDepth === "deep" || input.reasoningDepth === "expert") return "advanced_reasoning";
  if (input.intent === "coding") return "coding";
  if (input.specialized) return "specialized";
  if (input.complexity === "medium") return "standard";
  return "fast";
}

function legacyTierFor(capability: CapabilityTier): "luna" | "terra" | "sol" {
  if (capability === "fast") return "luna";
  if (capability === "advanced_reasoning" || capability === "high_accuracy") return "sol";
  return "terra";
}

function conciseSummary(codes: RoutingReasonCode[]) {
  return codes.slice(0, 5).map((code) => code.toLowerCase().replaceAll("_", " ")).join("; ");
}

function governedBoardroomIntent(requestType?: string): IntentClass | null {
  if (!requestType?.startsWith("boardroom.")) return null;
  if (requestType === "boardroom.deliberation") return "meeting_deliberation";
  if (requestType === "boardroom.summary") return "summarization";
  return "analysis";
}

export function deterministicRequestIntelligence(input: {
  prompt: string;
  requestType?: string;
  conversationLanguage?: string | null;
  savedLanguage?: string | null;
  attachments?: Array<{ mimeType: string }>;
  contextCharacterCount?: number | null;
  latencyPreference?: LatencyPreference;
  agent?: AgentRoutingPolicy;
  tenant?: TenantAiPolicy;
}): RequestIntelligence {
  const language = detectRequestLanguages(input.prompt);
  const responseLanguage = resolveResponseLanguage({
    explicitLanguage: explicitLanguageFromPrompt(input.prompt),
    messageLanguage: language.primary,
    conversationLanguage: input.conversationLanguage,
    savedLanguage: input.savedLanguage ?? input.agent?.savedLanguage,
    systemDefault: "en",
  });
  const boardroomIntent = governedBoardroomIntent(input.requestType);
  const operation: OperationType = boardroomIntent ? "analyze" : inferOperation(input.prompt);
  const intent = boardroomIntent ?? inferIntent(input.prompt, operation);
  // Governed Boardroom features are advisory AI analysis. Transcript references to
  // files, GitHub, databases or external actions describe the subject matter; they
  // do not authorize or require tool execution. Tool use remains separately gated.
  const requiredTools = boardroomIntent ? [] : inferTools(input.prompt);
  const unavailableTools = requiredTools.filter((tool) => !(input.agent?.allowedTools ?? []).includes(tool));
  const requiredModalities = inferModalities(input.prompt, input.attachments);
  const contextRequirements = inferContextRequirements(input.prompt, input.requestType);
  const complexityResult = complexityClassification(input.prompt, intent, requiredTools, contextRequirements);
  const risk = inferRisk(input.prompt, operation);
  const reasoning = reasoningFor(complexityResult.complexity, intent, risk);
  const authSignal = authorizationSignal(operation, requiredTools, input.agent, input.tenant);
  const riskRank: Record<RiskLevel, number> = { low: 0, medium: 1, high: 2, restricted: 3 };
  const aboveAgentCeiling = input.agent?.riskCeiling ? riskRank[risk] > riskRank[input.agent.riskCeiling] : false;
  const reviewThreshold = input.tenant?.humanReviewRiskThreshold ?? "high";
  const policyRequiresReview = riskRank[risk] >= riskRank[reviewThreshold];
  const humanReviewRequired = policyRequiresReview || authSignal === "denied" || aboveAgentCeiling;
  const specialized = /\b(?:legal|medical|tax|regulatory|financial reporting)\b|حقوقی|پزشکی|مالیاتی|رگولاتوری/i.test(input.prompt);
  const recommendedCapabilityTier = capabilityTier({ intent, complexity: complexityResult.complexity, risk, modalities: requiredModalities, reasoningDepth: reasoning.depth, specialized });
  const latencyPreference = input.latencyPreference ?? (intent === "information" && complexityResult.complexity === "low" ? "interactive" : complexityResult.complexity === "high" ? "quality_preferred" : "normal");
  const reasonCodes: RoutingReasonCode[] = [];
  reasonCodes.push(language.mixed ? "MIXED_LANGUAGE" : "LANGUAGE_MATCH");
  reasonCodes.push(complexityResult.complexity === "high" ? "HIGH_COMPLEXITY" : complexityResult.complexity === "medium" ? "MEDIUM_COMPLEXITY" : "LOW_COMPLEXITY");
  if (reasoning.depth === "deep" || reasoning.depth === "expert") reasonCodes.push("ADVANCED_REASONING_REQUIRED");
  if (recommendedCapabilityTier === "high_accuracy") reasonCodes.push("HIGH_ACCURACY_REQUIRED");
  if (intent === "coding") reasonCodes.push("CODING_CAPABILITY_REQUIRED");
  if (requiredModalities.some((item) => item !== "text")) reasonCodes.push("MULTIMODAL_REQUIRED");
  if (requiredTools.length) reasonCodes.push("TOOL_CAPABILITY_REQUIRED");
  if (contextRequirements.includes("company")) reasonCodes.push("COMPANY_CONTEXT_REQUIRED");
  if (contextRequirements.includes("project")) reasonCodes.push("PROJECT_CONTEXT_REQUIRED");
  if (contextRequirements.includes("boardroom")) reasonCodes.push("BOARDROOM_CONTEXT_REQUIRED");
  if (contextRequirements.includes("company_knowledge")) reasonCodes.push("KNOWLEDGE_RETRIEVAL_REQUIRED");
  if (risk === "high") reasonCodes.push("HIGH_RISK");
  if (risk === "restricted") reasonCodes.push("RESTRICTED_RISK");
  if (humanReviewRequired) reasonCodes.push("HUMAN_REVIEW_REQUIRED");
  if (authSignal === "denied") reasonCodes.push("PERMISSION_DENIED");
  if (authSignal === "unknown" && requiredTools.length) reasonCodes.push("PERMISSION_UNKNOWN");
  if (unavailableTools.length) reasonCodes.push("TOOL_UNAVAILABLE");
  if (latencyPreference === "interactive") reasonCodes.push("LOW_LATENCY_PREFERRED");
  if (latencyPreference === "quality_preferred") reasonCodes.push("QUALITY_PREFERRED");
  const estimatedInputTokens = Math.ceil((input.prompt.length + Math.max(0, input.contextCharacterCount ?? 0)) / 4);
  const requiredCapabilities = Array.from(new Set([
    recommendedCapabilityTier,
    ...(requiredTools.length ? ["tools"] : []),
    ...requiredModalities.filter((item) => item !== "text").map((item) => `${item}_input`),
    ...(contextRequirements.length ? ["context_planning"] : []),
  ]));
  return {
    language: language.primary,
    detectedLanguages: language.detected,
    responseLanguage,
    intent,
    intentTaxonomyVersion: INTENT_TAXONOMY_VERSION,
    taskType: intent,
    operation,
    complexity: complexityResult.complexity,
    risk,
    reasoningRequirement: reasoning.level,
    reasoningDepth: reasoning.depth,
    requiredTools,
    unavailableTools,
    requiredCapabilities,
    requiredModalities,
    contextRequirements,
    estimatedInputTokens,
    latencyPreference,
    authorizationSignal: authSignal,
    humanReviewRequired,
    recommendedCapabilityTier,
    recommendedTier: legacyTierFor(recommendedCapabilityTier),
    reasonCodes: Array.from(new Set(reasonCodes)),
    reasonSummary: conciseSummary(reasonCodes),
    confidence: Math.min(language.confidence, complexityResult.score === 1 ? 0.82 : 0.94),
    allowEscalation: risk !== "restricted",
    classificationSource: "deterministic",
    classifierVersion: REQUEST_INTELLIGENCE_VERSION,
  };
}
