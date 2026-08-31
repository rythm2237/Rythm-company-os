# Advertising Agency Specialist Certification Audit — 2026-08-31

## Objective
Bring the actively used RYTHM Advertising Agency workforce to at least Specialist through evidence-backed, sequential certification. No agent is promoted from title alone.

## Current state
Already Specialist or above:
- GTM-STRAT-001 — GTM Strategist — Specialist, verified, score 94

Active agency agents still at Associate and requiring a domain benchmark before promotion:
- STRATEGY_DIRECTOR — Advertising Strategy Director
- CREATIVE_DIRECTOR — Advertising Creative Director
- COPYWRITER — Advertising Copywriter
- CONTENT_SPECIALIST — Advertising Content Specialist
- PERFORMANCE_MARKETING — Performance Marketing Specialist
- ANALYTICS_SPECIALIST — Advertising Analytics Specialist
- ACCOUNT_MANAGER — Advertising Account Manager
- AI-001 — Graphic Designer
- ADV-FIN-001 — Finance Operations Manager
- ADV-LEG-001 — Legal & Compliance Advisor

Deferred because runtime is paused:
- ADV-OPS-001 — People & AI Workforce Operations Manager

All active agency agents above have a source-backed Role Foundation. Finance and Legal also have active specializations; Graphic Designer has a design specialization.

## Certification rule
Specialist requires:
- at least 1 completed evaluation
- average score >= 85
- zero governance violations
- sequential level transition Associate -> Specialist

## Implementation direction
1. Generalize the professional-assessment runner so it resolves a Specialist benchmark by canonical role instead of being hard-coded to Senior GTM Strategist.
2. Seed one source-backed domain benchmark for each active Associate agency role.
3. Keep external actions disabled in evaluation mode.
4. Run each benchmark through the canonical AI Request Gateway with an independent judge.
5. Auto-promote only when `agent_level_readiness(..., 'specialist')` returns eligible.
6. Keep failed or conditional agents at Associate and surface the evidence gap instead of forcing promotion.
