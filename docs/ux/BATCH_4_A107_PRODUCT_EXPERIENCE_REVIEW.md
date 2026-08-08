# Batch 4 — A-107 Product Experience Review

Status: implemented baseline for MVP

## Review objective
Make the frozen RYTHM Company OS workflow understandable, navigable and resilient across desktop/tablet/mobile without changing governance semantics or adding new autonomous capability.

## Findings
1. Navigation was page-local and inconsistent. Users had to infer where to go next from different button sets on each screen.
2. The visual language was broadly consistent but lacked explicit reusable design tokens and accessibility focus behavior.
3. Several forms relied on inline grid widths and could overflow narrow viewports; Boardroom textarea overflow had already exposed this class of issue in Production.
4. Authenticated surfaces had no single onboarding/demo path explaining the governed operating loop.
5. Governance explanations were strong in individual pages but the end-to-end story was not surfaced as a product journey.

## Batch 4 response
### 4.1 — Product experience review
This document records the A-107 review and defines the MVP UX baseline.

### 4.2 — Information architecture and navigation
A global authenticated Product Navigation groups surfaces by user intent:
- Operate: Command Center, Project, Actions
- Govern: Ideas, Boardroom, Traceability
- Review: Attention, Executive Review, Economics, Operations Health
- MVP Guide: onboarding/demo path

Navigation never changes authority. It only exposes existing governed surfaces.

### 4.3 — Design system and UI consistency
`app/experience.css` adds MVP design tokens for surface, text, border, accent, focus, state colors, radius and shadow. Existing page-specific styles remain compatible to reduce regression risk.

### 4.4 — Accessibility and responsive UX
Baseline controls include:
- skip-to-content link
- visible keyboard focus
- 44px minimum interactive target height for primary controls
- global max-width/overflow protection
- safe wrapping for long text and identifiers
- responsive form/grid fallback
- reduced-motion support
- active navigation announced with `aria-current=page`

### 4.5 — Onboarding and demo experience
`/onboarding` provides a six-step governed operating guide and a five-minute stakeholder demo sequence using real Production surfaces.

## Explicit non-goals
- no broad visual rebrand
- no native mobile app
- no new billing or checkout
- no external actions
- no autonomous decision authority
- no live voice UX; deferred after Production testing

## Production acceptance
Batch 4 can close when:
1. Global Product Navigation renders on authenticated surfaces but not Login.
2. `/onboarding` renders for an authenticated organization member.
3. Navigation reaches the major MVP surfaces without 404s.
4. A narrow/mobile viewport does not create horizontal page overflow on the guide and primary workflow pages.
5. Keyboard focus is visible and the skip link works.
6. Existing governed workflow remains operational.
