# W15 — Pilot monitoring, incident response and SLO candidate runbook

Status: **feature-branch implementation; actual Preview log verified, manual recipient emails tested; automated alert transport/ack not yet accepted**. The SLOs below are **candidates**, not an approved paid SLA.

## Verified baseline (2026-11-20)

- GitHub `main` commit `8f69550c9a21629eb2c29520bbdd3466823219a7`, after W14 PR #465.
- Vercel production deployment `dpl_AwfbAQNWABHy95txdADinoMhu5mm`, READY, same GitHub SHA.
- Supabase production project `dezbacyuvsdrlpmmpjht` ACTIVE_HEALTHY, existing `public.operational_incidents`.
- Production read-only grouped incident snapshot: 4 open medium-severity incidents; **not** a complete per-request failure baseline.
- A scoped 30-minute Vercel sample showed 72 info events and no error/fatal log records under a separate filter. This does **not** establish an uptime number.
- Existing owner-only diagnostics: `app/(app)/operations/health/page.tsx`; existing W13 dispatcher trace and health DB; W14 scheduler failure classifications.
- Actual on-call rota, alert transport, delivery confirmation, historical request denominator and per-route latency percentiles: **UNVERIFIED / UNCONFIGURED**. Do not mislabel them healthy.

## Safe log contract

- Server-only `instrumentation.ts` classifies uncaught errors into fixed route families.
- `lib/observability/pilot.ts` emits `rythm_pilot_incident_v1`: only `event,environment,traceId,surface,severity,outcome,code,httpStatus,durationMs`. Trace IDs are generated server-side UUIDv4, not taken from user input.
- No stack trace, exception message, request path, URL, query, raw headers, auth token, user/organization ID, prompt, payment payload or provider response is added to W15 signals.
- `app/api/admin/automation/dispatch/route.ts` emits P1 on failed tasks and P0 when the scheduler itself cannot run, returning 503 and `X-Trace-Id`.
- W13 project scheduler retains its original DB lease, tenant-safe trace and governance; W15 adds fixed P0 log signals for scheduler-wide failures and P1 for partial steps. No retry/replay behavior or Human CEO approval gate changes.
- `/api/health` emits a safe P0 configuration-readiness signal when it returns 503, without recording environment variable values.

## Candidate service objectives (30-day rolling, not a contractual SLA)

- Core routes, auth, billing, scheduler and background jobs: **99.5% successful requests**.
- Onboarding and AI tools: **99% successful requests**.
- Denominator is only valid when a reliable telemetry source collects ALL eligible requests; count genuine server errors, timeouts and failed scheduler cycles with documented inclusion/exclusion and sampling.
- Error budget = floor(eligible request count × (1 − target)) − failed requests. **Unknown** until complete measurement, never calculate from `operational_incidents` alone.
- Availability, p50/p95/p99 latency, request volumes and alert-delivery success must be baselined separately using an approved provider. Do not use Vercel short-retention logs alone for a 30-day SLO.
- Staging and production must be segmented; synthetic probes cannot contaminate customer SLO denominators.
- **Critical guard:** Vercel's project-wide Runtime Errors aggregation was observed mixing a Preview synthetic `rythm_pilot_incident_v1` event into the project error groups. Each new event therefore carries a fixed trusted `environment` field. Configure Production alert rules to require `environment=production` AND `code != SYNTHETIC_OUTAGE` (and provider-side deployment/target filters where possible); staging runs must use `environment=preview`. Never treat an unfiltered project-wide error group as a Production incident. The environment field alone does not implement alert delivery.

## Severity, ownership and first response

| Severity | Trigger | Proposed acknowledgement | Proposed escalation |
| --- | --- | --- | --- |
| P0 | Production unavailable, privileged auth failure at scale, billing integrity risk, scheduler entirely stopped, tenant isolation/security breach | 15 minutes | Immediately notify primary on-call and backup; escalate to owner if unacknowledged at 15 minutes |
| P1 | Partial scheduler failures, critical feature degraded, recurrent high error budget burn | 60 minutes | On-call investigates, notify project owner on continued degradation |
| P2 | Isolated lower-impact failures with workaround | Next business day | Queue for normal triage |

**Accountable project owner:** the repository owner `rythm2237` is the accountable review contact, **not** an assumed active pager/on-call engineer. **Pilot contact roles provisionally identified, but on-call acknowledgment remains unproven.** Two authorized email destinations are stored privately as encrypted Vercel variables bound only to branch `pilot/w15-incident-observability`: `RYTHM_P0_ALERT_PRIMARY_EMAIL` and `RYTHM_P0_ALERT_BACKUP_EMAIL`. The primary and backup have **not** been confirmed as separate human responders or as an active, staffed 24/7 rota. Addresses must not be copied into this public repository. Acknowledged paging, escalation and owner coverage still need acceptance. An unattended log line is not a delivered alert.

## Incident procedure (tabletop script)

1. **Detect** through an approved independent synthetic uptime monitor and server event/incident ledger. Record UTC detection time, fixed surface, safe code, deployment SHA and generated `traceId`. Do not capture PII.
2. **Triage**: identify severity and customer-facing effect; use Vercel Runtime Logs correlation, Supabase aggregate scheduler health, last deployment, and migration history. Avoid `service_role` dumps or customer data.
3. **Acknowledge** via the configured on-call channel. Preserve ack timestamp and escalation outcome. A P0 without a tested delivered acknowledgement remains an acceptance **FAIL**.
4. **Contain**: revert risky feature/disable the affected execution switch using existing `docs/PRODUCTION_RUNBOOK.md`. No automatic retries of side-effecting AI, billing, proposals, emails, or approved actions.
5. **Recover** using reviewed PR, staging validation, explicit owner authorization, and approved rollback/deployment. Do not change production schema or RLS during incident triage without approval.
6. **Verify** synthetic endpoint recovery and stable scheduler results; track 30-day error budget after monitoring is reliable. Close incident with impact, root cause and corrective action.
7. **Review** at postmortem within two business days for P0; preserve immutable evidence, safe timestamps and trace IDs.

### Synthetic exercise (automated offline)

`npm run test:w15`: creates a fake P0 billing outage, sends its fixed nine-field record to an **in-memory collector**, asserts no fake token/email/URL leakage, verifies routing, budget math and acknowledgement/containment progression. This is **NOT** a real alert sent to any human.

### Hosted isolated preview synthetic error gate

- Dedicated endpoint: `GET /api/internal/w15/synthetic-outage`, **only when** `VERCEL_ENV=preview` and `VERCEL_GIT_COMMIT_REF=pilot/w15-incident-observability`.
- Does not call Supabase, any provider, AI, billing, emails, customer services, or external actions. Returns a synthetic HTTP 503 and `X-Trace-Id`, and writes exactly one environment-labelled allowlisted P0 `SYNTHETIC_OUTAGE` incident to the server runtime logger.
- It is protected by the current Vercel preview SSO setting; check protection before exercising. Production and all other branches return 404.
- Verify actual Preview response and correlating Vercel Runtime Logs within Hobby plan's **one-hour retention**. Filter for `rythm_pilot_incident_v1`; redact output before retaining evidence. **No actual paging occurs from this endpoint.**
- The probe must never be reused as an uptime denominator or counted as a customer incident.

### Hosted staging delivery gate (pending)

1. Select an authorized non-production staging environment and ensure no live customer data or provider charges.
2. Configure a dedicated, human-approved test alert sink through the observability provider dashboard. Do not paste endpoint tokens into chat or commit them.
3. Produce a synthetic 503 in a disposable, isolated route or fixture, NOT a production outage, and verify request `X-Trace-Id` → server log → alert rule → destination delivery → documented ack.
4. Run structured-log sampling against staging and reject samples containing email, bearer token, URL query, customer ID, prompts or exception stack. Simulate missing sink/unacknowledged P0 and confirm escalation.
5. Record receipt timestamps, alert destination identity (not credentials), trace IDs, staging SHA, dashboard evidence and responsible human owner.

## Release and rollback

- Before merge: abandon the feature branch/close PR; production is unchanged.
- After separate approval: revert the W15 commit, rebuild, stage and promote the approved rollback; existing incident table and W13/W14 functionality must remain unchanged.
- No new database migration is required for W15's current read-only owner UI.
- Keep P0 alert-delivery, owner roster, 30-day SLO evidence and hosted staging acceptance open until externally verified.

## Executed staging-only evidence (2026-11-20)

- On protected Vercel Preview deployment `dpl_5XUt2rmrRxsb47voazxrpYRuBQbq` (`5a4a57c068df2ae40268a5c308c19a71668bf26c`), `GET /api/internal/w15/synthetic-outage` returned **HTTP 503** with JSON `synthetic:true`.
- The response `X-Trace-Id` matched the generated response body UUID `a5f13220-a890-4830-9d04-3b4cef848e52`.
- A scoped read of that Preview deployment's Vercel runtime logs located `rythm_pilot_incident_v1` with the **same trace identifier**. The filtered sample did not contain email-address patterns, Bearer credentials, Stripe key prefixes or Resend key prefixes. This was an earlier eight-field sample; the subsequent nine-field event contract adds environment scoping. No raw log body was copied into the report.
- This validates **HTTP injection → structured runtime event correlation** on an actual hosted Preview. It does NOT validate a live human alert, acknowledgement or escalation. This was not a Production incident.
- Native Vercel log-drain listing was inaccessible (API 404) and Observability schema unavailable (API 404); the Hobby log retention limit is one hour. Long-term SLO/error-budget denominator and reliable alert transport remain **unknown**.
- Existing verified Resend sending domains were inspected read-only, but no recipient, operational on-call roster or W15 incident transport is configured. No email or external message was sent.

## Manually authorized notification test (2026-11-21)

- User explicitly approved a one-time P0 alert-email drill and specified one primary and one backup contact.
- Two clearly labelled `TEST ONLY` messages were sent through the **authenticated Gmail account**, one to each destination. Sending returned a Gmail message ID for each; both appear in the sender's Sent folder. A Gmail search showed the primary test in the connected primary Inbox. The backup address belongs to a different destination, so actual receipt/reading there is **not independently verified** through this connection.
- The test message named the **Preview** synthetic `SYNTHETIC_OUTAGE` event and its prior trace, and explicitly stated that it was **manually sent**; no Production outage or customer action was induced.
- Both contact addresses are provisioned as **encrypted, Preview-branch-only Vercel environment variables**. They are deliberately omitted from the public code, logs and PR body. Provisioning a contact is not evidence that any alert worker reads it.
- Vercel already has an existing Production-scoped sensitive `RESEND_API_KEY`, but **this W15 Preview branch does not have a Resend sender credential**; no key was copied or decrypted and no production variable was changed. The sender identity, alert rule, transport wiring, human acknowledgement and automatic fallback/escalation are still missing.
- The real operator-facing delivery acceptance chain `P0 trigger → configured monitoring → provider → primary accepted/delivered → human acknowledgement → backup escalation` remains **OPEN**. Do not close AC1/AC2 based on a manually sent Gmail message.

## Fail-closed P0 email transport (implementation 2026-11-21)

- `lib/observability/p0-alert-mailer.ts` now implements opt-in, server-side Resend email attempts. It is called from fixed P0 paths including uncaught errors, both dispatchers, billing webhook failures and health readiness failures. The existing safe structured incident log remains independent of email availability.
- Only an **explicit** `RYTHM_P0_ALERT_EMAIL_ENABLED=true` activates transport; Preview also requires branch match, Production requires **additional explicit** `RYTHM_P0_PRODUCTION_ALERTS_APPROVED=true` and a separately approved deployment. Neither enabling flag has been set. The transport cannot send without `RESEND_API_KEY`, approved sender `RYTHM_P0_ALERT_FROM` and two contacts. The W15 Preview contacts are configured but the Preview Resend key and sender are not.
- Both primary and backup are attempted concurrently, via independent fixed 15-minute Resend idempotency keys. There is one bounded retry for a transient failure and a 4-second timeout per attempt. Payload contains only fixed environment, code, subsystem and UTC incident time window; never a user ID, exception, tenant, URL, raw trace or key. Provider body, email address and secrets are never logged.
- This is **immediate dual notification**, not an ack-driven escalation or durable outbox. Provider acceptance does not prove delivery. No claim of a live 15-minute SLA is made without human acknowledgment and separately tested alert persistence.
- `npm run test:w15` also runs an offline mock Resend acceptance, retry, suppress, idempotency and log privacy test. No real provider is contacted in CI. Real alert acceptance stays OPEN pending sender/credential setup and independently verified staging event-to-inbox delivery.

### Preview-to-Resend synthetic test wiring

The branch-locked synthetic 503 probe now also calls `deliverPilotP0Alert` with its fixed `SYNTHETIC_OUTAGE` event. With the two Preview-only opt-in flags presently set to **false**, it does not make any external network request. After the separately authorized staging sender, sending-only Resend key, and test flags are configured, the same protected endpoint can validate **injection → safe log → two independent Resend acceptances → mailbox receipt**. Do not enable it on Production. This remains an unexecuted live-transport acceptance gate.
