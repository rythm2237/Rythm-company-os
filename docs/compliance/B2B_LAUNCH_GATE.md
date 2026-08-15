# RYTHM Company OS — B2B Commercial Launch Gate

Status: operational checklist for the Hungarian/EU B2B SaaS baseline
Owner: Tayyebialashti Yaser E.V.

This gate separates controls already implemented in the product/repository from external government and tax/accounting actions that must be verified before accepting commercial B2B revenue. Security improvements that are valuable but not general legal launch conditions are tracked separately.

## Product / website legal baseline — implemented

- Legal Notice with operator identity and contact information.
- Privacy Policy.
- Terms of Service for professional/organizational use.
- Cookie & Storage Notice appropriate to the current essential-storage/no-confirmed-marketing-tracker baseline.
- Data Processing Addendum.
- Public Subprocessor Register.
- Privacy Data Requests channel.
- Authenticated privacy-request intake.
- Owner-scoped organization data export.
- Retention/deletion/DSAR/breach runbook.
- Formal GDPR Article 30 ROPA.
- GDPR Article 35 DPIA screening and mandatory re-screening triggers.
- AI Transparency & Governance notice.
- AI system inventory/change gate and human-authority baseline.
- Incident response process.
- Tenant isolation / RLS / owner-member authorization controls.
- API abuse/rate-limit controls for sensitive meeting endpoints.
- Public Trust Center and Security disclosures without false certification claims.

## External B2B legal/fiscal launch gates — must be verified before first commercial revenue

### 1. Hungarian individual-enterprise activity registration

Verify the current official EVNY record for tax number 48332376-1-42 / registration number 58642889 and confirm that at least one registered ÖVTJ activity validly covers the actual RYTHM commercial activity (SaaS/software service and, where applicable, IT consultancy/support).

If no appropriate activity is registered, add the correct activity through the NAV ÜPO Vállalkozói Ügysegéd before invoicing the RYTHM activity. Before adding a code, check KAVIR/ÖVTJ requirements for licensing, notification or qualification requirements.

Evidence to retain:
- current EVNY extract / official certificate or screenshot/export showing the applicable activity code(s);
- confirmation of any change submitted through Vállalkozói Ügysegéd.

### 2. Invoicing and NAV Online Számla

Before charging a B2B customer:
- choose and configure a compliant invoicing process;
- ensure invoices subject to Hungarian VAT invoicing rules are reported to NAV Online Számla as required;
- ensure legal name, address, tax number, invoice date/number, supply description, consideration and applicable VAT treatment are correct;
- retain accounting/invoice records for the legally applicable period.

Evidence to retain:
- NAV Online Számla registration/access confirmed;
- invoicing software/accounting process confirmed;
- successful test invoice/data-reporting process where appropriate.

### 3. VAT/tax treatment

Before the first invoice, document with the accountant the applicable treatment for:
- Hungarian B2B customer;
- EU B2B customer with a valid VAT number;
- non-EU B2B customer;
- subscription/recurring SaaS service;
- one-off professional/implementation/support services, if sold.

Do not hard-code VAT assumptions into checkout/invoicing logic until this matrix is approved.

Evidence to retain:
- accountant-approved tax/VAT matrix;
- tax status and any relevant EU VAT registration/verification procedure.

## Security uplifts — high impact, not general B2B legal blockers

### Supabase leaked-password protection

Current platform status: the connected Supabase organization is on the Free plan. Supabase leaked-password protection is only available on Pro and above. Do not represent the absence of this paid feature as a legal compliance failure by itself.

Recommended future action:
- enable leaked-password protection when/if the project is upgraded to Pro for commercial/security reasons;
- maintain strong password requirements and account recovery controls in the meantime.

### MFA

MFA is a strong security best practice and should be prioritized for privileged/operator accounts. It is not treated here as a universal statutory prerequisite for this ordinary B2B SaaS baseline.

Before enforcing MFA in the customer application:
- implement and test enrollment, challenge, unenrollment and recovery flows;
- avoid globally requiring AAL2 until legitimate existing users can safely enroll/recover;
- consider stricter MFA requirements for privileged/owner/operator functions first.

## Change gates that require re-review

Re-run the legal/privacy/security launch review before:
- B2C checkout or payment activation;
- storing payment-card data directly;
- adding analytics, advertising pixels or session-replay tooling;
- adding new subprocessors/integrations;
- enabling autonomous external actions;
- introducing HR/recruitment scoring or other consequential individual decisions;
- introducing special-category/health/biometric/criminal data processing;
- materially changing business entity, registered address, tax status or invoicing model;
- launching outside the current EU/Hungary legal baseline in a jurisdiction with additional requirements.

## Release classification rule

B2B may be classified as `B2B LEGAL BASELINE READY` when the repository/product controls above are deployed and the three external legal/fiscal launch gates have documented evidence. Security uplifts should continue according to risk and commercial maturity but do not, by themselves, prevent this legal baseline classification.
