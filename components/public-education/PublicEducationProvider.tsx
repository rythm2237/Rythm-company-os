"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from "react";
import { trackPublicExperienceEvent } from "@/lib/analytics/public-events";
import {
  DEFAULT_PUBLIC_EDUCATION_COPY,
  loadPublicEducationCopy,
} from "@/lib/public-education/i18n";
import {
  LOCALE_OPTIONS,
  TOUR_STEPS,
  normalizeLocale,
  type PublicEducationCopy,
  type SupportedLocale,
} from "@/lib/public-education/types";

const LOCALE_STORAGE_KEY = "rythm-public-education-locale-v1";
const TOUR_STORAGE_KEY = "rythm-public-guide-v3";
const EXPERIENCE_STORAGE_KEY = "rythm-demo-experience-v1";

export type TourState = "closed" | "prompt" | "active" | "complete";

type PublicEducationContextValue = {
  ready: boolean;
  copy: PublicEducationCopy;
  locale: SupportedLocale;
  suggestedLocale: SupportedLocale | null;
  tourState: TourState;
  tourStep: number;
  explainMode: boolean;
  experienceMode: boolean;
  setLocale: (locale: SupportedLocale) => Promise<void>;
  acceptSuggestedLocale: () => Promise<void>;
  openTour: () => void;
  startTour: () => void;
  dismissTour: () => void;
  completeTour: () => void;
  closeCompletedTour: () => void;
  setTourStep: React.Dispatch<React.SetStateAction<number>>;
  startExplainMode: () => void;
  closeExplainMode: () => void;
  setExperienceMode: (active: boolean) => void;
};

const PublicEducationContext = createContext<PublicEducationContextValue | null>(null);

function detectSupportedBrowserLocale() {
  if (typeof navigator === "undefined") return null;
  for (const language of navigator.languages ?? [navigator.language]) {
    const locale = normalizeLocale(language);
    if (locale) return locale;
  }
  return null;
}

export default function PublicEducationProvider({ children }: Readonly<{ children: React.ReactNode }>) {
  const [ready, setReady] = useState(false);
  const [copy, setCopy] = useState<PublicEducationCopy>(DEFAULT_PUBLIC_EDUCATION_COPY);
  const [locale, setActiveLocale] = useState<SupportedLocale>("en");
  const [suggestedLocale, setSuggestedLocale] = useState<SupportedLocale | null>(null);
  const [tourState, setTourState] = useState<TourState>("closed");
  const [tourStep, setTourStep] = useState(0);
  const [explainMode, setExplainMode] = useState(false);
  const [experienceMode, setExperienceModeState] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const storedLocale = normalizeLocale(window.localStorage.getItem(LOCALE_STORAGE_KEY));
      const detectedLocale = detectSupportedBrowserLocale();

      if (storedLocale) {
        const storedCopy = await loadPublicEducationCopy(storedLocale);
        if (cancelled) return;
        setCopy(storedCopy);
        setActiveLocale(storedLocale);
      } else if (detectedLocale && detectedLocale !== "en") {
        setSuggestedLocale(detectedLocale);
      }

      setExperienceModeState(window.sessionStorage.getItem(EXPERIENCE_STORAGE_KEY) === "active");
      setReady(true);

      if (!window.localStorage.getItem(TOUR_STORAGE_KEY)) {
        setTourState("prompt");
        trackPublicExperienceEvent({ name: "tour_prompt_seen", properties: { locale: storedLocale ?? "en" } });
      }
    }

    void initialize();
    return () => { cancelled = true; };
  }, []);

  const selectLocale = useCallback(async (nextLocale: SupportedLocale) => {
    const nextCopy = await loadPublicEducationCopy(nextLocale);
    setCopy(nextCopy);
    setActiveLocale(nextLocale);
    setSuggestedLocale(null);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    trackPublicExperienceEvent({ name: "tour_language_changed", properties: { locale: nextLocale } });
  }, []);

  const acceptSuggestedLocale = useCallback(async () => {
    if (!suggestedLocale) return;
    await selectLocale(suggestedLocale);
  }, [selectLocale, suggestedLocale]);

  const openTour = useCallback(() => {
    setExplainMode(false);
    setTourStep(0);
    setTourState("prompt");
  }, []);

  const startTour = useCallback(() => {
    setExplainMode(false);
    setTourStep(0);
    setTourState("active");
    trackPublicExperienceEvent({ name: "tour_started", properties: { locale } });
  }, [locale]);

  const dismissTour = useCallback(() => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, "dismissed");
    setTourState("closed");
    setTourStep(0);
    trackPublicExperienceEvent({ name: "tour_skipped", properties: { locale } });
  }, [locale]);

  const completeTour = useCallback(() => {
    window.localStorage.setItem(TOUR_STORAGE_KEY, "completed");
    setTourState("complete");
    trackPublicExperienceEvent({ name: "tour_completed", properties: { locale } });
  }, [locale]);

  const closeCompletedTour = useCallback(() => {
    setTourState("closed");
    setTourStep(0);
  }, []);

  const startExplainMode = useCallback(() => {
    if (tourState === "active" || tourState === "complete") return;
    setExplainMode(true);
    trackPublicExperienceEvent({ name: "explain_mode_started", properties: { locale } });
  }, [locale, tourState]);

  const closeExplainMode = useCallback(() => {
    setExplainMode(false);
    trackPublicExperienceEvent({ name: "explain_mode_closed", properties: { locale } });
  }, [locale]);

  const setExperienceMode = useCallback((active: boolean) => {
    setExperienceModeState(active);
    if (active) window.sessionStorage.setItem(EXPERIENCE_STORAGE_KEY, "active");
    else window.sessionStorage.removeItem(EXPERIENCE_STORAGE_KEY);
    trackPublicExperienceEvent({
      name: active ? "experience_mode_started" : "experience_mode_closed",
      properties: { locale },
    });
  }, [locale]);

  const value = useMemo<PublicEducationContextValue>(() => ({
    ready,
    copy,
    locale,
    suggestedLocale,
    tourState,
    tourStep,
    explainMode,
    experienceMode,
    setLocale: selectLocale,
    acceptSuggestedLocale,
    openTour,
    startTour,
    dismissTour,
    completeTour,
    closeCompletedTour,
    setTourStep,
    startExplainMode,
    closeExplainMode,
    setExperienceMode,
  }), [
    acceptSuggestedLocale,
    closeCompletedTour,
    closeExplainMode,
    completeTour,
    copy,
    dismissTour,
    experienceMode,
    explainMode,
    locale,
    openTour,
    ready,
    selectLocale,
    setExperienceMode,
    startExplainMode,
    startTour,
    suggestedLocale,
    tourState,
    tourStep,
  ]);

  return <PublicEducationContext.Provider value={value}>{children}</PublicEducationContext.Provider>;
}

export function usePublicEducation() {
  const context = useContext(PublicEducationContext);
  if (!context) throw new Error("usePublicEducation must be used inside PublicEducationProvider");
  return context;
}

export function getSuggestedLanguageLabel(locale: SupportedLocale) {
  return LOCALE_OPTIONS.find((option) => option.code === locale)?.label ?? locale.toUpperCase();
}

export function getActiveTourStep(index: number) {
  return TOUR_STEPS[index] ?? TOUR_STEPS[0];
}
