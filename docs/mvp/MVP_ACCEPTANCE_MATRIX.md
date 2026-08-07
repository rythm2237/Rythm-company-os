# RYTHM Company OS — MVP v1.0 Acceptance Matrix

Status values: `PASS`, `PARTIAL`, `NOT STARTED`, `BLOCKED`.

A release candidate cannot be called MVP v1.0 until every **Must Pass** item is `PASS` in Production.

| Area | Must Pass | Acceptance condition |
|---|---|---|
| Authentication | Yes | Human CEO can sign in and session state is protected. |
| Owner authorization | Yes | Non-owner users cannot perform Owner-only operations. |
| Organization RLS | Yes | Cross-organization reads/writes are prevented by RLS. |
| Executive Command Center | Yes | CEO can see current operating state and reach governed workflows without DB access. |
| Project state | Yes | Project stage, progress, current step and next governed step are visible and persistent. |
| Project Pulse | Yes | Progress event changes produce governed milestone feedback without duplicate active notifications. |
| Company Memory | Yes | Approved memory can be created/read and is organization-scoped. |
| Action management | Yes | A governed decision can produce trackable action(s) with persistent status. |
| Meeting creation/start | Yes | Meeting lifecycle can move from preparation to running under authorized CEO control. |
| Agent selection | Yes | Only authorized agents participate in a meeting session. |
| Multi-agent deliberation | Yes | At least 2 rounds persist valid agent output and survive refresh/retry. |
| Empty output protection | Yes | Empty model output is not recorded as a valid deliberation turn. |
| B-001 synthesis | Yes | Completed deliberation produces a decision-oriented synthesis/recommendation package. |
| CEO participation | Yes | Human CEO can optionally add a contribution and later agents receive it as context. |
| Meeting language | Yes | Meeting can operate in a selected language. |
| Summary language | Yes | CEO can request/regenerate summary in a selected language independently of transcript language. |
| Meeting summary | Yes | Long meeting can be reduced to decision-focused summary, risks, disagreements and next step. |
| Legal triage | Yes | B-001 identifies plausible legal relevance and explains why. |
| A-106 legal review | Yes | Requested review returns a persistent calibrated advisory outcome. |
| Legal calibration | Yes | Strategic direction is not blocked solely because later implementation may be regulated. |
| Licensed counsel gate | Yes | Concrete legally sensitive execution can be gated when licensed counsel is required. |
| CEO Decision Gate | Yes | CEO selects option, enters rationale and risk; agent cannot finalize consequential decision itself. |
| Approval routing | Yes | High/critical decisions create governed approval flow instead of silent execution. |
| Audit history | Yes | Meeting, review, decision, approval and key runtime events are attributable and persistent. |
| External actions disabled | Yes | Production runtime enforces external-action policy unless separately authorized. |
| AI budget cap | Yes | Session cannot silently exceed configured AI budget. |
| Token/cost capture | Yes | Session records token usage and estimated provider cost when rates are configured. |
| EUR CEO display | Yes | CEO-facing meeting economics are displayed in EUR. |
| Idea Register | Yes | New idea can be stored with category, project relation, status, agent relevance and revisit trigger. |
| Idea resurfacing | Yes | Relevant idea can be included in a related meeting or recurring executive review context. |
| Weekly Executive Review | Yes | A repeatable weekly review workflow can cover risks, ideas, open decisions, escalations and actions. |
| Attention/notification view | Yes | CEO can identify pending decisions, approvals, legal reviews, blockers and overdue work. |
| Failure recovery | Yes | Retry/resume works for transient agent/serverless failures without duplicating valid turns. |
| User-visible errors | Yes | Failure is understandable and governed records are not silently corrupted. |
| Navigation/UX | Yes | Core MVP loop is operable from UI without GitHub/Supabase intervention during normal use. |
| Desktop usability | Yes | Core workflow is usable on target desktop browsers. |
| Mobile review usability | No | CEO can at least review key summaries/decisions on mobile. |
| Demo organization/data | Yes | A safe demo scenario demonstrates the entire MVP operating loop. |
| Onboarding | Yes | A new authorized CEO can understand the first-project/first-meeting flow. |
| Security review | Yes | Auth, server secrets, API routes, RLS, service-role use and agent execution controls are reviewed. |
| Observability | Yes | Production errors and AI runtime failures can be diagnosed. |
| Backup/recovery documentation | Yes | Database/config recovery procedure is documented and tested at least once at MVP level. |
| Production CI | Yes | Release commit passes `npm install` and `npm run build`. |
| Production deployment | Yes | Release candidate is deployed successfully to Production. |
| End-to-end acceptance | Yes | `Login → Project → Idea → Meeting → Summary → Legal Review when relevant → CEO Decision → Action → Project Progress → Audit` completes successfully. |
| Final Human CEO Release Gate | Yes | Human CEO explicitly approves the MVP v1.0 release candidate. |

## Release-blocking severity

- **Critical:** security boundary failure, unauthorized consequential execution, data isolation failure, corrupted decision/audit history, unusable core operating loop.
- **High:** one Must Pass capability cannot complete reliably in Production.
- **Medium:** degraded UX or non-core workflow issue with a documented workaround.
- **Low:** cosmetic or non-blocking improvement.

MVP release requires zero known Critical blockers and Human CEO acceptance of any remaining non-Critical known issues.
