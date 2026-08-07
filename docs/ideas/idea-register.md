# RYTHM Idea Register

Status legend: `Inbox` → `To Review` → `Under Evaluation` → `Accepted / Deferred / Rejected / Converted to Decision/Action`.

---

## IDEA-2026-001 — AI Boardroom as a standalone paid service

- **Captured:** 2026-08-07
- **Category:** Monetization / Product / Sales
- **Related project / capability:** RYTHM OS · Meeting Engine
- **Status:** Inbox
- **Suggested review owner:** A-101 Strategy Analyst, with B-001 orchestration
- **Idea:** Offer the RYTHM multi-agent meeting capability as a standalone online service even for customers who do not buy or operate the full Company OS. A customer enters a business question, chooses a panel of specialized AI agents, selects meeting language, runs the governed discussion, receives competing viewpoints, risks, recommendations, an executive summary, decision-ready options, and records a final decision.
- **Why it may matter:** Creates a low-friction commercial entry point into RYTHM, allows customers to pay directly for a discrete high-value outcome, and can operate as an acquisition funnel into the full platform.
- **Questions / assumptions to validate:** Who is the primary buyer? What meeting topics create willingness to pay? What level of agent specialization materially increases perceived value? Is a meeting-only account sufficient or should it include lightweight history/workspace features? Which outputs are needed for repeat use (PDF brief, decision log, export, share link)?
- **Revisit trigger:** RYTHM monetization/business-model planning meeting or before public/commercial release planning.
- **Links:** Current prototype capability: Multi-Agent Meeting Engine.

---

## IDEA-2026-002 — Pay-per-meeting pricing based on panel configuration

- **Captured:** 2026-08-07
- **Category:** Monetization / Pricing
- **Related project / capability:** RYTHM OS · Meeting Engine
- **Status:** Inbox
- **Suggested review owner:** A-101 Strategy Analyst + future Finance/Pricing agent; A-105 for market evidence
- **Idea:** Price meetings as commercial packages rather than exposing raw AI token cost. The quote can vary by number of agents, number of rounds, specialist-agent tier, research capability, output package, and possibly meeting complexity. Initial brainstorming examples included roughly €15–€20+ for a standard meeting, with higher tiers for larger/specialist panels.
- **Why it may matter:** The value delivered to the customer can be far higher than the underlying API cost, creating strong unit economics while keeping the offer simple and understandable.
- **Questions / assumptions to validate:** What is customer willingness to pay by use case? Should pricing be fixed packages, dynamic configuration-based pricing, credits, or hybrid? How should specialist agents be priced? What margin floor should be enforced? How should VAT/payment fees/support costs be included?
- **Revisit trigger:** Pricing workshop, monetization meeting, or before payment implementation.
- **Links:** Related ideas `IDEA-2026-001`, `IDEA-2026-003`, `IDEA-2026-004`.

---

## IDEA-2026-003 — Hybrid commercial model: platform subscription + agent licenses + meeting credits

- **Captured:** 2026-08-07
- **Category:** Monetization / Business Model
- **Related project / capability:** RYTHM OS platform
- **Status:** Inbox
- **Suggested review owner:** A-101 Strategy Analyst + B-001
- **Idea:** Use a hybrid commercial architecture: a base RYTHM platform subscription, optional specialized-agent licenses, included or purchased meeting credits, premium specialist/research capabilities, and enterprise integrations/support. Keep a separate meeting-only entry product for users who do not need the full OS.
- **Why it may matter:** Supports multiple customer segments, creates recurring revenue while preserving transaction-based upside, and aligns pricing with the modular nature of the virtual-company architecture.
- **Questions / assumptions to validate:** Which capabilities belong in base subscription vs paid add-ons? Should agents be licensed individually or in functional packs? How many meeting credits should be included? What enterprise capabilities justify higher tiers? How to prevent pricing complexity from hurting conversion?
- **Revisit trigger:** Business model design, packaging/pricing workshop, enterprise go-to-market planning.
- **Links:** Related ideas `IDEA-2026-001`, `IDEA-2026-002`.

---

## IDEA-2026-004 — Separate internal AI cost from customer selling price

- **Captured:** 2026-08-07
- **Category:** Finance / Unit Economics / Product Analytics
- **Related project / capability:** Meeting Engine · Commercial analytics
- **Status:** Inbox
- **Suggested review owner:** B-001 + future Finance/Pricing agent
- **Idea:** Track the provider/API cost of each meeting separately from its commercial selling price. Internally show meeting AI cost, budget, customer price, and estimated contribution/gross margin. Do not expose raw provider cost to the customer unless intentionally required.
- **Why it may matter:** Enables unit-economics control, pricing decisions, margin monitoring, anomaly detection, and future profitability dashboards.
- **Questions / assumptions to validate:** Which infrastructure/support/payment costs should be allocated per meeting? Should margin be calculated at contribution margin or gross margin level? How should cached tokens, retries, summaries, research, and failed runs be treated?
- **Revisit trigger:** Meeting pricing implementation or finance dashboard design.
- **Links:** Meeting Engine already tracks token usage and `estimated_cost_usd`; commercial UI is planned to display values in EUR.

---

## IDEA-2026-005 — EUR as the commercial/display currency for RYTHM

- **Captured:** 2026-08-07
- **Category:** Finance / Product / Internationalization
- **Related project / capability:** RYTHM OS global commercial UI
- **Status:** Inbox
- **Suggested review owner:** A-101 Strategy Analyst + future Finance agent
- **Idea:** Use EUR as the default commercial and management-facing currency across RYTHM: meeting budget, estimated AI cost, customer quote, final meeting price, subscription pricing, and margin reporting. Preserve provider-native currency internally where needed for accounting/reconciliation, then convert for display and commercial logic.
- **Why it may matter:** Provides a consistent pricing language for the intended European commercial context and avoids mixing USD API costs with EUR customer pricing.
- **Questions / assumptions to validate:** Source and refresh cadence for FX rates; whether to lock FX at transaction time; accounting treatment; multi-currency requirements for future global customers.
- **Revisit trigger:** Finance/currency architecture implementation, payment setup, or pricing launch.
- **Links:** Related idea `IDEA-2026-004`.

---

## Intake note

Future spontaneous ideas from the Human CEO should be appended here even if incomplete. Capture first; evaluate later. B-001 should surface relevant open ideas before a governed meeting or planning checkpoint whose topic matches the idea category, related project, or revisit trigger.
