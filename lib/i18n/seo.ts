import type { Metadata } from "next";
import {
  ACTIVE_LOCALES,
  DEFAULT_LOCALE,
  getLocaleDefinition,
  type Locale,
} from "@/lib/i18n/config";
import { getLocalizedPath } from "@/lib/i18n/routing";

export function getLanguageAlternates(path: string): NonNullable<Metadata["alternates"]>["languages"] {
  const languages: Record<string, string> = {};

  for (const locale of ACTIVE_LOCALES) {
    const definition = getLocaleDefinition(locale);
    languages[definition.hreflang] = getLocalizedPath(path, locale);
  }

  languages["x-default"] = getLocalizedPath(path, DEFAULT_LOCALE);
  return languages;
}

export function getLocalizedAlternates(
  path: string,
  locale: Locale = DEFAULT_LOCALE,
): NonNullable<Metadata["alternates"]> {
  return {
    canonical: getLocalizedPath(path, locale),
    languages: getLanguageAlternates(path),
  };
}

export function getOpenGraphLocale(locale: Locale = DEFAULT_LOCALE) {
  return getLocaleDefinition(locale).openGraphLocale;
}
