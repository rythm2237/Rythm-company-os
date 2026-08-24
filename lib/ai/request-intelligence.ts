import type { AgentRoutingPolicy, LanguageSignals, OperationType, RequestIntelligence, RiskLevel, TaskComplexity } from "@/lib/ai/routing-types";

const LANGUAGE_NAMES: Record<string, string> = {
  en: "English", fa: "Persian", ar: "Arabic", hu: "Hungarian", de: "German", fr: "French", es: "Spanish", it: "Italian", tr: "Turkish",
};

export function normalizeLanguage(value?: string | null) {
  if (!value?.trim()) return null;
  const lower = value.trim().toLowerCase();
  const byCode = Object.keys(LANGUAGE_NAMES).find((code) => lower === code || lower.startsWith(`${code}-`));
  if (byCode) return byCode;
  const byName = Object.entries(LANGUAGE_NAMES).find(([, name]) => lower === name.toLowerCase());
  return byName?.[0] ?? lower.slice(0, 16);
}

export function detectMessageLanguage(text: string) {
  const sample = text.replace(/[`*_#>\d\W]/g, "").slice(0, 2000);
  if (!sample) return "en";
  const persian = (sample.match(/[\u067E\u0686\u0698\u06AF\u06A9\u06CC\u06C0-\u06FF]/g) ?? []).length;
  const arabic = (sample.match(/[\u0600-\u06FF]/g) ?? []).length;
  if (persian >= 2 || (arabic / Math.max(1, sample.length)) > 0.18) return persian ? "fa" : "ar";
  const hungarianHints = /\b(hogy|vagy|nem|egy|van|lesz|kell|szeretnék|kérem|holnap)\b/i.test(text);
  if (hungarianHints) return "hu";
  const germanHints = /\b(und|oder|nicht|ich|bitte|kann|möchte|morgen|warum)\b/i.test(text);
  if (germanHints) return "de";
  const frenchHints = /\b(et|ou|pas|je|vous|peux|voudrais|demain|pourquoi)\b/i.test(text);
  if (frenchHints) return "fr";
  return "en";
}

export function resolveResponseLanguage(signals: LanguageSignals) {
  return normalizeLanguage(signals.explicitLanguage)
    ?? normalizeLanguage(signals.conversationLanguage)
    ?? normalizeLanguage(signals.messageLanguage)
    ?? normalizeLanguage(signals.savedLanguage)
    ?? normalizeLanguage(signals.systemDefault)
    ?? "en";
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

function inferRisk(text: string, operation: OperationType, agent?: AgentRoutingPolicy): RiskLevel {
  const p = text.toLowerCase();
  if (/password|secret key|api key|credential|weapon|self-harm|suicide|malware|exploit|حذف دائمی|رمز عبور|کلید api/i.test(p)) return "restricted";
  if (/termination|terminate employee|fire employee|legal advice|medical diagnosis|security incident|bank transfer|contract signature|اخراج کارمند|مشاوره حقوقی|تشخیص پزشکی|انتقال وجه/i.test(p)) return "high";
  if (operation === "delete" || operation === "external_action") return "high";
  if (operation === "write" || /financial|finance|hr|privacy|personal data|حقوقی|مالی|منابع انسانی|حریم خصوصی/i.test(p)) return "medium";
  return agent?.riskCeiling === "low" ? "low" : "low";
}

function inferComplexity(text: string, operation: OperationType, requiredTools: string[]): TaskComplexity {
  const words = text.trim().split(/\s+/).length;
  const highSignals = /architecture|root cause|multi[- ]?variable|end[- ]?to[- ]?end|strategy|migration|refactor|difficult debugging|معماری|استراتژی|ریشه.?یابی|چند.?متغیر/i.test(text);
  const mediumSignals = /analy[sz]e|compare|plan|recommend|synthesi[sz]e|workflow|document|تحلیل|مقایسه|برنامه|پیشنهاد|گردش کار/i.test(text);
  if (highSignals || requiredTools.length >= 3 || words > 900) return "high";
  if (mediumSignals || requiredTools.length >= 2 || words > 250 || operation === "recommend") return "medium";
  return "low";
}

function inferTools(text: string, allowedTools: string[] = []) {
  const p = text.toLowerCase();
  const wanted: string[] = [];
  const map: Array<[RegExp, string]> = [
    [/database|sql|record|table|دیتابیس|پایگاه داده/i, "company_database"],
    [/email|mail|ایمیل/i, "email"],
    [/calendar|meeting|جلسه|تقویم/i, "calendar"],
    [/file|document|attachment|spreadsheet|excel|فایل|سند|اکسل/i, "files"],
    [/project|پروژه/i, "projects"],
  ];
  for (const [pattern, tool] of map) if (pattern.test(p)) wanted.push(tool);
  return Array.from(new Set(wanted.filter((tool) => !allowedTools.length || allowedTools.includes(tool) || allowedTools.includes(tool.replace("company_", "")))));
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

export function deterministicRequestIntelligence(input: {
  prompt: string;
  conversationLanguage?: string | null;
  savedLanguage?: string | null;
  agent?: AgentRoutingPolicy;
}): RequestIntelligence {
  const messageLanguage = detectMessageLanguage(input.prompt);
  const responseLanguage = resolveResponseLanguage({
    explicitLanguage: explicitLanguageFromPrompt(input.prompt),
    conversationLanguage: input.conversationLanguage,
    messageLanguage,
    savedLanguage: input.savedLanguage ?? input.agent?.savedLanguage,
    systemDefault: "en",
  });
  const operation = inferOperation(input.prompt);
  const requiredTools = inferTools(input.prompt, input.agent?.allowedTools);
  const complexity = inferComplexity(input.prompt, operation, requiredTools);
  const risk = inferRisk(input.prompt, operation, input.agent);
  const recommendedTier = complexity === "high" ? "sol" : complexity === "medium" ? "terra" : "luna";
  const reasoningRequirement = complexity === "high" ? "high" : complexity === "medium" ? "medium" : "low";
  const ambiguous = input.prompt.trim().length > 120 && !/classif|extract|format|summari[sz]e|rewrite|lookup|architecture|strategy|analy[sz]e|طبقه.?بندی|استخراج|فرمت|خلاصه|بازنویسی|معماری|استراتژی|تحلیل/i.test(input.prompt);
  return {
    language: messageLanguage,
    responseLanguage,
    intent: operation === "external_action" ? "external_action" : operation === "write" ? "state_change" : operation === "analyze" ? "analysis" : "information",
    taskType: operation,
    operation,
    complexity,
    risk,
    reasoningRequirement,
    requiredTools,
    requiredCapabilities: complexity === "high" ? ["reasoning", "analysis"] : complexity === "medium" ? ["analysis"] : [],
    recommendedTier,
    confidence: ambiguous ? 0.7 : 0.9,
    allowEscalation: risk !== "restricted",
    classificationSource: "deterministic",
  };
}
