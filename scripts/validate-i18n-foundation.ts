import assert from "node:assert/strict";
import {
  ACTIVE_LOCALES,
  ALL_LOCALES,
  DEFAULT_LOCALE,
  FUTURE_LOCALES,
  LOCALE_CONFIG,
} from "../lib/i18n/config";
import {
  getLocalizedPath,
  parseLocaleFromPathname,
} from "../lib/i18n/routing";
import { getLanguageAlternates } from "../lib/i18n/seo";

assert.equal(DEFAULT_LOCALE, "en");
assert.deepEqual(ALL_LOCALES, ["en", "de", "fr", "hu"]);
assert.deepEqual(ACTIVE_LOCALES, ["en"]);
assert.deepEqual(FUTURE_LOCALES, ["de", "fr", "hu"]);

for (const locale of ALL_LOCALES) {
  const definition = LOCALE_CONFIG[locale];
  assert.equal(definition.code, locale);
  assert.ok(definition.languageTag.length >= 2);
  assert.ok(definition.hreflang.length >= 2);
  assert.ok(definition.openGraphLocale.includes("_"));
  assert.ok(definition.direction === "ltr" || definition.direction === "rtl");
}

assert.equal(getLocalizedPath("/pricing", "en"), "/pricing");
assert.equal(getLocalizedPath("/pricing", "de"), "/de/pricing");
assert.equal(getLocalizedPath("/", "fr"), "/fr");
assert.deepEqual(parseLocaleFromPathname("/pricing"), {
  locale: "en",
  pathname: "/pricing",
  hasLocalePrefix: false,
});
assert.deepEqual(parseLocaleFromPathname("/hu/pricing"), {
  locale: "hu",
  pathname: "/pricing",
  hasLocalePrefix: true,
});

const alternates = getLanguageAlternates("/pricing") as Record<string, string>;
assert.equal(Object.hasOwn(alternates, "de"), false);
assert.equal(Object.hasOwn(alternates, "fr"), false);
assert.equal(Object.hasOwn(alternates, "hu"), false);
assert.deepEqual(alternates, {
  en: "/pricing",
  "x-default": "/pricing",
});

console.log("i18n foundation validation passed");
