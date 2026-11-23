# Commercial activation model — 29 September 2026

RYTHM launches with assisted B2B company activation. Signup reserves a pending company; it does not place an order or take payment. Scope, taxes, invoice, payment and service dates are agreed with Billing outside the app. Online consumer payment remains unavailable.

## Customer path

Templates / Pricing → product signup → company reservation → Activation → Contact Billing → verified external invoice and payment → platform confirmation → active entitlement → selected template library → explicit provisioning.

Personal AI plan prices remain indicative. Their public CTA goes to Contact about availability, including for users without a company. No paid personal AI allowance is promised or granted by the company invoice confirmation. Existing personal trials and credit accounting remain unchanged.

## Authorized operator procedure (W16 branch)

The billing console is at `/admin/customers/{organizationId}`. Use an enabled platform administrator account. Keep signed documents, bank statements and invoice records in their approved external systems. Enter opaque evidence references only.

1. Record the quote, net amount and monthly service dates. Record the separately verified signed order against that quote.
2. Obtain professional approval of VAT treatment and amount, currency, contract terms, invoice totals, and the external invoice hand-off. Enter the approval reference, approved invoice reference, VAT amount (explicitly zero where approved), and UTC payment deadline. An unsigned order or missing review blocks settlement. The application checks reconciliation arithmetic and does not determine tax treatment or issue invoices.
3. Verify receipt independently. Record the unique bank/accounting receipt reference and the exact approved invoice gross amount and currency. The order, payment, service period, entitlement and audit updates commit together. Repeated confirmation with the same evidence is idempotent. Stripe checkout, portal and webhook writes remain disabled.
4. For renewal, record a fresh quote, signature and invoice review for a non-overlapping period. Settlement opens at the new service start and closes at the exclusive end. Reconcile earlier receipts externally and confirm them once the period starts. Review already elapsed periods externally. Mark an overdue approved invoice late after its deadline. The old entitlement end still controls access and late payment within the new period can restore service.
5. For a negotiated same-product reduction, enter a lower agent limit and the reviewed net amount. The new limit and price take effect atomically at the paid renewal. The workspace owner must archive surplus agents before the change. A move between products requires a separate reviewed migration.
6. Cancellation voids open orders and preserves access through the paid end. Resolve those invoices externally before cancellation. Record a full refund only after external confirmation and matching the original amount and currency. A refund of the current invoice ends service access. A historical refund preserves a later paid entitlement. Reconcile partial refunds and legacy payments with Finance outside this workflow.
7. Before offboarding, confirm the authorized checklist for exports, retention, processing jobs, integrations and customer hand-off. Record the checklist reference to revoke the company service entitlement and close open assisted orders. The billing action retains audit and payment records. External deprovisioning and retention actions require their own approvals.

The billing page is limited to an active owner membership in the selected tenant. The assisted order and external evidence ledger is limited to platform administrators. Payment confirmation and entitlement access are presented separately. Existing active accounts with no qualifying payment remain active under their existing entitlement rules.

`COMMERCIAL_ACTIVATION_MODEL` is `assisted`; checkout and portal return HTTP 409 without invoking Stripe. The dormant Stripe webhook verifies signatures but returns HTTP 503 before writes while online billing is disabled. No existing paid Stripe subscriptions/payments/checkouts were found during the pre-change Production inspection. Provider credentials alone cannot open purchases. Re-enabling online payment requires an explicit reviewed implementation of tax/contract disclosure, durable webhook retries, tenant/product binding, and entitlement/credit reconciliation.

## Existing records

Existing active organizations have no confirmed subscription/payment record in the current billing tables. Do not invent or backfill an invoice to make the dashboard look paid. Billing displays recorded entitlement access separately from confirmed payments. A first genuinely verified payment can establish the current monthly service period through the operator procedure.

Expiry uses the existing entitlement validity window. Cancellation is effective for access at the exclusive service end. Finance review is required for tax, invoice and terms sign-off before a live assisted sale.

## Validation limits

`npm run test:commercial-payment` applies the existing billing and W16 migrations to isolated embedded PostgreSQL and exercises the synthetic lifecycle, audit rollback, replay, role limits and tenant reads. It also renders the billing UI with synthetic sessions and delivers the same signed synthetic Stripe event twice to the disabled endpoint. This coverage uses synthetic data and does not contact a payment provider. A hosted staging walkthrough and Finance sign-off remain release checks.

Before release, rolling back is a branch revert and disposal of the test database. After a separately approved release, pause billing operations before restoring a compatible app revision. Preserve financial and audit records and review any corrective migration. The prior UI calls the retired payment RPC and cannot record payments while its grant is revoked.
