export const SUPPORTED_LOCALES = ["en", "de", "fr", "hu", "fa"] as const;

export type SupportedLocale = (typeof SUPPORTED_LOCALES)[number];

export type TextDirection = "ltr" | "rtl";

export const TOUR_STEPS = [
  { id: "humanCeo", target: "demo-human-ceo", surface: "command" },
  { id: "commandCenter", target: "demo-command", surface: "command" },
  { id: "aiWorkforce", target: "demo-agents", surface: "agents" },
  { id: "projects", target: "demo-projects", surface: "projects" },
  { id: "accountableWork", target: "demo-actions", surface: "actions" },
  { id: "boardroom", target: "demo-boardroom", surface: "boardroom" },
  { id: "traceability", target: "demo-traceability", surface: "traceability" },
  { id: "executiveControl", target: "demo-executive-review", surface: "executive-review" },
  { id: "build", target: "demo-builder", surface: "builder" },
] as const;

export type TourStepId = (typeof TOUR_STEPS)[number]["id"];

export const EXPLAIN_KEYS = [
  "humanCeo",
  "ceoApprovals",
  "aiAgents",
  "agentAuthority",
  "agentStatus",
  "projects",
  "actions",
  "approvalBoundary",
  "ideas",
  "boardroom",
  "traceability",
  "attention",
  "executiveReview",
  "economics",
  "operationsHealth",
  "templates",
  "companyBuilder",
  "operatingContext",
  "risk",
  "blockedWorkflow",
  "syntheticDemo",
  "readOnlyDemo",
  "externalActions",
  "entitlements",
] as const;

export type ExplainKey = (typeof EXPLAIN_KEYS)[number];

export type TourStepCopy = {
  eyebrow: string;
  title: string;
  description: string;
};

export type ExplanationCopy = {
  title: string;
  what: string;
  why: string;
  real: string;
};

export type PublicEducationCopy = {
  locale: SupportedLocale;
  direction: TextDirection;
  languageName: string;
  ui: {
    optionalDuration: string;
    promptTitle: string;
    promptDescription: string;
    detectedLanguage: string;
    languageLabel: string;
    notNow: string;
    startTour: string;
    restartTour: string;
    guideLauncherTitle: string;
    guideLauncherDetail: string;
    close: string;
    skipTour: string;
    back: string;
    next: string;
    finish: string;
    stepProgress: string;
    completedEyebrow: string;
    completedTitle: string;
    completedDescription: string;
    continueExploring: string;
    buildCompany: string;
    explorePlans: string;
    tryMeeting: string;
    explainMode: string;
    explainModeActive: string;
    explainHint: string;
    exitExplainMode: string;
    experienceMode: string;
    exitExperienceMode: string;
    experienceDiscoveryHint: string;
    resetDemo: string;
    whatIsThis: string;
    whyItMatters: string;
    inRealCompany: string;
    learningControls: string;
    conversionEyebrow: string;
    conversionTitle: string;
    conversionDescription: string;
    dismiss: string;
    signIn: string;
    getStarted: string;
  };
  tour: Record<TourStepId, TourStepCopy>;
  explanations: Record<ExplainKey, ExplanationCopy>;
};

export const LOCALE_OPTIONS: ReadonlyArray<{
  code: SupportedLocale;
  label: string;
  shortLabel: string;
  direction: TextDirection;
}> = [
  { code: "en", label: "English", shortLabel: "EN", direction: "ltr" },
  { code: "de", label: "Deutsch", shortLabel: "DE", direction: "ltr" },
  { code: "fr", label: "Français", shortLabel: "FR", direction: "ltr" },
  { code: "hu", label: "Magyar", shortLabel: "HU", direction: "ltr" },
  { code: "fa", label: "فارسی", shortLabel: "FA", direction: "rtl" },
] as const;

export function isSupportedLocale(value: string | null | undefined): value is SupportedLocale {
  return Boolean(value && SUPPORTED_LOCALES.includes(value.toLowerCase().split("-")[0] as SupportedLocale));
}

export function normalizeLocale(value: string | null | undefined): SupportedLocale | null {
  if (!value) return null;
  const base = value.toLowerCase().split("-")[0];
  return isSupportedLocale(base) ? base : null;
}
