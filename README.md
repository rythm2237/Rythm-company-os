# RYTHM Company OS

RYTHM is an AI-native Company Operating System for governed multi-agent operations, organizational memory, executive decision support, meetings, approvals, auditability, and human oversight.

## Current implementation status

- Next.js runtime deployed on Vercel Production.
- Supabase/PostgreSQL Company Core active with organization-scoped RLS.
- Secure Human CEO authentication and Owner authorization active.
- Executive Command Center and Company Memory interfaces implemented.
- Project execution planning and Project Pulse implemented.
- Governed Multi-Agent Meeting Engine implemented with persistent deliberation, retry/resume, Human CEO participation, multi-language summaries, and B-001 synthesis.
- A-106 Legal & Regulatory Counsel implemented with B-001 legal triage and calibrated advisory Legal Review Gate.
- Human CEO Decision Gate and approval routing remain authoritative for consequential decisions.
- Idea Register established as the source of truth for future ideas and revisit triggers.
- Agent execution is permitted only under runtime policy and budget controls; external actions remain disabled.
- CI build workflow enabled.

## MVP v1.0 scope

The MVP scope is frozen for implementation. The target governed operating loop is:

`Login → Project → Idea/Issue → Multi-Agent Meeting → Executive Summary → Legal Triage/Review when relevant → Human CEO Decision → Action → Project Progress → Memory/Audit`

MVP governance documents:

- `docs/mvp/MVP_SCOPE_V1.md`
- `docs/mvp/MVP_ACCEPTANCE_MATRIX.md`
- `docs/mvp/MVP_SCOPE_CHANGE_CONTROL.md`

New ideas do not automatically enter MVP. Material scope additions require an explicit Human CEO-approved scope exception.

## Safety baseline

- Human CEO retains authority over consequential actions.
- Agent execution is policy-controlled and budget-bounded.
- External actions are disabled by default and remain disabled for the current MVP scope.
- Service-role and OpenAI keys are server-only.
- Database access uses organization-scoped RLS.
- B-001 can orchestrate governed internal analysis but cannot bypass Human CEO authority.
- A-106 provides advisory AI legal issue-spotting, not formal licensed legal advice.

## Initial stack

- Next.js / TypeScript
- Supabase / PostgreSQL
- Vercel
- OpenAI API
- GitHub Actions

## Repository structure

```text
app/                     Web runtime, UI, and API routes
lib/                     Runtime configuration and integrations
supabase/migrations/     Versioned Company Core database
docs/                    Living specifications, MVP governance, and Idea Register
.github/workflows/       CI build verification
```

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Production discipline

- Never commit secrets to GitHub.
- Use `feature branch → implementation batch → CI/build verification → merge to main → Production deployment`.
- Apply new Supabase migrations to Production in version order after they land on `main`.
- Do not enable external actions as part of MVP without a separate governed decision and security review.

## Ownership

Human CEO and product owner: Yas
