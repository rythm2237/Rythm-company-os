# WF-009 — Meeting Economics & Cost Visibility

Status: Batch 2.5 canonical architecture

## Objective
Provide a governed, auditable economic view of each AI Boardroom session without changing meeting authority, agent authorization, or external-action policy.

## Currency model
- Customer/business-facing currency: EUR.
- Provider raw usage accounting may remain USD internally.
- Each session stores an accounting FX snapshot (`accounting_usd_to_eur`) so historical economics do not drift when exchange rates change later.
- FX is an accounting conversion input, not a payment or trading rate.

## Canonical economics
For a session:
- Provider AI cost (USD) = existing `estimated_cost_usd`.
- AI cost (EUR) = provider AI cost USD × accounting USD→EUR snapshot.
- Meeting AI budget (EUR) = stored business-facing budget.
- Customer price (EUR) = stored commercial price estimate.
- Estimated gross margin (EUR) = customer price EUR − AI cost EUR.
- Estimated gross margin % = gross margin EUR / customer price EUR × 100 when customer price > 0.

## Governance
- Economics are informational and commercial-planning data only.
- Economics never authorize agents, start meetings, approve decisions, resolve legal reviews, or enable external actions.
- Human CEO / Owner controls the commercial price and business-facing budget.
- Provider USD values remain available for reconciliation but are not the primary customer-facing currency.

## Defaults and historical sessions
- New sessions receive an accounting FX snapshot and EUR budget/price defaults through schema defaults.
- Existing sessions are backfilled with explicit internal-planning defaults so economics can be inspected immediately.
- Defaults are internal pricing hypotheses, not published pricing commitments.

## MVP UI
A Meeting Economics workspace shows:
- meeting/session identity and status;
- AI cost EUR;
- AI budget EUR;
- customer price EUR;
- estimated gross margin EUR and %;
- internal provider reconciliation in USD;
- accounting FX snapshot;
- links back to Boardroom and workflow surfaces.

## Non-goals
- checkout, billing, invoices, payment processing;
- live FX trading rates;
- accounting ledger;
- public monetization engine;
- autonomous repricing.
