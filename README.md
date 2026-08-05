# RYTHM Company OS

RYTHM is an AI-native Company Operating System for governed multi-agent operations, organizational memory, executive decision support, meetings, approvals, auditability, and human oversight.

## Current implementation status

- Next.js runtime deployed on Vercel
- Supabase project created
- Executive Command Center foundation implemented
- Runtime health endpoint implemented at `/api/health`
- Core PostgreSQL schema, RLS policies, audit system, approvals, meetings, decisions, memory, agent runs, and action items committed as migrations
- B-001 Executive Orchestrator remains disabled until database initialization, authentication, and approval controls are verified
- CI build workflow enabled

## Safety baseline

- Human CEO retains authority over consequential actions
- Agent execution is disabled by default
- External actions are disabled by default
- Service-role and OpenAI keys are server-only
- Database access uses organization-scoped RLS
- B-001 starts with read, analyze, prepare, coordinate, and escalate permissions only

## Initial stack

- Next.js / TypeScript
- Supabase / PostgreSQL
- Vercel
- OpenAI API
- GitHub Actions

## Repository structure

```text
app/                     Web runtime and health endpoint
lib/                     Runtime configuration and integrations
supabase/migrations/     Versioned Company Core database
 docs/                    Living Specification index
.github/workflows/       CI build verification
```

## Local development

```bash
npm install
cp .env.example .env.local
npm run dev
```

## Required configuration before database activation

1. Add Supabase URL, anon key, and service-role key to Vercel environment variables.
2. Apply `202608050001_rythm_core.sql` in the RYTHM Supabase project.
3. Create the Human CEO user in Supabase Auth.
4. Replace the placeholder CEO UUID in `202608050002_seed_company.sql`, then apply it.
5. Confirm RLS tests before enabling agent execution.
6. Add the OpenAI key only after budget controls are approved.

Never commit secrets to GitHub.

## Ownership

Human CEO and product owner: Yas
