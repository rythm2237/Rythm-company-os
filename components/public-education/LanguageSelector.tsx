"use client";

import { usePublicEducation } from "./PublicEducationProvider";
import { LOCALE_OPTIONS, type SupportedLocale } from "@/lib/public-education/types";

type Props = {
  compact?: boolean;
  className?: string;
};

export default function LanguageSelector({ compact = false, className = "" }: Props) {
  const { copy, locale, setLocale } = usePublicEducation();

  return (
    <label className={`education-language-selector${compact ? " is-compact" : ""}${className ? ` ${className}` : ""}`} dir="ltr">
      <span>{copy.ui.languageLabel}</span>
      <select
        aria-label={copy.ui.languageLabel}
        value={locale}
        onChange={(event) => void setLocale(event.target.value as SupportedLocale)}
      >
        {LOCALE_OPTIONS.map((option) => (
          <option key={option.code} value={option.code}>{compact ? `${option.shortLabel} · ${option.label}` : option.label}</option>
        ))}
      </select>
    </label>
  );
}
