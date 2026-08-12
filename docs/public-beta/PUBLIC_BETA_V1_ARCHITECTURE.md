# RYTHM Company OS — Public Beta Customer Journey V1

**Status:** architecture baseline after Phase 0  
**Date:** 2026-08-12  
**Production:** `https://company.rythm-os.com`  
**Repository:** `rythm2237/Rythm-company-os`

This document is the implementation contract for Public Beta Customer Journey V1. It extends the existing Production architecture; it does not authorize a broad rewrite, weaker RLS, or global capability enablement.

## A. Current Production assessment

- Vercel Production is healthy on commit `addce1adeabfd4ec05d23b8e41bd392754b63b32`, the migration-sync-only successor to verified foundation commit `b2c87ed11a899eafc0fd5f7fbebb017d76e25f57`.
- The current public foundation has Landing, Pricing, Enterprise/Assisted Build entry, Login, Signup, Password Recovery, and isolated public/auth/app route groups.
- Authentication, tenant-scoped organization context, Human CEO/Owner authority, RLS, active-entitlement checks, Company Builder, Agent Studio, templates, meetings, governance, and audit foundations are present.
- The public visual foundation is credible and should be extended rather than replaced. The current journey, however, exposes product selection and pricing before adequate product experience.
- No runtime errors were reported by Vercel after the migration-sync Production deployment. Four older error clusters belong to earlier deployments: signup mail rate limiting, an old organization-status enum mismatch, a missing PKCE verifier, and a same-password reset attempt.
- Supabase reports 29 older security warnings outside the commercial catalog hardening scope. They remain a separate hardening phase.

### Phase 0 Production smoke matrix

| Area | Flow | Result | Evidence / remaining action |
|---|---|---:|---|
| Public | `/` | PASS | Landing renders with public shell, Human CEO governance, and commercial foundation. |
| Public | `/pricing` | PASS | Four configured offers render from the public commercial catalog. |
| Public | `/contact` | BLOCKED | Page renders, but direct Enterprise intake depends on `NEXT_PUBLIC_SALES_EMAIL`; no form or configured sales channel is currently visible. |
| Public | Product overview routes | FAIL | Dedicated Product, Demo, Solutions, Templates, and Live AI Meeting routes do not yet exist. |
| Auth | `/login` | PASS | Email/password access and Forgot Password entry render. |
| Auth | `/signup` | PASS / journey gap | Account creation works structurally and does not ask Company Name, but a hidden product defaults to Company Studio and the next-step copy assumes provisioning. |
| Auth | `/forgot-password` | NEEDS MANUAL USER TEST | Form renders; actual email delivery was not triggered during a non-mutating smoke test. |
| Auth | reset callback without session | PASS | Fails closed and redirects to Login with an expired/missing-session message. |
| Auth | auth callback without code | PASS | Fails closed and redirects to Login with an invalid/expired-link message. |
| Protected | 22 Company OS route families | PASS | Unauthenticated access redirects to `/login?next=...`; tested Command, Projects, Actions, Agents, Builders, Templates, Meetings, Reviews, Operations, Runtime, and Traceability. |
| Pending entitlement | backend authorization | PASS | Pending organizations resolve inactive; one pending organization intentionally has multiple capability flags set to true but remains blocked by active-entitlement guards. |
| Pending entitlement | activation status | PASS by code / NEEDS MANUAL USER TEST in UI | `/activation` exposes organization, selected product, and entitlement status to the authenticated Owner. |
| Pending entitlement | Agent/Company/Template mutations | PASS | Server Actions require active Owner context; RPCs check active status/capabilities; RLS and table triggers enforce active entitlement. |
| Active entitlement | backend authorization | PASS | An authenticated RYTHM member resolves the active legacy founder entitlement; pending organizations do not. |
| Active entitlement | full UI journey | NEEDS MANUAL USER TEST | Requires an authorized active test session; no credentials were created or reused during the audit. |

## B. Source-control drift assessment

- Supabase Production migration history contains `20260812145919 commercial_security_catalog` and `20260812150327 commercial_security_catalog_grant_hardening`.
- Production has four public offers, RLS enabled on `commercial_offers`, three active commercial mutation triggers, SELECT-only access for `anon` and `authenticated`, and closed management/mutation privileges.
- The repository previously lacked the exact file for `20260812150327`.
- PR #74 added `supabase/migrations/20260812150327_commercial_security_catalog_grant_hardening.sql` without applying SQL to Production. GitHub Actions and Vercel Preview passed before squash merge.
- GitHub and Production now record the same grant-hardening behavior. The migration must not be re-applied manually unless a future environment proves the statements idempotent and actually lacks the migration.

## C. Customer Journey V1 map

```text
DISCOVER
  Landing / Product / Solutions
    → EXPLORE
      Public Templates / Product Tour
        → EXPERIENCE
          Read-only Demo / Live AI Meeting entry
            → UNDERSTAND
              Governance, memory, operating loop, product boundaries
                → COMPARE
                  Simple comparison → optional detailed matrix
                    → CHOOSE
                      Ready / Custom / Enterprise / Trial Meeting
                        → SIGN UP
                          Account identity only
                            → CONFIGURE
                              "What do you want to build?"
                                → PROVISION
                                  Company Name requested here
                                    → ONBOARD
                                      Product-specific setup
                                        → OPERATE
                                          Existing Company OS
```

Signup is a persistence boundary, not an exploration gate. Product choice is retained only when explicitly made by the visitor; it is not silently defaulted before the guided choice step.

## D. Public information architecture

| Navigation item | Route | Purpose |
|---|---|---|
| Product | `/product` | Explain the governed Company OS and operating loop. |
| Demo | `/demo` | Enter the isolated Nova Commerce read-only demo. |
| Solutions | `/solutions` | Segment by business outcome and organization type. |
| Templates | `/templates` | Discover curated Ready Company and workforce patterns without provisioning rights. |
| Pricing | `/pricing` | Decision-friendly product comparison, then detailed matrix on demand. |
| Enterprise | `/enterprise` | Enterprise Beta positioning and qualified contact entry. |
| Live AI Meeting | `/live-ai-meeting` | Explain the one-off governed experience and its boundaries. |
| Login | `/login` | Existing customer access. |
| Get Started | `/signup` | Create an account only after the visitor chooses to persist, purchase, or provision. |

The public shell must never import tenant-aware App Shell data loaders. Public template descriptions are curated projections, not anonymous access to tenant templates or instances.

## E. Authenticated information architecture

| Stage | Route | Responsibility |
|---|---|---|
| Account | `/signup`, `/login`, password routes | Identity only; no Company Name. |
| Solution selection | `/start` | Ask: Ready Company, Custom Company, or Enterprise Workforce. |
| Configuration | `/start/ready`, `/start/custom`, `/start/enterprise` | Product-specific configuration or Enterprise handoff. |
| Provisioning | `/setup/company` | Ask Company Name and create the tenant only after a valid path is selected. |
| Activation | `/activation` | Show entitlement state and permitted workspace surfaces; keep commercial mutation locked while pending. |
| Onboarding | `/onboarding` | Product-aware onboarding for an activated organization. |
| Operation | existing `(app)` routes | Command, Projects, Meetings, Governance, Builders, Reviews, and Operations. |

## F. Product × Entitlement Matrix

`Ready AI Company` maps to `ready_company`. `Custom AI Company` maps to the existing `company_studio` entitlement. Legacy `custom_company` remains backward-compatible but is not the new self-service product label. Enterprise is contact-led in Public Beta and receives no implied self-service entitlement.

| Capability | Ready Company V1 | Custom Company V1 | Enterprise Workforce Beta | Enforcement / note |
|---|---|---|---|---|
| Company Builder | OFF | ON | Scoped deployment | Active entitlement + `company_builder_enabled`; Enterprise is not self-service in V1. |
| Agent Builder | OFF | ON | Scoped by contract/RBAC | Active entitlement + `agent_builder_enabled`. |
| Create Agent | OFF | ON within limit | Scoped | Active entitlement + `agent_create_enabled` + DB limit. |
| Clone Agent | OFF | ON within limit | Scoped | Active entitlement + `agent_clone_enabled`. |
| Archive Agent | OFF structurally | ON | Scoped | Ready needs a separate limited lifecycle control; do not reuse full Studio access. |
| Agent customization | Launch-safe profile fields only | Full allowed fields | Role-scoped | Structural fields require `agent_structure_edit_enabled`. |
| Included Agents | Template-defined | Customer-created and template-started | Contract-defined | Instances are organization-owned; templates never operate directly. |
| Additional Agents | Future paid add-on | Allowed within plan | Contract capacity | Requires catalog/limit update, never a UI-only unlock. |
| Departments | Template-defined | Create/edit within limit | Department-scoped | `max_departments`; Ready structure immutable. |
| Custom hierarchy | OFF | ON | Advanced | Requires active entitlement and structural edit authorization. |
| Company Memory | Persistent, organization-scoped | Persistent, organization-scoped | Department-aware future | Existing tenant RLS; knowledge permissions need a later explicit model. |
| Projects | Included within limit | Included within limit | Contract-defined | `max_projects`; existing organization RLS. |
| Meetings | Included | Included | Included/scoped | Existing governed meeting architecture. |
| Human approvals | Required | Required/configurable within policy | Advanced workflow | Human CEO authority cannot be disabled by product choice. |
| External actions | Disabled by default | Disabled by default | Explicit controlled rollout only | No Public Beta entitlement globally enables external actions. |
| Automation | Limited/no consequential automation | Governed future capability | Controlled integrations | Separate feature and approval boundary required. |
| Governance | Standard template policy | Configurable within ceilings | Advanced | Server and DB enforcement, not presentation only. |
| Audit / Traceability | Included | Included | Advanced retention/export later | Organization-scoped audit records. |
| Economics | Core usage/budget view | Advanced usage/budget view | Contract reporting | AI usage remains separately metered. |
| Agent limit | Template pack / current plan | Current plan (`max_active_agents`) | Contract capacity | Authoritative DB value. |
| Department limit | Template pack / current plan | Current plan (`max_departments`) | Contract capacity | Authoritative DB value. |
| User limit | Beta default; field missing | Beta default; field missing | Contract/RBAC | Add explicit `max_users` before enforcing commercial user tiers. |
| Knowledge permissions | Organization-wide launch baseline | Organization-wide + future scopes | Departmental scopes planned | Requires additive schema/RLS; do not simulate with frontend filters. |
| Agent training permissions | Owner only baseline | Owner/authorized role future | Department manager future | Requires explicit RBAC and audit events. |
| Enterprise capabilities | N/A | N/A | SSO/RBAC/departments/audit roadmap | Contact-led; unavailable capabilities must not appear purchased. |

Important current gap: Ready customers need limited Pause/Enable and safe profile edits without receiving Agent Builder. This requires dedicated capabilities and endpoints; it must not be solved by setting `agent_builder_enabled = true`.

## G. Demo architecture

- Use `/demo` inside the public route group with a dedicated `DemoShell`, not the authenticated `AppShell`.
- Source V1 from versioned, typed synthetic fixtures such as `lib/demo/nova-commerce.ts`. Do not query Production tenant tables.
- Model Nova Commerce with 12 AI Agents, 4 departments, 7 active projects, 3 CEO approvals, meetings, decisions, actions, memory excerpts, traceability, attention items, and operational metrics.
- Reuse pure presentational components only. Any component that resolves auth, organization context, Supabase, or mutation actions must remain outside the Demo bundle.
- Demo interactions are local navigation, filtering, drawer/modal inspection, and deterministic simulation. There are no consequential POST requests, external tools, secrets, tenant identifiers, or persistent writes.
- Show an always-visible `Demo workspace · Synthetic data · Read only` boundary and provide a deterministic Reset Demo action.
- Track meaningful interaction events using privacy-conscious public analytics when that layer is introduced.

## H. Live AI Meeting architecture

- Model the offer in the commercial catalog as a configurable experience, not a hard-coded €10 button.
- Require authentication when the visitor chooses to purchase/persist the meeting. Exploration and configuration preview remain public.
- Reuse the existing meeting domain: participants, agenda, context, contributions, interventions, decisions, actions, approvals, summary, and traceability.
- Add a temporary workspace/meeting-pass boundary rather than creating an ordinary subscription organization with broad capabilities.
- Enforce configurable limits: one objective, duration, AI usage budget, participant count, context size, expiry, and output retention.
- Exclude persistent Company Memory, ongoing Projects, automation, permanent workforce, continuous training, and permanent governance structures.
- Payment webhook activation must be trusted server-side and idempotent. The browser never writes entitlement/payment state directly.
- Store structured output separately from persistent Company Memory. Offer subscription conversion after completion, with an optional configurable credit window.
- Public Beta slice 1 provides architecture and entry. Full checkout and live execution require separate migrations, payment-provider selection, and acceptance testing.

## I. Pricing / Offer architecture

- `commercial_offers` remains the public source for availability, labels, numeric prices, currency, billing interval, CTA, and product mapping.
- Frontend fallbacks are resilience copies, not a second authority. Keep them centrally defined and observable when used.
- Add an `experience`/trial category and resource-limit configuration through an additive migration before listing Live AI Meeting as purchasable.
- Keep Product, Offer, Plan, Entitlement, Subscription/Order, Organization, and Meeting Pass as separate concepts.
- Conversion credit is a dated rule (`eligible_offer`, `credit_amount`, `window_days`, `active_from`, `active_until`), not checkout-component logic.
- Enterprise availability remains `contact_sales`; it must not mint a self-service entitlement.

## J. UX/UI system direction

- Retain the existing quiet light surface, deep navy operational panels, restrained indigo signal color, strong typography, and high-contrast governance language.
- Add motion only for state transition, hierarchy, activity, and context. Respect `prefers-reduced-motion`.
- Treat Agents as organizational members: identity, role, department, manager, authority, risk, activity, approval state, and recent work.
- Use a shared status vocabulary: Working, Waiting, Needs approval, In meeting, Paused, Offline, and Blocked.
- Build progressive disclosure into comparison, Agent detail, governance evidence, and Demo navigation.
- Use accessible focus states, semantic landmarks, keyboard-operable drawers/dialogs, status text in addition to color, skeletons for async content, and responsive navigation.
- Conversion prompts are based on meaningful interaction depth. Dismissal minimizes to a persistent, reversible `Build with RYTHM ✦` control.

## K. Route map

| Route | Exposure | V1 action |
|---|---|---|
| `/` | Public | Refine discovery narrative and lead to Product/Demo before pricing. |
| `/product` | Public | Add. |
| `/demo` and `/demo/[surface]` | Public, synthetic | Add read-only Demo V1. |
| `/solutions` | Public | Add. |
| `/templates` | Public, curated | Add discovery-only library. |
| `/pricing` | Public | Refactor to simple comparison + detailed disclosure. |
| `/enterprise` | Public | Add canonical Enterprise entry; preserve `/contact` compatibility. |
| `/live-ai-meeting` | Public | Add product entry and configuration preview. |
| `/login`, `/signup`, recovery routes | Public auth | Preserve; remove implicit default product selection. |
| `/start` | Authenticated | Add guided solution choice. |
| `/setup/company` | Authenticated | Keep provisioning; remove product choice from the Company Name form. |
| `/activation` | Authenticated | Preserve pending status and fail-closed guidance. |
| existing `(app)` routes | Protected | Preserve and integrate after activation. |

## L. Database changes

The first public IA and Demo slices require **no database migration**.

Planned additive migrations, each separately reviewed:

1. Extend commercial offer types/resources for Live AI Meeting and structured availability.
2. Add explicit commercial limits currently missing: users, meeting resources, knowledge scopes, and limited Ready Agent controls.
3. Add order/payment-event/meeting-pass tables with idempotency keys and lifecycle timestamps.
4. Add temporary meeting workspace/output records and expiry/retention policies while reusing existing meeting entities where safe.
5. Add conversion-credit rules and redemption audit records.
6. Add Enterprise lead intake only when owner, retention, and access policies are defined.

No Demo tenant or anonymous Production tenant access is required.

## M. Security / RLS impact

- Preserve SELECT-only public commercial catalog access. No anonymous catalog writes, function execution expansion, or service-role exposure.
- Keep active entitlement as a required predicate in Server Actions, RPCs, RLS policies, and commercial mutation triggers.
- Public pages use curated public data or static synthetic Demo fixtures only.
- Public template discovery does not grant `company_template_access` and does not call provisioning RPCs.
- Pending users may read permitted organization/activation state but cannot create or modify Agents or departments, write Builder drafts, or provision templates.
- Live AI Meeting payment, pass activation, resource accounting, lifecycle, and conversion credit require server-side trusted operations plus user-readable RLS.
- Enterprise knowledge and departmental permissions are deferred until explicit RBAC/RLS contracts exist.

## N. Public Beta V1 scope

1. Migration/source synchronization and Production smoke test — complete.
2. Public navigation and Product/Solutions explanation.
3. Main product-tour placement and extensible tour metadata.
4. Isolated Nova Commerce Demo V1.
5. Public template discovery.
6. Product-family comparison and progressive pricing detail.
7. Enterprise Beta entry with a functioning intake channel.
8. Live AI Meeting positioning, configuration preview, and commercial architecture.
9. Signup followed by guided solution selection, then Company Name at provisioning.
10. Product-aware onboarding into the existing Command Center.
11. Interaction-depth conversion prompt with reversible dismissal.

## O. Deferred scope

- Full self-service Enterprise checkout, SSO, advanced RBAC, and departmental knowledge.
- Third-party template marketplace.
- Full Live AI Meeting checkout/execution until payment and temporary-workspace migrations are approved.
- Permanent automation and consequential external actions.
- Advanced Agent training permissions and human-manager delegation.
- All product-tour videos; V1 ships placements, metadata, and at least one main tour experience.
- Remediation of the 29 pre-existing Supabase security advisories, tracked as a separate hardening release.

## P. Implementation sequence

| Slice | Outcome | Migration |
|---:|---|---:|
| 0 | Production audit, migration sync, smoke test | Already synchronized |
| 1 | Public IA foundation: navigation, Product, Solutions, Enterprise canonical route, tour metadata | No |
| 2 | Synthetic Nova Commerce Demo shell and key read-only surfaces | No |
| 3 | Public Templates discovery and progressive product comparison | No, unless public projections move to DB |
| 4 | Guided `/start` selection and provisioning handoff | Prefer no DB change initially |
| 5 | Live AI Meeting entry/configuration preview and commercial schema migration | Yes |
| 6 | Interaction-depth conversion prompt and analytics events | No DB if external analytics; otherwise reviewed event schema |
| 7 | Product-aware onboarding, accessibility/performance pass, Production acceptance | Only if entitlement gaps are addressed |

Every slice uses a dedicated branch and PR, passes type-check/build/relevant tests, receives a security review, and creates at most one Production deployment from `main` after CI.

## Q. Risks and blockers

| Risk / blocker | Impact | Mitigation |
|---|---|---|
| Enterprise sales channel is not configured | Current `/contact` is not a complete conversion path | Configure an owned address or build governed lead intake before promotion. |
| No authorized active/pending browser test sessions were provided | Full signed-in UI acceptance remains manual | Run the documented active and pending acceptance scripts with controlled test users. |
| Existing product taxonomy has legacy names/codes | UI/entitlement drift is possible | Centralize public family definitions and preserve explicit backward mappings. |
| Capability flags can be true while status is pending | UI-only checks could unlock features | Continue active-entitlement gating at every mutation layer; add regression tests. |
| Ready limited Agent controls lack dedicated entitlement fields | Temptation to enable Agent Builder globally | Add narrowly scoped capabilities and endpoints in a later migration. |
| Signup currently defaults to Company Studio metadata | Violates guided-choice journey | Remove implicit product default and route confirmed accounts through `/start`. |
| Trial checkout/provider is not selected | Full paid meeting cannot ship safely yet | Ship product architecture/preview first; select provider before order migration. |
| 29 older Supabase advisories | Security debt remains visible | Handle in a separate, tightly scoped hardening release. |
| Public Demo could drift from the real product | Misleading experience | Version fixtures and shared presentation contracts; never share authenticated data loaders. |
| Animation can harm performance/accessibility | Premium UX could regress usability | Motion budgets, reduced-motion support, Web Vitals, keyboard and screen-reader acceptance. |

## Release invariant

A capability flag alone never unlocks commercial mutation. The authoritative condition remains authenticated membership + required Human CEO/Owner authority + active entitlement window + relevant capability/limit + RLS/RPC/trigger enforcement.
