"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef } from "react";
import RythmBrandMark from "@/components/brand/RythmBrandMark";
import { trackPublicExperienceEvent } from "@/lib/analytics/public-events";
import { TOUR_STEPS } from "@/lib/public-education/types";
import LanguageSelector from "./LanguageSelector";
import {
  getActiveTourStep,
  getSuggestedLanguageLabel,
  usePublicEducation,
} from "./PublicEducationProvider";

function formatTemplate(template: string, values: Record<string, string | number>) {
  return Object.entries(values).reduce(
    (result, [key, value]) => result.replaceAll(`{${key}}`, String(value)),
    template,
  );
}

export default function GuidedTour() {
  const pathname = usePathname();
  const router = useRouter();
  const {
    ready,
    copy,
    locale,
    suggestedLocale,
    acceptSuggestedLocale,
    tourState,
    tourStep,
    setTourStep,
    startTour,
    dismissTour,
    completeTour,
    closeCompletedTour,
  } = usePublicEducation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const activeDefinition = getActiveTourStep(tourStep);
  const activeCopy = copy.tour[activeDefinition.id];
  const nextArrow = copy.direction === "rtl" ? "←" : "→";
  const backArrow = copy.direction === "rtl" ? "→" : "←";

  useEffect(() => {
    if (tourState === "active" && pathname !== "/demo") router.push("/demo");
  }, [pathname, router, tourState]);

  useEffect(() => {
    if (tourState === "closed") return;

    returnFocusRef.current = document.activeElement as HTMLElement | null;
    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 60);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        if (tourState === "complete") closeCompletedTour();
        else dismissTour();
        return;
      }
      if (event.key !== "Tab" || !dialogRef.current) return;

      const focusable = Array.from(dialogRef.current.querySelectorAll<HTMLElement>(
        "button:not([disabled]), a[href], select:not([disabled]), [tabindex]:not([tabindex='-1'])",
      ));
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && (document.activeElement === last || document.activeElement === dialogRef.current)) {
        event.preventDefault();
        first.focus();
      }
    }

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.clearTimeout(focusTimer);
      window.removeEventListener("keydown", handleKeyDown);
      window.setTimeout(() => returnFocusRef.current?.focus(), 0);
    };
  }, [closeCompletedTour, dismissTour, tourState]);

  useEffect(() => {
    document.querySelectorAll(".is-guide-target").forEach((element) => element.classList.remove("is-guide-target"));
    if (tourState !== "active" || pathname !== "/demo") return;

    let frame = 0;
    let attempts = 0;
    let target: HTMLElement | null = null;

    function findTarget() {
      target = document.querySelector<HTMLElement>(`[data-tour-id="${activeDefinition.target}"]`);
      if (!target && attempts < 24) {
        attempts += 1;
        frame = window.requestAnimationFrame(findTarget);
        return;
      }
      target?.classList.add("is-guide-target");
      target?.scrollIntoView({
        block: "center",
        inline: "nearest",
        behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth",
      });
    }

    findTarget();
    return () => {
      window.cancelAnimationFrame(frame);
      target?.classList.remove("is-guide-target");
    };
  }, [activeDefinition.target, pathname, tourState]);

  if (!ready || tourState === "closed") return null;

  const close = tourState === "complete" ? closeCompletedTour : dismissTour;

  return (
    <>
      <button className="marketing-guide-scrim" type="button" aria-label={copy.ui.close} onClick={close} />
      <div
        className="marketing-guide-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="marketing-guide-title"
        dir={copy.direction}
        lang={locale}
        tabIndex={-1}
      >
        <button className="marketing-guide-close" type="button" onClick={close} aria-label={copy.ui.close}>×</button>

        {tourState === "prompt" ? (
          <>
            <div className="marketing-guide-orbit" aria-hidden="true"><span><RythmBrandMark variant="inverse" /></span><i /><i /></div>
            <p className="marketing-kicker">{copy.ui.optionalDuration}</p>
            <h2 id="marketing-guide-title">{copy.ui.promptTitle}</h2>
            <p>{copy.ui.promptDescription}</p>
            {suggestedLocale ? (
              <button className="education-language-suggestion" type="button" onClick={() => void acceptSuggestedLocale()}>
                {formatTemplate(copy.ui.detectedLanguage, { language: getSuggestedLanguageLabel(suggestedLocale) })}
              </button>
            ) : null}
            <LanguageSelector />
            <div className="marketing-guide-actions">
              <button className="marketing-secondary-button" type="button" onClick={dismissTour}>{copy.ui.notNow}</button>
              <button className="marketing-button" type="button" onClick={startTour}>{copy.ui.startTour} <span aria-hidden="true">{nextArrow}</span></button>
            </div>
          </>
        ) : null}

        {tourState === "active" ? (
          <>
            <div
              className="marketing-guide-progress"
              aria-label={formatTemplate(copy.ui.stepProgress, { current: tourStep + 1, total: TOUR_STEPS.length })}
            >
              <span>{String(tourStep + 1).padStart(2, "0")}</span>
              <div style={{ gridTemplateColumns: `repeat(${TOUR_STEPS.length}, 1fr)` }}>
                {TOUR_STEPS.map((step, index) => <i className={index <= tourStep ? "is-complete" : undefined} key={step.id} />)}
              </div>
              <small>{String(TOUR_STEPS.length).padStart(2, "0")}</small>
            </div>
            <LanguageSelector compact className="marketing-guide-language" />
            <p className="marketing-kicker">{activeCopy.eyebrow}</p>
            <h2 id="marketing-guide-title">{activeCopy.title}</h2>
            <p>{activeCopy.description}</p>
            <div className="marketing-guide-actions">
              <button className="marketing-guide-skip" type="button" onClick={dismissTour}>{copy.ui.skipTour}</button>
              <div>
                {tourStep > 0 ? (
                  <button className="marketing-secondary-button" type="button" onClick={() => setTourStep((step) => step - 1)}>
                    <span aria-hidden="true">{backArrow}</span> {copy.ui.back}
                  </button>
                ) : null}
                {tourStep < TOUR_STEPS.length - 1 ? (
                  <button className="marketing-button" type="button" onClick={() => setTourStep((step) => step + 1)}>
                    {copy.ui.next} <span aria-hidden="true">{nextArrow}</span>
                  </button>
                ) : (
                  <button className="marketing-button" type="button" onClick={completeTour}>{copy.ui.finish} <span aria-hidden="true">✓</span></button>
                )}
              </div>
            </div>
          </>
        ) : null}

        {tourState === "complete" ? (
          <>
            <p className="marketing-kicker">{copy.ui.completedEyebrow}</p>
            <h2 id="marketing-guide-title">{copy.ui.completedTitle}</h2>
            <p>{copy.ui.completedDescription}</p>
            <div className="education-completion-links">
              <Link href="/pricing" onClick={() => trackPublicExperienceEvent({ name: "demo_get_started_clicked", properties: { destination: "pricing", locale } })}>{copy.ui.explorePlans}</Link>
              <Link href="/live-ai-meeting">{copy.ui.tryMeeting}</Link>
              <Link className="marketing-button" href="/signup" onClick={() => trackPublicExperienceEvent({ name: "demo_get_started_clicked", properties: { destination: "signup", locale } })}>{copy.ui.buildCompany}</Link>
            </div>
            <button className="education-continue-button" type="button" onClick={closeCompletedTour}>{copy.ui.continueExploring}</button>
          </>
        ) : null}
      </div>
    </>
  );
}
