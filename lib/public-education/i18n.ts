import english from "./locales/en";
import type { PublicEducationCopy, SupportedLocale } from "./types";

const localeLoaders: Record<SupportedLocale, () => Promise<PublicEducationCopy>> = {
  en: async () => english,
  de: async () => (await import("./locales/de")).default,
  fr: async () => (await import("./locales/fr")).default,
  hu: async () => (await import("./locales/hu")).default,
  fa: async () => (await import("./locales/fa")).default,
};

export const DEFAULT_PUBLIC_EDUCATION_COPY = english;

export async function loadPublicEducationCopy(locale: SupportedLocale) {
  return localeLoaders[locale]();
}
