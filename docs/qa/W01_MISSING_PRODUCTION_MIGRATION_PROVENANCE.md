# W01 — blocking production migration provenance (2026-10-25)

All evidence below collected through **read-only** Supabase connector metadata APIs; no secrets, DML, DDL, customer records, or production migrations executed.

## Proven mismatch

- Production Supabase migration history: **203 entries**.
- GitHub `supabase/migrations` SQL files at the W01 branch: **218 source files**, including historical backfills and data-specific seeds. These two lists do not represent an equivalent replay path.
- Production includes authoritative migration `20260916070836_nail_2nya_booking_platform_foundation` followed by `nail_2nya_grant_hardening` (`20260916071435`) and `nail_2nya_security_performance_hardening` (`20260916071630`).
- No corresponding `20260916*_nail_2nya_booking_platform_foundation.sql` migration is present in the checked GitHub migration directory. Consequently a clean migration replay fails at `20260927061000_2nya_booking_approval_notifications.sql`, which references `public.nail_2nya_appointments` **before it has been defined**. Live read-only catalog confirms this table exists in Production.
- The remaining historical inconsistencies (legacy preflight sequencing, invalid `project_strategy_briefs.updated_at` assignment, organization-specific workforce transfer, old commercial seed constraint) have been exposed by the zero-secret disposable GitHub CI diagnostics, without patching historical repository migration files.

## Acceptance implication

Until a **complete schema-only dump** is provided or a **fully reviewed schema-only DDL reconstruction** is independently validated, W01 cannot substantiate physical schema, role grants, RLS, trigger, function and extension parity in a fully synthetic environment. A passing 16-migration core-only RLS test is insufficient. The 214/214 RLS catalog count and 338 policies count remain useful *read-only* evidence but not a proof of isolated staging.

### Required owner decision / action

A production DB admin must provide a complete **schema-only** PostgreSQL dump produced **locally and privately** from their authenticated Supabase connection; **never send passwords/URLs/API keys** and never reset Production DB password without a coordinated credential rotation and availability plan. The Supabase connector currently supports catalog reads but **not an actual client-side pg_dump stream**.

Alternative: authorize a **planned maintenance procedure** to rotate production DB credentials after identifying every dependent service. That is a production-impacting choice requiring separate explicit owner approval; W01 audit must not initiate it.

**Current acceptance: AC1 PARTIAL / AC2 PARTIAL / AC3 PASS; W01 NOT ACCEPTED.**
