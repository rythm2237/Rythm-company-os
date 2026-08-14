"use client";

import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
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

export type TourState = "closed" | "prompt" | "active";

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

function readTourPreference() {
  const stored = window.localStorage.getItem(TOUR_STORAGE_KEY);
  if (stored === "completed" || stored === "dismissed") return stored;
  if (stored !== null) window.localStorage.removeItem(TOUR_STORAGE_KEY);
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
  const localeRequestRef = useRef(0);

  useEffect(() => {
    let cancelled = false;

    async function initialize() {
      const storedLocaleValue = window.localStorage.getItem(LOCALE_STORAGE_KEY);
      const storedLocale = normalizeLocale(storedLocaleValue);
      const detectedLocale = detectSupportedBrowserLocale();
      const initialLocale = storedLocale ?? detectedLocale ?? "en";

      if (storedLocaleValue && !storedLocale) {
        window.localStorage.removeItem(LOCALE_STORAGE_KEY);
      }

      if (initialLocale !== "en") {
        const storedCopy = await loadPublicEducationCopy(initialLocale);
        if (cancelled) return;
        setCopy(storedCopy);
        setActiveLocale(initialLocale);
      }

      const storedExperienceMode = window.sessionStorage.getItem(EXPERIENCE_STORAGE_KEY);
      setExperienceModeState(storedExperienceMode === "active");
      if (storedExperienceMode !== null && storedExperienceMode !== "active") {
        window.sessionStorage.removeItem(EXPERIENCE_STORAGE_KEY);
      }
      setReady(true);

      if (!readTourPreference()) {
        setTourState("prompt");
        trackPublicExperienceEvent({ name: "tour_prompt_seen", properties: { locale: initialLocale } });
      }
    }

    void initialize();
    return () => { cancelled = true; };
  }, []);

  const selectLocale = useCallback(async (nextLocale: SupportedLocale) => {
    const requestId = ++localeRequestRef.current;
    const nextCopy = await loadPublicEducationCopy(nextLocale);
    if (requestId !== localeRequestRef.current) return;
    setCopy(nextCopy);
    setActiveLocale(nextLocale);
    setSuggestedLocale(null);
    window.localStorage.setItem(LOCALE_STORAGE_KEY, nextLocale);
    trackPublicExperienceEvent({ name: "tour_language_selected", properties: { locale: nextLocale } });
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
    setTourState("closed");
    setTourStep(0);
    trackPublicExperienceEvent({ name: "tour_completed", properties: { locale } });
  }, [locale]);

  const startExplainMode = useCallback(() => {
    if (tourState !== "closed" || explainMode) return;
    setExplainMode(true);
    trackPublicExperienceEvent({ name: "explain_mode_enabled", properties: { locale } });
  }, [explainMode, locale, tourState]);

  const closeExplainMode = useCallback(() => {
    if (!explainMode) return;
    setExplainMode(false);
    trackPublicExperienceEvent({ name: "explain_mode_disabled", properties: { locale } });
  }, [explainMode, locale]);

  const setExperienceMode = useCallback((active: boolean) => {
    if (active === experienceMode) return;
    setExperienceModeState(active);
    if (active) window.sessionStorage.setItem(EXPERIENCE_STORAGE_KEY, "active");
    else window.sessionStorage.removeItem(EXPERIENCE_STORAGE_KEY);
    trackPublicExperienceEvent({
      name: active ? "experience_mode_entered" : "experience_mode_exited",
      properties: { locale },
    });
  }, [experienceMode, locale]);

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
    setTourStep,
    startExplainMode,
    closeExplainMode,
    setExperienceMode,
  }), [
    acceptSuggestedLocale,
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
