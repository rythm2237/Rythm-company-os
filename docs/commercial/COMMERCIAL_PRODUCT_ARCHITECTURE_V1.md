# RYTHM Company OS — Commercial Product Architecture V1

**Status:** FROZEN FOR PAID PUBLIC BETA IMPLEMENTATION  
**Version:** 1.0  
**Freeze date:** 2026-08-11  
**Target launch:** 2026-08-18  
**Launch type:** B2B Paid Public Beta

---

## 1. Commercial North Star

RYTHM enables a business customer to acquire or create a governed AI-powered company while keeping consequential authority with a human CEO.

### Core positioning

> Build and run a company with a governed AI workforce.

### Commercial model

> Buy → Customize → Build

The three commercial products are intentionally ordered as an adoption ladder:

1. **RYTHM Ready Companies** — fastest path to value.
2. **RYTHM Custom Company** — RYTHM-assisted implementation for customers with specific requirements.
3. **RYTHM Company Studio** — flagship self-service company and Agent builder.

Company Studio is the strategic long-term product. Ready Companies and Custom Company are acquisition and onboarding paths into the RYTHM platform.

---

## 2. Product Names and Positioning — FROZEN

### Product 1 — RYTHM Ready Companies

**Category:** Pre-built governed AI companies  
**Primary customer:** SMBs and operators who want an operating company structure immediately without designing it themselves.  
**Promise:** Choose a company pack, provision it, and begin operating with a predefined AI workforce and governance model.

A Ready Company includes:

- predefined company structure
- predefined departments
- predefined AI Agent workforce
- reporting lines
- role responsibilities
- role-specific Agent instructions
- governed internal workflows
- Human CEO workspace
- company memory structure
- project / meeting / decision / approval / action operating loop
- audit and traceability
- runtime budget controls

Ready Companies are RYTHM-owned products at launch. Third-party marketplace sellers are not part of V1.

### Product 2 — RYTHM Custom Company

**Category:** Done-for-you governed AI company implementation  
**Primary customer:** Businesses that want a tailored AI organization but do not want to design or configure it themselves.  
**Promise:** Tell RYTHM how the business should operate; RYTHM designs, provisions, configures, and hands over the governed AI company.

The implementation can customize:

- company type
- company name
- departments
- Agent roles
- Agent names
- reporting structure
- responsibilities
- skills
- KPIs
- authority settings
- risk ceilings
- approval rules
- workflows
- company memory structure
- operational governance

Custom Company is implementation-led, not unlimited ongoing customization. Material structural changes after handover are separately chargeable. This intentionally makes repeated customization less economical than upgrading to Company Studio.

### Product 3 — RYTHM Company Studio

**Category:** Self-service no-code / low-code AI Company Builder  
**Primary customer:** Businesses that want ongoing control over their AI organizational design.  
**Promise:** Design, build, modify, and govern an AI-powered company from one workspace.

Company Studio allows authorized users to:

- create a company
- select or describe company type
- generate a proposed organization structure
- create departments
- create AI Agents
- name Agents
- select or define roles
- assign reporting lines
- define responsibilities
- define skills
- define KPIs
- set authority level
- set risk ceiling
- define Human Approval requirements
- enable / pause Agents
- clone Agents
- archive Agents
- modify company structure
- start from RYTHM templates

**Terminology rule:** Company Studio must never be marketed as "Open Source" unless RYTHM intentionally releases source code under an open-source license. V1 is proprietary, self-service, fully configurable, and no-code / low-code.

---

## 3. Launch Feature Matrix

| Capability | Ready Companies | Custom Company | Company Studio |
|---|---:|---:|---:|
| Human CEO workspace | Yes | Yes | Yes |
| Governed AI Agents | Yes | Yes | Yes |
| Projects / Ideas / Issues | Yes | Yes | Yes |
| Multi-Agent meetings | Yes | Yes | Yes |
| B-001 Executive Orchestrator | Yes | Yes | Yes |
| Company Memory | Yes | Yes | Yes |
| Decisions / approvals / actions | Yes | Yes | Yes |
| Audit / traceability | Yes | Yes | Yes |
| Runtime budget controls | Yes | Yes | Yes |
| External actions | Disabled by default | Disabled by default | Disabled by default |
| Pre-built company template | Yes | Optional | Yes |
| RYTHM-assisted company design | No | Yes | Optional later |
| Customer edits Agent details | Limited launch-safe fields | Limited after handover | Full Studio controls |
| Customer creates Agents | No | No by default | Yes |
| Customer deletes Agents | No | No by default | Archive only |
| Customer clones Agents | No | No by default | Yes |
| Customer changes reporting lines | No | Via change request | Yes |
| Customer creates departments | No | Via change request | Yes |
| Company Builder wizard | No | Internal provisioning flow | Yes |
| Agent Template Library | Uses templates | Uses templates | Customer-accessible |
| Multiple AI model providers per Agent | Post-launch | Post-launch | Post-launch |
| Third-party marketplace | Post-launch | N/A | Post-launch |
| Enterprise SSO / advanced RBAC | Post-launch | Post-launch | Post-launch |

### Launch-safe Ready Company edits

Ready Company customers may edit only fields that do not invalidate the pack's operating design:

- company display name
- Agent display names
- Agent language
- enabled / paused state
- permitted launch-level profile fields explicitly exposed by the template

Structural modifications move the customer to Custom Company or Company Studio.

---

## 4. Pricing Hypothesis — V1

Pricing remains a commercial hypothesis during Paid Public Beta, but the initial architecture and sales material should use the following reference prices until explicitly revised.

### RYTHM Ready Companies

**€249 / month + AI usage**

Includes:

- one Ready Company organization
- one selected RYTHM Company Pack
- predefined Agent workforce
- governed operating system
- core product updates

Additional Ready Company packs for the same customer are separately provisioned and priced.

### RYTHM Custom Company

**From €2,500 implementation + €399 / month + AI usage**

Implementation price increases with scope, complexity, Agent count, workflow design, and onboarding requirements. The launch quoting band is:

**€2,500–€5,000+ implementation**

After handover, material structure / workflow customization is separately quoted. Repeated customization should economically favor migration to Company Studio.

### RYTHM Company Studio

**€699 / month + AI usage**

Includes:

- Company Builder
- Agent Builder
- Agent Template Library
- ongoing organizational editing
- self-service role and reporting-line management
- governance configuration within platform limits

### AI usage charging rule

AI consumption is not hidden inside an unlimited subscription in V1. RYTHM must meter model usage independently from the platform subscription and maintain an organization-level budget ceiling.

For launch, invoices may be manually confirmed. Automated global billing is not required for Public Beta.

### Pricing architecture rule

The commercial system must model pricing as configurable data rather than hard-coded UI values so prices can be revised during beta without changing the underlying entitlement model.

---

## 5. Product Entitlement Architecture

Every organization must resolve to a commercial product entitlement.

### Minimum entitlement fields

```text
entitlement_id
organization_id
product_code
plan_code
status
starts_at
renews_at
ends_at
currency
base_price
billing_interval
ai_usage_policy
ai_budget_limit
company_template_access
company_builder_enabled
agent_builder_enabled
agent_create_enabled
agent_clone_enabled
agent_archive_enabled
agent_structure_edit_enabled
workflow_edit_enabled
max_active_agents
max_departments
max_projects
support_tier
created_at
updated_at
```

### Product codes

```text
ready_company
custom_company
company_studio
```

### Entitlement principle

UI hiding is not authorization. Every restricted capability must also be enforced server-side against the organization's active entitlement.

---

## 6. Agent Schema V1 — FROZEN CONTRACT

Agent Factory V1 must support the following conceptual schema.

### Identity

```text
agent_id
organization_id
agent_template_id (nullable)
name
role
role_code
department_id
reports_to_agent_id (nullable)
is_ai = true
```

### Mission and behavior

```text
purpose
responsibilities[]
skills[]
work_style
language
system_instructions
```

### Performance

```text
kpis[]
success_criteria[]
```

### Governance

```text
authority_level
risk_ceiling
human_approval_requirements[]
allowed_tools[]
memory_scope
external_actions_allowed = false (launch default)
```

### Runtime

```text
runtime_provider
runtime_model
runtime_policy_id
budget_policy_id
status: enabled | paused | archived
```

### Metadata

```text
created_by
created_at
updated_at
version
```

### Launch provider rule

V1 keeps one centrally controlled AI runtime policy. Per-Agent OpenAI / Claude / Gemini selection is explicitly post-launch.

### AI identity rule

Every AI Agent must be represented in the UI and system data as an AI Agent. Human-style Agent names may be used for usability, but the product must not represent an AI Agent as a human employee.

---

## 7. Agent Template Schema V1

Agent Templates are reusable RYTHM definitions from which organization-specific Agents can be provisioned.

```text
agent_template_id
template_key
name
role
role_code
department_template_key
reports_to_template_key (nullable)
purpose
responsibilities[]
skills[]
work_style
kpis[]
success_criteria[]
default_authority_level
default_risk_ceiling
default_human_approval_requirements[]
default_allowed_tools[]
default_memory_scope
default_language
system_instructions_template
runtime_policy_key
budget_policy_key
is_active
version
created_at
updated_at
```

Template changes must be versioned. Existing customer Agents must not silently inherit material governance changes without an explicit migration process.

---

## 8. Company Template Schema V1

A Company Template defines a provisionable company pack.

```text
company_template_id
template_key
name
company_type
category
description
positioning
version
status
owner = RYTHM
supported_product_codes[]
organization_defaults
department_templates[]
agent_template_refs[]
workflow_template_refs[]
governance_profile
memory_structure_template
onboarding_questions[]
launch_configuration
created_at
updated_at
```

### Provisioning principle

Provisioning a Company Template creates organization-owned instances. Customer operations must never run directly against mutable global template records.

---

## 9. Ready Company #1 — AI Advertising Agency

**Template key:** `ready_ai_advertising_agency_v1`  
**Launch status:** REQUIRED  
**Regulatory profile:** Low-regulation initial vertical; customers remain responsible for legal/commercial approval of consequential external outputs.

### Organization structure

```text
Human CEO
├── Strategy Director (AI)
├── Account Manager (AI)
├── Creative Director (AI)
│   ├── Copywriter (AI)
│   └── Content Specialist (AI)
├── Performance Marketing Specialist (AI)
└── Analytics Specialist (AI)
```

### Launch Agent count

**7 AI Agents + 1 Human CEO authority role**

### Core internal workflow

```text
Client / Business Brief
→ Account Manager structures requirements
→ Strategy Director proposes strategy
→ Creative Director develops creative direction
→ Copywriter + Content Specialist develop content concepts
→ Performance Marketing Specialist develops channel / campaign plan
→ Analytics Specialist defines measurement / interpretation
→ Multi-Agent review when needed
→ B-001 Executive synthesis
→ Human CEO decision / approval when consequential
→ Governed internal Action record
```

### External execution rule

V1 does not autonomously publish ads, spend advertising budget, send customer communications, modify third-party ad accounts, or execute other consequential external actions.

Those capabilities require a later external-action permission architecture and separate security/governance review.

---

## 10. Customer Journeys — FROZEN

### Journey A — Ready Company

```text
Public Website
→ Ready Companies
→ AI Advertising Agency
→ Purchase / activation request
→ Commercial confirmation
→ Payment / invoice confirmation
→ Signup / login
→ Organization provisioned from template
→ Human CEO onboarding
→ Ready Agent workforce visible
→ First Project
→ First governed operating loop
```

### Journey B — Custom Company

```text
Public Website
→ Custom Company
→ Requirements intake
→ RYTHM scope review
→ Quote
→ Commercial acceptance
→ Payment / invoice
→ RYTHM company design
→ Provisioning
→ Customer review / handover
→ Human CEO onboarding
→ First Project
```

### Journey C — Company Studio

```text
Public Website
→ Company Studio
→ Signup / login
→ Create organization
→ Company Builder wizard
→ Describe / choose company type
→ Answer guided operating questions
→ RYTHM proposes departments + Agents
→ Customer reviews / edits structure
→ BUILD MY COMPANY
→ Organization instances provisioned
→ Dashboard
→ First Project
```

---

## 11. Company Studio Builder V1 Input Contract

The initial Builder should ask only questions necessary to produce a useful first organization draft.

Minimum onboarding dimensions:

```text
company_name
company_type
primary_services[]
business_model
company_size_intent
required_capabilities[]
desired_ai_authority
preferred_language
```

The generated proposal must be editable before provisioning.

### Build confirmation rule

`BUILD MY COMPANY` is an explicit provisioning event. Until that confirmation, proposed departments and Agents are drafts and do not become active organizational actors.

---

## 12. Launch Scope — FROZEN

Required for Paid Public Beta:

- three commercial product categories represented in product architecture
- Ready Company #1: AI Advertising Agency
- customer signup
- customer organization ownership
- true tenant isolation
- product entitlement foundation
- Agent Factory V1
- Agent Template Library V1
- Company Template architecture
- Company Studio guided Builder V1
- Custom Company requirements intake flow
- public commercial website / sales funnel
- manual commercial confirmation / invoicing acceptable
- AI Agent disclosure
- Human CEO authority
- approval and audit controls
- organization AI budget controls
- external actions disabled by default

---

## 13. Explicit Post-Launch Scope

The following must not block the first Paid Public Beta launch:

- per-Agent model-provider selection
- Claude / Gemini per-Agent routing
- autonomous external actions
- third-party marketplace sellers
- Enterprise SSO
- advanced RBAC
- white-label custom domains
- automated global tax engine
- fully automated billing
- Legal Office Company Pack
- native mobile apps
- large template marketplace
- open-source distribution of RYTHM core

---

## 14. Governance Invariants

The commercial layer must not weaken the existing Company OS governance foundation.

1. Human CEO retains consequential authority.
2. AI Agents are visibly AI.
3. High-risk decisions route through Human Approval.
4. External actions remain independently permissioned and disabled by default for launch.
5. Every consequential workflow remains auditable.
6. Customer data is organization-isolated.
7. Entitlements are enforced server-side.
8. Agent runtime remains policy and budget controlled.
9. Template provisioning creates tenant-owned instances.
10. No commercial plan can bypass governance controls merely because it is higher priced.

---

## 15. Day 2 Engineering Contract

Day 2 may now implement Customer / Multi-Tenant Foundation against this frozen commercial model.

Minimum Day 2 acceptance test:

```text
Customer A
→ Organization A
→ Entitlement A
→ only Organization A data

Customer B
→ Organization B
→ Entitlement B
→ only Organization B data
```

Verified result must show:

- independent signup identity
- independent organization ownership
- organization-scoped queries
- server-side authorization
- RLS isolation
- no cross-tenant reads
- no cross-tenant writes
- correct entitlement resolution

---

## 16. Change Control

This document is frozen for the 2026-08-18 Paid Public Beta implementation cycle.

Changes that materially alter any of the following require an explicit commercial architecture revision rather than ad-hoc implementation:

- product categories
- entitlement model
- pricing architecture
- Agent governance contract
- Company Template contract
- launch Company Pack
- external-action policy
- Human CEO authority model

Pricing values may be revised as commercial hypotheses without changing the underlying product architecture, provided plan boundaries and governance rules remain coherent.
