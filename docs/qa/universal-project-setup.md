# Guided project setup validation

## Implemented path

`/projects` uses the existing CRM-linked project transaction and one human accountable manager. The four setup screens combine brief, CRM/resource context, AI lead selection and review. Advanced setup remains available. Creation does not execute the delivery roadmap or authorize external actions.

The intake naming endpoint uses the existing budgeted AI gateway with required telemetry. A bounded organization-scoped in-process cache avoids repeat naming requests for unchanged briefs. Provider failure returns an editable deterministic professional name. The original description remains separate from the name. Capability/category/resource profiles are deterministic suggestions shared between preview and the creation action; AI output cannot replace authorization, capabilities or server classification.

Submitted URLs remain `planned` with unknown access. No URL is fetched during setup. Context records distinguish submitted references and inferred classification from confirmed setup choices. No financial or contractual content is sent to naming or shared discovery.

Browser drafts are scoped to organization, user and starting customer. They survive navigation/reload in that browser. They do not synchronize across devices. Browser-storage failure is visible. A stable request UUID maps to the existing organization/project-code uniqueness constraint. Retries resume a partially created setup; completed setup retries reuse the project without another lead reservation. Assignment/resource failures are recorded as incomplete setup and surfaced in the project workspace.

## Checks

- `node --import tsx scripts/validate-project-intake.ts`: professional fallback names, original objective preservation, resource relevance, validated AI names and safe submitted URL forms.
- `node --import tsx scripts/validate-project-setup-action.ts`: exercises the actual server action with mocked authentication/database boundaries, including an assignment exception after project creation, failed resource persistence, successful recovery and repeat submission. Asserts one CRM creation, one created audit and no extra lead reservation after complete setup.
- `RYTHM_BROWSER_EXECUTABLE=/tmp/rythm-chromium/chromium node scripts/validate-project-setup-browser.mjs`: actual Chromium component fixture at desktop `1440×1000`, tablet `768×1024`, mobile `390×844`. Checks input validation, provider-failure fallback, customer resource reuse, edited draft restoration, disabled unsuitable specialists, manual selection, final form values and no document horizontal overflow or page errors. Screenshots are written under `test-results/project-setup/`.

The browser harness substitutes API responses and the final action. It verifies the real React component and browser behavior, not production authentication, live AI naming, production RLS or a deployed database assignment transaction. Those boundaries require the corresponding integration/release checks.

## Remaining limits

Drafts use browser storage rather than a server draft table. Naming caching is process-local with a fifteen-minute TTL. The extensible intake profile registry is a conservative suggestion layer; deeper industry diagnosis belongs to discovery. The wizard opens the created project's discovery workspace; it never silently launches governed execution. No production customer record was modified by these tests.
