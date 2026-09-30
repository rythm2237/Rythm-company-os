# Commercial activation model — 29 September 2026

RYTHM launches with assisted B2B company activation. Signup reserves a pending company; it does not place an order or take payment. Scope, taxes, invoice, payment and service dates are agreed with Billing outside the app. Online consumer payment remains unavailable.

## Customer path

Templates / Pricing → product signup → company reservation → Activation → Contact Billing → verified external invoice and payment → platform confirmation → active entitlement → selected template library → explicit provisioning.

Personal AI plan prices remain indicative. Their public CTA goes to Contact about availability, including for users without a company. No paid personal AI allowance is promised or granted by the company invoice confirmation. Existing personal trials and credit accounting remain unchanged.

## Authorized operator procedure

1. Independently verify the agreed company subscription invoice and received payment in the accounting/payment system. Confirm taxes and AI usage terms with the customer. Do not use an unpaid invoice, payment promise or test receipt.
2. Sign in as an enabled allowlisted platform administrator. Open `/admin/customers`, select the exact company and check its organization ID and product.
3. In **Confirm invoice payment & service period**, enter the verified invoice/payment reference, received amount, currency, and current monthly service start/end dates in UTC. End date is exclusive. Payment must cover the recorded entitlement base price and currency.
4. Select **I verified the external invoice and received payment**, then **Record confirmed payment and activate**.
5. Expected result: **Payment confirmation recorded**. Subscription, confirmed payment, entitlement validity and audit record are committed together. A failure commits none of them. Repeating the same reference and details does not create another payment. Conflicting references/details or overlapping confirmed periods require billing review.
6. Customer reloads Activation; an active selected template opens in the library for explicit installation. New company invoices do not create personal AI credits.

The allowlist check is performed by the server and independently inside the SECURITY DEFINER RPC. Tenant Owner/Admin authority is insufficient. The RPC has an empty search path and no anon/public/service_role execution grant. Provider identities and checkout state are no longer writable by tenant clients; RLS-protected billing reads remain.

`COMMERCIAL_ACTIVATION_MODEL` is `assisted`; checkout and portal return HTTP 409 without invoking Stripe. The dormant Stripe webhook verifies signatures but returns HTTP 503 before writes while online billing is disabled. No existing paid Stripe subscriptions/payments/checkouts were found during the pre-change Production inspection. Provider credentials alone cannot open purchases. Re-enabling online payment requires an explicit reviewed implementation of tax/contract disclosure, durable webhook retries, tenant/product binding, and entitlement/credit reconciliation.

## Existing records

Existing active organizations have no confirmed subscription/payment record in the current billing tables. Do not invent or backfill an invoice to make the dashboard look paid. Billing displays recorded entitlement access separately from confirmed payments. A first genuinely verified payment can establish the current monthly service period through the operator procedure.

Expiry uses the entitlement validity window already enforced by the Company OS. Manual service records retain their historical recorded status; the service end timestamp and entitlement validity determine current access. Refund, suspension, cancellation and negotiated legacy-product changes remain operator-reviewed operations; this confirmation form does not reverse payments or change products/prices.

## Validation limits

`test:commercial-payment` executes the old billing schema and the new migration in isolated embedded PostgreSQL. It exercises role denial, invoice validation, transaction rollback on audit failure, replay handling, consistency and tenant reads. These tests are not a real customer payment or browser E2E. Production grants, catalog, disabled payment endpoints and deployment must also be verified. A real external invoice must never be fabricated for a launch test.
