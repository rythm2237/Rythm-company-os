# Batch 4 Multi-Project UX Adjustment

## Problem
Several MVP surfaces were implicitly built around AI-PR-001. RYTHM Company OS is an organization operating system and must support multiple concurrent projects without making the application shell project-specific.

## Adjustment
- `/projects` is the organization Project Portfolio / Project Hub.
- Project cards summarize status, stage, progress, priority, assigned agents, open actions, decisions and target date.
- Project-specific operating views are opened with an explicit project identifier.
- `/actions` includes an organization project filter and preserves that filter when navigating between actions.
- Project Pulse remains available as both an automatic governed progress transition and a replayable visual progress control.
- Project-specific pages must prefer an explicit `project` context rather than hard-coded project codes.

## MVP boundary
This is a UX and information-architecture correction inside Batch 4. It does not add autonomous execution, billing, external actions, or a generic workflow builder.
