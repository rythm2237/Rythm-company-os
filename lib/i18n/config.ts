export const ALL_LOCALES = ["en", "de", "fr", "hu"] as const;

export type Locale = (typeof ALL_LOCALES)[number];
export type TextDirection = "ltr" | "rtl";

export const DEFAULT_LOCALE: Locale = "en";

// Keep future locales registered but inactive until their content is translated,
// reviewed, and explicitly released. This prevents accidental mixed-language UX
// and premature indexing of incomplete localized pages.
export const ACTIVE_LOCALES = ["en"] as const satisfies readonly Locale[];
export const FUTURE_LOCALES = ["de", "fr", "hu"] as const satisfies readonly Locale[];

export const LOCALE_COOKIE = "rythm_locale";

export type LocaleDefinition = Readonly<{
  code: Locale;
  languageTag: string;
  hreflang: string;
  openGraphLocale: string;
  name: string;
  nativeName: string;
  direction: TextDirection;
}>;

export const LOCALE_CONFIG: Readonly<Record<Locale, LocaleDefinition>> = {
  en: {
    code: "en",
    languageTag: "en-US",
    hreflang: "en",
    openGraphLocale: "en_US",
    name: "English",
    nativeName: "English",
    direction: "ltr",
  },
  de: {
    code: "de",
    languageTag: "de-DE",
    hreflang: "de",
    openGraphLocale: "de_DE",
    name: "German",
    nativeName: "Deutsch",
    direction: "ltr",
  },
  fr: {
    code: "fr",
    languageTag: "fr-FR",
    hreflang: "fr",
    openGraphLocale: "fr_FR",
    name: "French",
    nativeName: "Français",
    direction: "ltr",
  },
  hu: {
    code: "hu",
    languageTag: "hu-HU",
    hreflang: "hu",
    openGraphLocale: "hu_HU",
    name: "Hungarian",
    nativeName: "Magyar",
    direction: "ltr",
  },
};

export function isLocale(value: string): value is Locale {
  return (ALL_LOCALES as readonly string[]).includes(value);
}

export function isActiveLocale(value: string): value is (typeof ACTIVE_LOCALES)[number] {
  return (ACTIVE_LOCALES as readonly string[]).includes(value);
}

export function getLocaleDefinition(locale: Locale = DEFAULT_LOCALE) {
  return LOCALE_CONFIG[locale];
}
