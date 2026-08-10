"use client";

import { useEffect } from "react";
import { usePathname, useSearchParams } from "next/navigation";

const CUSTOM_CEO_OPTION = "__custom_ceo_decision__";

type Draft = {
  selectedOption: string;
  customDecision: string;
  rationale: string;
  riskLevel: string;
};

export default function DecisionDraftGuard(){
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const query = searchParams.toString();

  useEffect(() => {
    if (pathname !== "/meetings/room") return;

    const customDecision = document.querySelector<HTMLTextAreaElement>('textarea[name="customDecision"]');
    const form = customDecision?.closest("form") ?? null;
    if (!form || !customDecision) return;

    const sessionId = form.querySelector<HTMLInputElement>('input[name="sessionId"]')?.value;
    const selectedOption = form.querySelector<HTMLSelectElement>('select[name="selectedOption"]');
    const rationale = form.querySelector<HTMLTextAreaElement>('textarea[name="rationale"]');
    const riskLevel = form.querySelector<HTMLSelectElement>('select[name="riskLevel"]');
    const customLabel = customDecision.closest("label");
    if (!sessionId || !selectedOption || !rationale || !riskLevel) return;

    const storageKey = `rythm-ceo-decision-draft:${sessionId}`;
    const hasSubmissionError = searchParams.has("error");

    const applyCustomVisibility = () => {
      const isCustom = selectedOption.value === CUSTOM_CEO_OPTION;
      if (customLabel) customLabel.style.display = isCustom ? "" : "none";
      customDecision.required = isCustom;
    };

    const snapshot = (): Draft => ({
      selectedOption: selectedOption.value,
      customDecision: customDecision.value,
      rationale: rationale.value,
      riskLevel: riskLevel.value,
    });

    const persist = () => {
      try {
        window.sessionStorage.setItem(storageKey, JSON.stringify(snapshot()));
      } catch {
        // Draft persistence is a UX safeguard only; governance never depends on it.
      }
      applyCustomVisibility();
    };

    if (hasSubmissionError) {
      try {
        const stored = window.sessionStorage.getItem(storageKey);
        if (stored) {
          const draft = JSON.parse(stored) as Partial<Draft>;
          if (draft.selectedOption) selectedOption.value = draft.selectedOption;
          if (typeof draft.customDecision === "string") customDecision.value = draft.customDecision;
          if (typeof draft.rationale === "string") rationale.value = draft.rationale;
          if (draft.riskLevel) riskLevel.value = draft.riskLevel;
        }
      } catch {
        window.sessionStorage.removeItem(storageKey);
      }
    } else {
      window.sessionStorage.removeItem(storageKey);
    }

    applyCustomVisibility();
    form.addEventListener("input", persist);
    form.addEventListener("change", persist);
    form.addEventListener("submit", persist);

    return () => {
      form.removeEventListener("input", persist);
      form.removeEventListener("change", persist);
      form.removeEventListener("submit", persist);
    };
  }, [pathname, query, searchParams]);

  return null;
}
