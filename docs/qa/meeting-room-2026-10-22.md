# Meeting Room reengineering — verification record

## Root causes and implementation

- The room image used `object-fit: cover`, while overlays used independent stage percentages. Cropping changed the visible LCD/chair positions without changing overlays. A contained, aspect-ratio canvas now shares the original 1672 × 941 image coordinates with the LCD and chair markers. Original room imagery and lighting are retained.
- LCD content had unrestricted grid minimum sizes, viewport-based typography and no pagination. `PresentationScreen.tsx` measures the rendered safe area using the same typography and footer as the visible slide. `paginateSlides` splits long titles and bullet text at fitting word boundaries (or Unicode character boundaries for unbroken text). Text is preserved rather than excerpted away. Minimum body size is 12px on the physical LCD and 15px in the simplified mobile view.
- Participant indices wrapped around arbitrary positions, producing duplicate seats and screen collisions. Six stable seat IDs alternate left/right by depth. Existing assignments survive joins, departures and list reorderings. Additional participants remain available in the participant panel, with a scene shortcut. Four agents get two seats on each side. Foreground CEO placement remains central.
- Shared Button wraps its children in a content span. Existing grid/flex rules targeted direct children, breaking participant rows and markers. Local wrapper-aware rules restore alignment without changing the shared Button or unrelated screens. Raw agent codes are hidden in fallback portraits and participant descriptions.
- Desktop panels use smaller tracks; tablet landscape defaults to collapsed drawers. At widths up to 900px, a presentation-first composition retains the room identity and provides participants/agenda as disclosures. All essential controls and workspace navigation remain available.
- Actions now have primary/secondary/destructive hierarchy, pending feedback, disabled explanations, focus states, Escape dismissal, an inert closed rail and reduced-motion handling. End Meeting requires explicit confirmation and the existing synthesis-complete condition. Server authorization and approval rules are unchanged.
- Real agenda data was not passed from the page into the console. It is now supplied. After closure, Governance can dismiss the immersive overlay to expose the existing server-governed CEO decision form.

## Components and checks

Changed: `DeliberationConsole.tsx`, `boardroom-immersive.module.css`, `page.tsx`.
Added: `PresentationScreen.tsx`, `presentation-layout.ts`, `validate-boardroom-layout.ts`, isolated QA harness and browser tests. CI now runs `test:boardroom`.

| Viewport | Long-content pages | Screen containment | LCD/participant collisions |
|---|---:|---|---:|
| 1920 × 1080 | 10 | Pass | 0 |
| 1440 × 900 | 14 | Pass | 0 |
| 1366 × 768 | 15 | Pass | 0 |
| 1024 × 768 | 15 | Pass | 0 |
| 768 × 1024 | 7 | Pass | 0 |
| 390 × 844 | 12 | Pass | 0 |

These unusually long test cases include a repeated 600+ character title and a 1000+ character agenda description. Ordinary meeting content occupies fewer pages. The suite checks every generated page, not only the first one.

- TypeScript: passed.
- Lint: 0 errors; 27 pre-existing warnings outside changed components.
- Full Next.js build: passed, including the repository's prebuild security/project regressions and postbuild lifecycle checks.
- Pagination unit checks: all bullet/title characters retained; capacity respected.
- 1, 2, 4 and 9-agent browser cases: passed; unique visible seats capped at six.
- Join/departure seat stability: passed.
- Active speaker indication: passed after a governed test response.
- Double-click on Next Action: one request; second intentional turn: one additional request.
- End Meeting: no request on initial click or cancellation; one after confirmation. Escape dismissal passed.
- Files, Reports, Settings and Meeting History route selection: passed against the router test adapter.
- CEO decision-form access after closure: passed.
- Browser runtime and console errors: none in the isolated suite.
- Rendered screenshots captured at all six sizes, with ordinary and long-content cases. Desktop, tablet and mobile layouts were visually inspected. The QA screenshot archive contains the exact results JSON.

## Evidence boundary and release gate

Browser QA renders the real production console, shared Button and styles with isolated test props. Next Image/router use test adapters; meeting API responses are intercepted. This verifies rendering and client interactions, not authenticated server integration or model execution. The harness is a developer script, not a production route, and no test data is inserted into the database.

The existing production room redirects the available browser to the Human CEO sign-in page. Authenticated Preview interaction, real transcript/agenda verification, server approval integration and final production visual inspection remain pending. PR #428 remains a draft. Do not merge or claim production completion until those checks pass. No migration, approval-policy change or production data change was made.

## Reproduce

```bash
npm ci
npm run test:boardroom
npm run typecheck
npm run lint
npm run build
# Install Playwright as a local QA dependency, if unavailable, then install its browser.
node scripts/qa/boardroom-visual.mjs
```

The browser script starts its isolated component harness in the same process. `BOARDROOM_CHROMIUM` can select an installed Chromium executable; `BOARDROOM_QA_OUTPUT` selects a screenshot directory. Defaults write only to `/tmp/rythm-boardroom-qa`. This script never calls production services.
