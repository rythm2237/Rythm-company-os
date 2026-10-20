# Landing page — approved boardroom motion preview

## Review scope

Preview branch: `preview/landing-ai-boardroom-motion`.
Base: `main` at `5dda1c965d6b64338515ccc5fd67f33e95cc6b98`.

The user approved the photorealistic AI team around an executive table and asked to try the landing page around that exact scene on an isolated branch. The geometric WebGL reconstruction was rejected. This implementation preserves the approved artwork and its lighting, and applies camera/light motion directly in Canvas 2D.

## Changes

- Replace the homepage's diagram card with an image-based animated boardroom hero, a shorter business-oriented headline, and the existing demo/product entry routes.
- Use the original artwork as a local 280 KB WebP asset. No WebGL, video decoder, API key, external asset host or new npm package is required.
- Keep a server-rendered priority image visible before JavaScript and if the animation cannot initialize.
- Add play/pause, OS reduced-motion support, responsive canvas sizing, offscreen/background suspension and unmount cleanup.
- Stack the message above the full scene on narrow screens; use the artwork's original negative space for desktop copy.
- Continue the palette through a four-part operating foundation and three public experience cards, then return to the existing product content.
- Keep the homepage guide opt-in through Learn RYTHM. The previous automatic modal covered the artwork and intercepted the motion control; the launcher and guided experience remain available.

## Boundaries

This is a visual experiment for review. Navigation destinations, sign-in logic, company creation, entitlements, AI runtime, approvals, database and canonical SEO metadata remain on their existing implementations. The scene is labelled illustrative and does not report live agent activity. No production release or main-branch merge is part of this request.

## Validation

The motion renderer had already passed live browser play/pause/reduced-motion, resize, cleanup and seamless-loop checks before integration. Integration validation covers the real homepage, asset loading, motion controls, the explicit guide launcher, CTA destinations, responsive layouts, lint, TypeScript and the repository build checks. Physical-device frame-rate testing remains a release follow-up.
