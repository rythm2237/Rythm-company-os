# RYTHM Company OS — MVP Demo Scenario

## Objective

Demonstrate the full governed operating loop without enabling external actions or requiring direct database access.

## Demo organization

Organization: `RYTHM`

Primary demonstration project: `AI-PR-001 · AI Position Roadmap`

The demo uses existing governed records and safe product-development examples. It must not contain customer secrets, production credentials, private applicant data or fabricated legal approval.

## Demo path

1. **Login** — Human CEO signs in as Owner.
2. **Project Portfolio** — open `/projects` and show the project portfolio rather than a single hard-coded project.
3. **Project Operating View** — open AI-PR-001 and show stage, progress, workflow state, timeline, graph and Project Pulse.
4. **Idea / Issue Intake** — show an idea such as a customer-facing CV/career guidance capability and its project relation/revisit context.
5. **Governed Meeting** — route the idea to a draft meeting; select authorized agents and bounded AI budget.
6. **Multi-Agent Deliberation** — show persisted agent positions/challenge/synthesis and optional Human CEO contribution.
7. **Chair Closure** — demonstrate that agent synthesis does not auto-close the meeting; Human CEO confirms meeting closure.
8. **Legal Relevance** — show B-001 legal triage and, where relevant, A-106 AI Legal Review as advisory only.
9. **CEO Decision Gate** — show that the Human CEO chooses the decision and rationale.
10. **Approval / Action** — demonstrate conditional approval routing where risk requires it, then a governed project-scoped action.
11. **Progress / Pulse** — show milestone/progress feedback and the replayable Project Pulse.
12. **Traceability / Audit** — show the Decision → Approval → Action → Project chain and append-only history.
13. **Attention / Executive Review** — show pending governance/execution items and resurfaced ideas.
14. **Meeting Economics** — show tokens/provider USD cost, EUR AI cost/budget/customer-price hypothesis and estimated gross margin.
15. **Operations Health** — show Owner-only RLS, anonymous-access, append-only and recovery diagnostics.

## Demo guardrails

- Do not present the internal €19 meeting price as an approved commercial price; it is an internal MVP hypothesis.
- Do not present A-106 output as licensed legal advice or legal approval.
- Do not enable browsing/external execution merely for the demo.
- Do not create or approve a consequential CEO decision on behalf of the Human CEO.
- Do not use personal applicant CV data in the demo scenario.

## Success condition

A viewer can understand, without GitHub or Supabase intervention, how RYTHM turns a raw project input into governed analysis, Human CEO decision, accountable execution, project progress and auditable history.