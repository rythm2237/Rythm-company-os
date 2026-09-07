# RYTHM internationalization foundation

## Current release state

- Default and only active locale: `en`
- Registered future locales: `de`, `fr`, `hu`
- Default locale keeps the existing unprefixed URLs, for example `/pricing`.
- Future localized URLs use locale prefixes, for example `/de/pricing`, `/fr/pricing`, `/hu/pricing`.
- Future locales must not be activated until translation, legal/content review, navigation coverage, metadata coverage, and QA are complete.

## Foundation modules

- `lib/i18n/config.ts`: locale registry, language tags, Open Graph locales, text direction, active/future release gates.
- `lib/i18n/messages/`: translation catalog boundary and English fallback.
- `lib/i18n/routing.ts`: deterministic localized path generation and locale-prefix parsing.
- `lib/i18n/seo.ts`: canonical and `hreflang` alternate generation based only on active locales.

## Activation procedure for a new locale

1. Add and review the locale's message catalog.
2. Localize public-page content and metadata.
3. Localize signup/onboarding, validation, error, email, notification, and help content in scope.
4. Validate long-text layout and responsive behavior.
5. Validate legal/privacy copy for the target market where required.
6. Add locale-aware route handling for the translated page set.
7. Add the locale to `ACTIVE_LOCALES` only after the translated route set is complete.
8. Validate canonical URLs, `hreflang`, sitemap entries, structured data, and no mixed-language pages.
9. Release behind a controlled rollout and verify Production.

## Release principle

Registration is not activation. A locale can exist in the architecture without being exposed to users or search engines. This prevents partial localization from creating duplicate-content, mixed-language, or indexing problems.
