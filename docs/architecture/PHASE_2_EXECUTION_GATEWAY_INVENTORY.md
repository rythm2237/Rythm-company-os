# Phase 2 Integration & Execution Inventory

Audit baseline: `main@1737dba`. Scope is limited to Phase 2; Phase 1 Gateway behavior is preserved.

## Classification key

| Class | Meaning                          |
| ----- | -------------------------------- |
| A     | Read-only internal               |
| B     | Read-only external               |
| C     | Reversible internal mutation     |
| D     | Reversible external mutation     |
| E     | Consequential external action    |
| F     | Financial/commercial action      |
| G     | Security-sensitive action        |
| H     | Privileged administrative action |

## Audited surfaces

- 21 API routes, all server actions, Agent runtime definitions, provider transports, external `fetch` calls, Supabase clients/RPCs, Storage/Company Library paths, webhooks, email, Stripe billing, runtime/evaluation paths, secrets, RLS, approvals, audit events, retries and idempotency controls were inspected.
- Existing integration tables and Vault functions were reused and hardened. No duplicate integration-connection or generic approval system was created.
- Human-authored internal product mutations remain under their existing RLS/Owner boundaries. They are not Agent tool execution. New Agent operational capabilities must use the Gateway.

## Direct path disposition

The machine-readable authoritative inventory is `lib/integrations/direct-execution-inventory.ts`.

| Path group                                                          | Class     | Disposition                                                                  |
| ------------------------------------------------------------------- | --------- | ---------------------------------------------------------------------------- |
| `lib/integrations/adapters/**` and compatibility provider transport | B/D/E/F/G | Canonical adapter boundary                                                   |
| Outbound Resend route                                               | E         | Gateway migrated                                                             |
| Phase 1 AI transport and five migrated AI features                  | B         | Preserved Phase 1 boundary                                                   |
| Signed inbound Resend/Cloudflare/Stripe webhooks                    | C/F/G     | Platform control boundary; never Agent-authorized                            |
| Owner self-service Stripe Checkout/Portal                           | F         | Narrow temporary exception; no Agent reach                                   |
| Runtime/evaluation/multimodal paths                                 | A/B/C     | Existing documented temporary exceptions; external actions disabled          |
| Company Library/knowledge acquisition                               | A/B/C     | Platform read/evidence boundary; document content cannot authorize execution |

Unknown direct external mutation paths fail `test:phase2:direct-guard` in CI.

## Canonical flow

`INTENT → PLAN → AUTHORIZATION → APPROVAL → EXECUTION → VERIFICATION → AUDIT`

- Capability metadata, not prompt text, determines permissions, scopes, risk, retry, reversibility and approval.
- Consequential approvals are action-, target-, payload-, tenant- and time-bound. The service claim consumes them atomically.
- Default rollout is `simulate`; external writes require a scoped `enforced` override. A database kill switch blocks claims without deployment.
- Company Library content and Boardroom recommendations are explicit non-authority sources in the deterministic policy engine.

## Production validation resource

`internal.validation` creates one tenant-scoped operational validation marker and supports verified deletion. It exists only to validate authorization, approval, idempotency, telemetry and rollback without customer data or an external side effect.
