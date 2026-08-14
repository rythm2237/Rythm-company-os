# Public Demo Education V1

## Scope

This slice adds an application-level Experience Mode, a multilingual Guided Tour, and contextual Explain RYTHM help to the existing public Nova Commerce Demo. It does not create a parallel Demo, add a dependency, change authentication, alter entitlements, or require a database migration.

## State model

- `tourState`: `closed`, `prompt`, or `active`. Finish closes and cleans the Tour immediately; there is no intermediate completion overlay that can remain mounted.
- `explainMode`: available only while the Tour is closed. Opening or starting the Tour closes Explain Mode so overlays cannot collide.
- `experienceMode`: orthogonal to the education state and stored for the browser session. It is automatically cleared when leaving `/demo`.
- Tour completion/dismissal, selected language, and the one-time Experience Mode discovery cue are stored locally. A supported browser language becomes the initial education language unless the visitor has already chosen one.

## Localization

English is the eager fallback. German, French, Hungarian, and Persian dictionaries are dynamically imported when selected. Guided Tour, Explain RYTHM, and the Demo education toolbar use the same typed copy contract. Persian direction is scoped to education surfaces and uses the locally hosted, OFL-licensed Vazirmatn variable font with a production-safe fallback stack. Latin brand typography is unchanged.

The nine-step Tour is intentionally mental-model oriented: Human CEO authority, operating context, AI workforce, accountable Projects and Actions, Boardroom, Traceability, Executive Review/Attention/Economics/Operations Health, and Company Builder/Templates/Ideas.

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

Education events are `tour_prompt_seen`, `tour_started`, `tour_language_selected`, `tour_step_viewed`, `tour_skipped`, `tour_completed`, `explain_mode_enabled`, `explain_mode_disabled`, `explanation_viewed`, `experience_mode_discovered`, `experience_mode_entered`, and `experience_mode_exited`.

## Responsive and accessible behavior

- The primary immersive layout does not depend on the browser Fullscreen API.
- Tour dialogs trap focus and return it after dismissal; Escape dismisses the active overlay.
- Explain content is reachable through mouse hover, keyboard focus/activation, and touch. On touch, the first tap explains an interactive target and a second tap intentionally performs its action.
- Contextual explanations become a bottom sheet on small screens.
- Experience Mode keeps its exit control inside the Demo toolbar.
- Motion is restrained and disabled under `prefers-reduced-motion`.
- Invalid legacy education preferences fail open to a clean Tour prompt.
- Responsive verification covers 1440px, 1280px, 1024px, 768px, and 390px, including Persian expansion and viewport-edge positioning.
