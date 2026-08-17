"use client";

import { usePathname, useRouter } from "next/navigation";
import { useEffect, useRef, useState, type CSSProperties } from "react";
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

type SpotlightRect = {
  top: number;
  right: number;
  bottom: number;
  left: number;
};

function clamp(value: number, minimum: number, maximum: number) {
  return Math.min(Math.max(value, minimum), Math.max(minimum, maximum));
}

function intersectionArea(
  first: { top: number; right: number; bottom: number; left: number },
  second: { top: number; right: number; bottom: number; left: number },
) {
  const width = Math.max(0, Math.min(first.right, second.right) - Math.max(first.left, second.left));
  const height = Math.max(0, Math.min(first.bottom, second.bottom) - Math.max(first.top, second.top));
  return width * height;
}

function getGuidePosition(target: DOMRect, dialog: DOMRect): CSSProperties {
  const margin = 16;
  const gap = 20;
  const viewportWidth = window.innerWidth;
  const viewportHeight = window.innerHeight;
  const centeredTop = target.top + ((target.height - dialog.height) / 2);
  const centeredLeft = target.left + ((target.width - dialog.width) / 2);
  const candidates = [
    { left: target.right + gap, top: centeredTop },
    { left: target.left - dialog.width - gap, top: centeredTop },
    { left: centeredLeft, top: target.bottom + gap },
    { left: centeredLeft, top: target.top - dialog.height - gap },
  ];

  const paddedTarget = {
    top: target.top - 10,
    right: target.right + 10,
    bottom: target.bottom + 10,
    left: target.left - 10,
  };

  const ranked = candidates.map((candidate, index) => {
    const left = clamp(candidate.left, margin, viewportWidth - dialog.width - margin);
    const top = clamp(candidate.top, margin, viewportHeight - dialog.height - margin);
    const rectangle = {
      top,
      right: left + dialog.width,
      bottom: top + dialog.height,
      left,
    };
    const displacement = Math.abs(left - candidate.left) + Math.abs(top - candidate.top);
    return {
      left,
      top,
      score: (intersectionArea(rectangle, paddedTarget) * 100) + displacement + index,
    };
  }).sort((first, second) => first.score - second.score);

  return {
    top: ranked[0].top,
    left: ranked[0].left,
    right: "auto",
    bottom: "auto",
  };
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
    experienceMode,
    setTourStep,
    startTour,
    dismissTour,
    completeTour,
  } = usePublicEducation();
  const dialogRef = useRef<HTMLDivElement>(null);
  const returnFocusRef = useRef<HTMLElement | null>(null);
  const lastStepEventRef = useRef<string | null>(null);
  const [dialogPosition, setDialogPosition] = useState<CSSProperties | undefined>();
  const [spotlightRect, setSpotlightRect] = useState<SpotlightRect | null>(null);
  const activeDefinition = getActiveTourStep(tourStep);
  const activeCopy = copy.tour[activeDefinition.id];
  const nextArrow = copy.direction === "rtl" ? "←" : "→";
  const backArrow = copy.direction === "rtl" ? "→" : "←";
  const numberFormatter = new Intl.NumberFormat(locale, { useGrouping: false, minimumIntegerDigits: 2 });

  useEffect(() => {
    if (tourState === "active" && pathname !== "/demo") router.push("/demo");
  }, [pathname, router, tourState]);

  useEffect(() => {
    if (tourState !== "closed") {
      if (!returnFocusRef.current) returnFocusRef.current = document.activeElement as HTMLElement | null;
      return;
    }

    const returnTarget = returnFocusRef.current;
    returnFocusRef.current = null;
    const restoreTimer = window.setTimeout(() => {
      if (returnTarget?.isConnected) returnTarget.focus();
    }, 0);
    return () => window.clearTimeout(restoreTimer);
  }, [tourState]);

  useEffect(() => {
    if (tourState === "closed") return;

    const focusTimer = window.setTimeout(() => dialogRef.current?.focus(), 60);

    function handleKeyDown(event: KeyboardEvent) {
      if (event.key === "Escape") {
        dismissTour();
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
    };
  }, [dismissTour, tourState]);

  useEffect(() => {
    if (tourState !== "active") {
      lastStepEventRef.current = null;
      return;
    }
    const signature = `${tourStep}:${activeDefinition.id}:${locale}`;
    if (lastStepEventRef.current === signature) return;
    lastStepEventRef.current = signature;
    trackPublicExperienceEvent({
      name: "tour_step_viewed",
      properties: { locale, step: tourStep + 1, step_id: activeDefinition.id },
    });
  }, [activeDefinition.id, locale, tourState, tourStep]);

  useEffect(() => {
    document.querySelectorAll(".is-guide-target").forEach((element) => element.classList.remove("is-guide-target"));
    setSpotlightRect(null);
    setDialogPosition(undefined);

    if (tourState === "prompt" && pathname === "/") {
      const target = document.querySelector<HTMLElement>(".hero-system-card");
      if (!target) return;

      const previousVisibility = target.style.visibility;
      const previousPointerEvents = target.style.pointerEvents;
      const previousAriaHidden = target.getAttribute("aria-hidden");
      let frame = 0;

      function restoreTarget() {
        target.style.visibility = previousVisibility;
        target.style.pointerEvents = previousPointerEvents;
        if (previousAriaHidden === null) target.removeAttribute("aria-hidden");
        else target.setAttribute("aria-hidden", previousAriaHidden);
      }

      function syncPromptPosition() {
        if (!dialogRef.current) return;

        if (window.innerWidth <= 900) {
          restoreTarget();
          setDialogPosition(undefined);
          return;
        }

        const targetRect = target.getBoundingClientRect();
        const dialogRect = dialogRef.current.getBoundingClientRect();
        const margin = 16;
        const left = clamp(
          targetRect.left + ((targetRect.width - dialogRect.width) / 2),
          margin,
          window.innerWidth - dialogRect.width - margin,
        );
        const top = clamp(
          targetRect.top + ((targetRect.height - dialogRect.height) / 2),
          margin,
          window.innerHeight - dialogRect.height - margin,
        );

        target.style.visibility = "hidden";
        target.style.pointerEvents = "none";
        target.setAttribute("aria-hidden", "true");
        setDialogPosition({ top, left, right: "auto", bottom: "auto" });
      }

      frame = window.requestAnimationFrame(syncPromptPosition);
      window.addEventListener("resize", syncPromptPosition);
      window.addEventListener("scroll", syncPromptPosition, true);
      return () => {
        window.cancelAnimationFrame(frame);
        window.removeEventListener("resize", syncPromptPosition);
        window.removeEventListener("scroll", syncPromptPosition, true);
        restoreTarget();
      };
    }

    if (tourState !== "active" || pathname !== "/demo") return;

    let frame = 0;
    let attempts = 0;
    let target: HTMLElement | null = null;
    const timers: number[] = [];

    function syncFloatingElements() {
      if (!target || !dialogRef.current) return;
      const rect = target.getBoundingClientRect();
      const padding = 9;
      setSpotlightRect({
        top: clamp(rect.top - padding, 0, window.innerHeight),
        right: clamp(rect.right + padding, 0, window.innerWidth),
        bottom: clamp(rect.bottom + padding, 0, window.innerHeight),
        left: clamp(rect.left - padding, 0, window.innerWidth),
      });
      setDialogPosition(getGuidePosition(rect, dialogRef.current.getBoundingClientRect()));
    }

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
      frame = window.requestAnimationFrame(syncFloatingElements);
      timers.push(window.setTimeout(syncFloatingElements, 240));
      timers.push(window.setTimeout(syncFloatingElements, 560));
    }

    findTarget();
    window.addEventListener("resize", syncFloatingElements);
    window.addEventListener("scroll", syncFloatingElements, true);
    return () => {
      window.cancelAnimationFrame(frame);
      timers.forEach((timer) => window.clearTimeout(timer));
      window.removeEventListener("resize", syncFloatingElements);
      window.removeEventListener("scroll", syncFloatingElements, true);
      target?.classList.remove("is-guide-target");
    };
  }, [activeDefinition.target, experienceMode, pathname, tourState]);

  if (!ready || tourState === "closed") return null;

  const close = dismissTour;

  return (
    <>
      <button
        className={`marketing-guide-scrim${tourState === "active" && spotlightRect ? " has-spotlight" : ""}`}
        type="button"
        aria-label={copy.ui.close}
        onClick={close}
      />
      {tourState === "active" && spotlightRect ? (
        <div className="marketing-guide-spotlight-mask" aria-hidden="true">
          <span style={{ inset: `0 0 auto 0`, height: spotlightRect.top }} />
          <span style={{ inset: `${spotlightRect.bottom}px 0 0 0` }} />
          <span style={{ top: spotlightRect.top, left: 0, width: spotlightRect.left, height: spotlightRect.bottom - spotlightRect.top }} />
          <span style={{ top: spotlightRect.top, right: 0, width: window.innerWidth - spotlightRect.right, height: spotlightRect.bottom - spotlightRect.top }} />
        </div>
      ) : null}
      <div
        className="marketing-guide-dialog"
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="marketing-guide-title"
        dir={copy.direction}
        lang={locale}
        tabIndex={-1}
        style={dialogPosition}
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
              role="progressbar"
              aria-label={formatTemplate(copy.ui.stepProgress, {
                current: numberFormatter.format(tourStep + 1),
                total: numberFormatter.format(TOUR_STEPS.length),
              })}
              aria-valuemin={1}
              aria-valuemax={TOUR_STEPS.length}
              aria-valuenow={tourStep + 1}
            >
              <span aria-hidden="true">{numberFormatter.format(tourStep + 1)}</span>
              <div aria-hidden="true" style={{ gridTemplateColumns: `repeat(${TOUR_STEPS.length}, 1fr)` }}>
                {TOUR_STEPS.map((step, index) => <i className={index <= tourStep ? "is-complete" : undefined} key={step.id} />)}
              </div>
              <small aria-hidden="true">{numberFormatter.format(TOUR_STEPS.length)}</small>
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

      </div>
    </>
  );
}
