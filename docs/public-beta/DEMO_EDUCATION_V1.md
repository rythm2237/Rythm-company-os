# Public Demo Education V1

## Scope

This slice adds an application-level Experience Mode, a multilingual Guided Tour, and contextual Explain RYTHM help to the existing public Nova Commerce Demo. It does not create a parallel Demo, add a dependency, change authentication, alter entitlements, or require a database migration.

## State model

- `tourState`: `closed`, `prompt`, `active`, or `complete`.
- `explainMode`: available only while the Tour is closed. Opening or starting the Tour closes Explain Mode so overlays cannot collide.
- `experienceMode`: orthogonal to the education state and stored for the browser session. It is automatically cleared when leaving `/demo`.
- Tour completion/dismissal and the selected language are stored locally. Browser language is suggested, never forced.

## Localization

English is the eager default. German, French, Hungarian, and Persian dictionaries are dynamically imported when selected. Guided Tour and Explain RYTHM use the same typed copy contract. Persian direction is scoped to education surfaces and uses a lightweight system-font fallback strategy rather than adding a blocking web-font request.

## Demo safety boundary

`DemoWorkspace` continues to read only the typed `NOVA_COMMERCE_DEMO` fixture. Its interactions only update React state, local storage, or session storage. No Supabase client, server action, RPC, API mutation, tenant loader, or external-action path is imported by the Demo education layer.

The Demo therefore remains:

- public and authentication-free;
- synthetic and isolated from Production tenant data;
- read-only and temporary;
- incapable of creating, modifying, or invoking Agents;
- incapable of provisioning a company or bypassing entitlement checks;
- incapable of consequential external actions.

## Analytics boundary

`trackPublicExperienceEvent` emits a vendor-neutral `rythm:public-experience` browser event. Payloads contain only fixed interaction metadata such as locale, concept, source, and destination—never identity, tenant data, or visitor-entered text. A future analytics adapter can subscribe without coupling product components to a vendor.

## Responsive and accessible behavior

- The primary immersive layout does not depend on the browser Fullscreen API.
- Tour dialogs trap focus and return it after dismissal; Escape dismisses the active overlay.
- Explain content is reachable through mouse hover, keyboard focus/activation, and touch tap.
- Contextual explanations become a bottom sheet on small screens.
- Experience Mode keeps its exit control inside the Demo toolbar.
- Motion is restrained and disabled under `prefers-reduced-motion`.
