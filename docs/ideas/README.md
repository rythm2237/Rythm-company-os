# RYTHM Idea Management

This directory is the canonical repository-level inbox for ideas that are worth remembering but are not yet approved work.

## Principle

Ideas are not commitments. They are captured so they can be revisited at the right strategic, product, commercial, operational, governance, technical, research, or customer-experience checkpoint.

The canonical register is `docs/ideas/idea-register.md`.

## Required fields

Every idea should have:

- **Idea ID** — stable ID such as `IDEA-2026-001`
- **Captured** — date first recorded
- **Category** — e.g. Monetization, Product, UX, Governance, Architecture, Operations, Research, Sales, Marketing
- **Related project / capability** — e.g. RYTHM OS, Meeting Engine, AI-PR-001
- **Status** — Inbox, To Review, Under Evaluation, Accepted, Deferred, Rejected, Converted to Decision/Action
- **Suggested review owner** — the agent or Human CEO role best suited to review it
- **Idea** — concise statement of the concept
- **Why it may matter** — expected value or problem addressed
- **Questions / assumptions to validate** — what must be tested before adoption
- **Revisit trigger** — when this idea should be surfaced again
- **Links** — related meeting, decision, action, PR, or research if one exists

## Operating workflow

1. **Capture immediately.** When the Human CEO raises a potentially useful idea, record it without requiring a full analysis.
2. **Classify, do not over-design.** Assign a category, project/capability, owner, and revisit trigger.
3. **Keep it non-binding.** `Inbox` and `To Review` ideas do not change product scope or authorize work.
4. **Surface at the right checkpoint.** Before a relevant governed meeting or planning session, B-001 should review the register and pull in matching open ideas.
5. **Convert deliberately.** If an idea is adopted, link it to the resulting Decision, Action Item, project milestone, or implementation PR and update its status.
6. **Preserve rejected/deferred ideas.** Do not delete them; retain the reasoning and revisit trigger when useful.

## Suggested agent routing

- **B-001 Executive Orchestrator** — intake/triage and ensuring relevant ideas are surfaced at the correct meeting or planning checkpoint.
- **A-101 Strategy Analyst** — business model, positioning, product strategy, pricing hypotheses, market scope.
- **A-102 Operations Analyst** — operating model, execution feasibility, staffing/workflow implications.
- **A-104 Risk & Compliance Analyst** — governance, legal/compliance, security, approval/risk implications.
- **A-105 Research Analyst** — evidence gathering, market validation, competitor/customer research needs.

## Future productization

A later RYTHM feature can turn this repository convention into an **Idea Inbox / Opportunity Register** in the application, backed by the database, with filters, agent routing, meeting suggestions, reminders, and conversion into Decisions or Action Items. Until then, this register is the source of truth.
