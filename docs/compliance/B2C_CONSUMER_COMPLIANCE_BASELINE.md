# RYTHM Company OS — B2C Consumer Compliance Baseline

Status: pre-payment consumer legal baseline
Effective: 15 August 2026
Owner: Tayyebialashti Yaser E.V. / RYTHM Company OS
Jurisdiction baseline: Hungary + mandatory EU consumer law

## Scope

This baseline governs future paid distance contracts with consumers, including one-off AI Meeting purchases and consumer subscriptions. It supplements the existing GDPR/AI/B2B compliance baseline.

## Mandatory controls implemented in the product/site

1. Public Consumer Rights notice.
2. Public Consumer Terms separate from the primarily B2B general Terms.
3. General Terms expressly preserve mandatory consumer rights.
4. Continuously accessible online withdrawal function for eligible distance contracts.
5. Server-side withdrawal register with RLS and no direct public/anon/authenticated table grants.
6. Downloadable durable acknowledgement generated from the recorded withdrawal submission.
7. Alternative withdrawal routes (email and postal statement) remain available.
8. Complaint channels and statutory response/record-retention workflow are disclosed.
9. Budapest Conciliation Board details are disclosed and consumer access to the competent conciliation body is preserved.
10. Digital-service conformity, update, price-reduction and termination/remedy principles are disclosed.
11. Pricing page now states that displayed Beta catalog prices are not a consumer checkout total.
12. One-off AI Meeting page states that current Beta access is not a paid consumer order and does not create a payment obligation.
13. Global footer exposes Consumer Terms, Consumer Rights and Withdraw from contract without requiring account registration.
14. Consumer legal routes carry canonical metadata and are included in sitemap.

## Mandatory checkout gate before any B2C payment is enabled

A consumer payment flow MUST fail closed unless all of the following can be supplied directly before the final order action:

- trader identity and current contact details;
- exact service/product characteristics;
- consumer audience eligibility;
- total amount payable including VAT/taxes and mandatory/unavoidable charges;
- currency;
- accepted payment method(s);
- performance/access start timing;
- contract duration;
- billing interval;
- automatic renewal mechanics, if any;
- minimum commitment, if any;
- termination/cancellation mechanism;
- withdrawal right information or the applicable statutory exception;
- for a paid service starting during the withdrawal period: separate express request to begin early plus acknowledgement of the consequences once fully performed;
- for digital content where relevant: separate prior express consent and acknowledgement if loss of withdrawal right is relied upon;
- main functionality and relevant compatibility/interoperability restrictions where applicable;
- any geographical restrictions;
- final button wording that unambiguously communicates an obligation to pay (for example, “Order with obligation to pay” / “Order & Pay”);
- no pre-ticked paid extras;
- durable contract confirmation after conclusion and before performance begins where required;
- invoice/receipt process;
- payment-provider SCA/PSD2 support where required;
- no prohibited consumer card surcharge;
- payment provider added to Privacy/Subprocessor/Cookie notices to the extent applicable.

No consumer payment route may be released while required values are placeholders or described only as “taxes may apply”.

## One-off AI Meeting treatment

The paid one-off AI Meeting should be treated as a bounded service/digital service according to its final product implementation. Checkout must identify scope, included AI roles/usage, duration/access period, deliverable/output, total consumer price and performance start.

A one-off meeting must not silently create a subscription. Any subscription upsell requires a separate and explicit order.

If the consumer requests performance during the 14-day withdrawal period, the request and legally required acknowledgement must be collected separately from acceptance of general Terms and stored as evidence.

## Subscription treatment

Before a consumer subscribes, disclose:
- recurring total price including applicable VAT/taxes;
- billing frequency;
- initial term and any minimum commitment;
- whether renewal is automatic;
- cancellation method and effective date;
- effects of cancellation on already-paid access;
- usage-based charges and enforceable consumer caps, if used.

A one-off purchase cannot be converted into recurring billing without separate express consent.

## Withdrawal operations

Current online function: `/withdrawal`.

Operational workflow:
1. receive and timestamp the statement;
2. create immutable receipt data and a unique request ID;
3. make durable acknowledgement available immediately;
4. verify order/contract reference;
5. determine statutory eligibility and early-performance status;
6. stop future service/renewal where appropriate;
7. calculate any legally permitted proportionate amount already performed;
8. process required reimbursement without undue delay and within the statutory maximum deadline where applicable;
9. use the original payment method unless the consumer expressly agrees otherwise without fee;
10. retain evidence needed for legal claims/accounting/consumer enforcement, applying data minimisation.

## Complaint handling

Written consumer complaints must be answered substantively in writing within the applicable statutory deadline (current Hungarian baseline: generally 30 days). A rejection must be reasoned and state the competent authority/conciliation route where required.

Complaint and reply records must be retained for the statutory record-retention period (current Hungarian baseline: three years for the complaint and substantive reply under the consumer-protection complaint rule).

Do not publish an electronic complaint form unless the implementation can acknowledge receipt electronically without delay. Email and postal complaint channels remain available.

## Alternative dispute resolution

Public consumer information must preserve access to the consumer’s competent conciliation body. For Budapest the current disclosed contact is the Budapest Conciliation Board, 1016 Budapest, Krisztina krt. 99; postal address 1253 Budapest, Pf. 10; tel. +36 1 488 2131; email bekelteto.testulet@bkik.hu.

Do not restore the former EU ODR platform link: the old platform is no longer the applicable route.

## Digital-service conformity

Consumer digital services must be supplied without undue delay unless otherwise agreed, remain in conformity with the contract, and receive updates including security updates for the legally applicable period. Statutory remedies may include bringing into conformity, proportionate price reduction, termination and refund depending on the failure and legal conditions.

“Beta”, “AI generated”, “as available”, disclaimers or liability clauses must never be used to waive consumer rights that cannot legally be waived.

## Pricing and commercial practices

- Do not advertise a consumer price that excludes unavoidable VAT/taxes/mandatory fees.
- Do not use drip pricing.
- Do not use pre-ticked paid extras.
- If personalised pricing based on automated decision-making/profiling is introduced, disclose that fact before purchase.
- If consumer reviews are published, disclose how authenticity is checked and do not fabricate, buy or manipulate reviews.
- Do not use fake scarcity/countdowns or misleading “free” claims.
- Any future discount campaign must be separately reviewed against applicable price-reduction/reference-price rules before launch.
- Do not discriminate in access/pricing solely because of EU nationality/residence where EU geo-blocking rules prohibit it.

## Payment and PCI boundary

RYTHM should use a regulated hosted/payment-tokenisation provider rather than store raw card details itself.

Before release:
- verify provider supports applicable PSD2/SCA requirements;
- verify card surcharge rules;
- complete provider DPA/privacy/subprocessor review;
- determine whether provider cookies/storage require consent/update to Cookie Notice;
- document PCI scope based on the selected integration;
- complete webhook signature verification, idempotency, refund and dispute handling tests;
- never log PAN/CVC or raw payment credentials.

## VAT, invoicing and tax launch gate

B2C checkout remains blocked until an accountant-approved VAT/invoicing matrix exists for at minimum:
- Hungarian consumer;
- EU consumer in another Member State;
- non-EU consumer;
- one-off AI Meeting;
- recurring SaaS/digital-service subscription.

Where EU B2C VAT/OSS rules apply, the invoicing/payment system must use the approved place-of-supply and VAT treatment before taking payment.

## Optional but high-impact controls

- hosted checkout from a major payment provider to reduce PCI scope;
- 3DS/SCA-friendly payment UX;
- self-service subscription cancellation in account settings;
- self-service invoice/order history;
- downloadable contract/order confirmation in the account;
- proactive renewal reminders, even where not universally mandatory;
- plain-language refund status tracking;
- accessibility review of checkout and legal forms;
- consumer support SLA shorter than the statutory complaint deadline;
- fraud/chargeback monitoring;
- legal/compliance regression checklist in release PRs.

## Release classification

Current state after this tranche: `B2C LEGAL FOUNDATION READY — PAYMENT GATED`.

Do not classify the service as `B2C PAYMENT READY` until the external VAT/invoice/payment-provider gates and production checkout confirmation flow are verified end-to-end.
