# Customer workspace experience

This phase refines the native CRM UI without changing authentication, financial access, data models, or unrelated pages.

## Route inventory

- Directory: prominent create action, identity initials, status labels, existing search/pagination.
- Customer detail: breadcrumb, separate module navigation and customer section tabs; five linked relationship metrics; readable profile details.
- Profile editing: semantic identity, contact/location and business fieldsets; advanced JSON disclosure.
- Contacts, contracts, opportunities: consistent native disclosures and form controls.
- Projects, finance, documents: readable record rows, preserved canonical links and permissions.
- Activities: consistent note forms and text hierarchy.
- Insights: authorized relationship counts as a labeled horizontal chart; honest empty state.
- Leads, pipeline: shared visual system, scoped board scrolling, existing selector/drag behavior retained.
- Analytics: lead conversion donut and per-currency forecast charts alongside source tables. Forecast is not revenue or profit.
- Settings/access: common navigation, panel hierarchy and consistent form controls.

The calm background is CSS only, not a fixed layer over interactive controls. The design retains Rythm's indigo accent, light workspace surfaces and existing application shell. Layouts support small mobile, mobile, tablet and desktop, keyboard focus and reduced motion.

## Data and future customer comparison

Existing caller-bound `crm_customer_summary` and `crm_sales_report` outputs feed the server-rendered charts. No new financial queries, privileged client, cross-tenant aggregation or external chart package is introduced. Existing sensitive-access audits remain in place.

Cross-customer purchase/profit/AI usage comparison is deferred to the next phase. Purchases must use the agreed invoiced/paid basis; profit needs attributable posted costs; AI usage needs customer-linked execution/token/cost attribution. Unknown data must remain unavailable, not fabricated or zero-filled. Comparisons must be period-filtered, currency-aware and permission-filtered before aggregation.

## Validation

- TypeScript, scoped ESLint, enterprise CRM SQL/UI, sales UI/API and connected-record tests passed locally.
- Browser installation locally failed because the Chromium download was truncated. Browser validation runs in GitHub's Chrome job.
- `validate-crm-experience-browser.mjs` renders the actual seven route components plus nine customer sections with isolated auth/database/action adapters; checks layouts at 1440, 768, 390 and 320 px and native profile disclosures. This is not an authenticated production/staging E2E.
- Existing browser test retains stage moves, losses, rejected transitions, drag/drop and linked-record interactions.
