# RYTHM Company OS — MVP v1.0 Scope Freeze

Status: **Frozen for implementation**  
Scope owner: **Human CEO / Product Owner**  
Scope authority: **Human CEO**  
Target release: **RYTHM Company OS MVP v1.0**

## 1. MVP objective

The MVP must prove one complete governed company-operating loop:

`Login → Project → Idea/Issue → Multi-Agent Meeting → Executive Summary → Legal Triage/Review when relevant → Human CEO Decision → Action → Project Progress → Memory/Audit`

The MVP is successful when a Human CEO can use RYTHM to operate a real project through this loop without relying on direct database work or external orchestration.

## 2. Product principle

RYTHM MVP is not a generic chat application. It is a governed AI-native Company Operating System in which:

- agents advise, analyze, coordinate, and escalate;
- the Human CEO retains consequential decision authority;
- decisions, actions, meetings, legal review, memory, and progress are auditable;
- external actions remain disabled unless separately approved;
- agent work is bounded by runtime, budget, risk, and governance controls.

## 3. In-scope capabilities for MVP v1.0

### A. Identity and organization
- Human CEO authentication.
- Owner authorization.
- Organization-scoped access control and RLS.
- Active RYTHM organization context.

### B. Executive Command Center
- CEO landing page with current company/project state.
- Attention items requiring Human CEO action.
- Navigation to projects, actions, meetings, memory, approvals, and idea management.

### C. Projects and Project Pulse
- Create/read governed projects.
- Project stage and progress percentage.
- Project progress nodes/events.
- Current governed step, blockers, and next step.
- Project Pulse milestone notification.

### D. Company Memory
- Governed organizational memory records.
- Approved/draft/archive lifecycle.
- Project-linked and decision-linked memory.
- Human-approved source of truth for important company context.

### E. Actions and execution planning
- Decision/action linkage.
- Action owner, status, deadline/priority where applicable.
- Approved 90-day execution planning workflow.
- Action completion evidence/auditability.

### F. Multi-Agent Meeting Engine
- Create/start governed meetings.
- Select/authorize agents.
- Two or more deliberation rounds.
- Persistent agent turns.
- B-001 synthesis.
- Human CEO optional participation.
- Meeting-language support.
- Summary language selection.
- Resume/retry after transient runtime failure.
- AI budget cap and usage tracking.

### G. Human CEO Decision Gate
- Decision options after deliberation.
- CEO rationale.
- Risk classification.
- Low/medium direct CEO resolution.
- High/critical route to governed Approval Request.
- Human authority cannot be bypassed by agents.

### H. Legal Review Gate
- B-001 legal relevance triage.
- CEO may request legal review manually.
- A-106 Legal & Regulatory Counsel advisory review.
- Calibrated strategic vs execution-level legal applicability.
- Standard outcomes: CLEAR, CLEAR_WITH_CONDITIONS, RISK_IDENTIFIED, LICENSED_COUNSEL_REQUIRED.
- Licensed-counsel requirement blocks legally sensitive execution, not unrelated strategic direction.

### I. Idea Register / Idea Intake
- Central Idea Register as the MVP source of truth.
- Category, related project/capability, status, assigned/relevant agent, reason to revisit, and revisit trigger.
- Ideas can be surfaced into relevant future meetings.
- Idea capture does not automatically modify MVP scope.

### J. Audit and governance
- Audit events for consequential agent/runtime/CEO actions.
- Meeting, legal review, approval, decision, and progress history retained.
- Agent and Human CEO roles distinguishable in audit history.
- External-action state visible and enforced.

### K. AI cost visibility
- Token usage and estimated provider cost captured for agent sessions.
- Meeting AI budget cap enforced.
- CEO-facing commercial display standard is EUR.
- Provider reconciliation may retain native provider currency internally.

### L. Reliability baseline
- Production build passes CI.
- Agent retry/resume behavior.
- Empty-output protection.
- Structured-output/fallback handling for governed outputs.
- Clear user-visible error state without corrupting the governed record.

### M. MVP UX baseline
- Coherent navigation.
- CEO workflow understandable without database access.
- Responsive enough for desktop and practical mobile review.
- Experimental/audit-only data is not confused with active user content.

## 4. Required MVP completion work still allowed inside the frozen scope

The following are **completion work**, not scope expansion:

- finishing missing UI for already frozen capabilities;
- fixing defects and reliability issues;
- security/RLS hardening;
- exposing meeting cost in EUR;
- finalizing Idea Inbox UI over the existing register;
- weekly executive review workflow using existing meeting/idea/action primitives;
- notification/attention aggregation for existing governed objects;
- export of a meeting decision brief if it does not create a new external-action capability;
- onboarding and demo data needed to operate the frozen workflow;
- observability, QA, backup/recovery, release documentation.

## 5. Explicitly out of scope for MVP v1.0

The following are deferred unless approved through the MVP Scope Exception process:

- autonomous external actions by agents;
- autonomous email sending, purchasing, hiring, contracting, payments, or production changes;
- public multi-tenant self-service billing and payment checkout;
- marketplace for third-party agents;
- full enterprise SSO/SCIM;
- advanced HR/ERP/CRM replacement modules;
- unrestricted custom workflow builder;
- multi-provider AI routing marketplace;
- customer-facing white-label customization;
- native mobile applications;
- real-time voice/video meetings;
- jurisdiction-specific formal legal advice;
- fully autonomous legal approval;
- advanced financial accounting/ERP ledger;
- complex subscription monetization engine;
- external licensed-counsel integrations;
- large-scale analytics/BI suite beyond MVP operational observability;
- open development of unrelated new features during MVP stabilization.

## 6. MVP scope-change rule

After this freeze, a new capability enters MVP only when all are true:

1. It is necessary to complete the frozen end-to-end operating loop or remove a release blocker.
2. B-001 records the reason and impact.
3. Relevant risk/legal review is performed when indicated.
4. Human CEO explicitly approves the scope exception.
5. The exception is recorded in the repository and audit trail before implementation.

Ideas that are valuable but not required for MVP remain in the Idea Register for post-MVP review.

## 7. Definition of MVP Complete

MVP v1.0 is complete only when:

- every `Must Pass` item in `docs/mvp/MVP_ACCEPTANCE_MATRIX.md` passes in Production;
- the complete governed operating loop is demonstrated end-to-end;
- no known Critical release blocker remains open;
- security and RLS verification is complete;
- production configuration and recovery steps are documented;
- Human CEO approves the final MVP Release Gate.

## 8. Release discipline

Continue the established implementation rule:

`feature branch → implementation batch → CI/build verification → single merge to main → single Production deployment`

Database migrations are versioned. When a new migration lands on `main`, it must be explicitly applied to Production in order and verified before the related feature is considered complete.
