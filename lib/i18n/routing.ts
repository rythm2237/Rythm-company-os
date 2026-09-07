import {
  ACTIVE_LOCALES,
  DEFAULT_LOCALE,
  isActiveLocale,
  isLocale,
  type Locale,
} from "@/lib/i18n/config";

function normalizePath(path: string) {
  if (!path || path === "/") return "/";
  return path.startsWith("/") ? path : `/${path}`;
}

export function getLocalizedPath(path: string, locale: Locale = DEFAULT_LOCALE) {
  const normalized = normalizePath(path);
  if (locale === DEFAULT_LOCALE) return normalized;
  return normalized === "/" ? `/${locale}` : `/${locale}${normalized}`;
}

export function getActiveLocalizedPath(path: string, locale: Locale = DEFAULT_LOCALE) {
  if (!isActiveLocale(locale)) {
    throw new Error(`Locale is registered but not active: ${locale}`);
  }
  return getLocalizedPath(path, locale);
}

export function parseLocaleFromPathname(pathname: string): {
  locale: Locale;
  pathname: string;
  hasLocalePrefix: boolean;
} {
  const normalized = normalizePath(pathname);
  const [firstSegment = ""] = normalized.slice(1).split("/");

  if (!isLocale(firstSegment)) {
    return { locale: DEFAULT_LOCALE, pathname: normalized, hasLocalePrefix: false };
  }

  const stripped = normalized.slice(firstSegment.length + 1) || "/";
  return {
    locale: firstSegment,
    pathname: stripped.startsWith("/") ? stripped : `/${stripped}`,
    hasLocalePrefix: true,
  };
}

export function getActiveLocalePaths(path: string) {
  return ACTIVE_LOCALES.map((locale) => ({ locale, path: getLocalizedPath(path, locale) }));
}
