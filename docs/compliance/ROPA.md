# RYTHM Company OS — Record of Processing Activities (ROPA)

Status: Production compliance baseline for B2B Public Beta
Controller / Operator: Tayyebialashti Yaser E.V.
Registered address: 1143 Budapest, Gizella út 35, Hungary
Tax number: 48332376-1-42
Individual entrepreneur registration number: 58642889
Privacy contact: privacy@rythm-os.com
Security contact: security@rythm-os.com

## Purpose and legal basis

This record is maintained under Article 30 GDPR and covers both activities where RYTHM determines the purposes and means of processing (controller activities) and activities performed on documented customer instructions (processor activities).

## Controller processing activities

### Account registration and authentication
- Data subjects: account users, organization owners, invited organization members.
- Personal data: name where provided, email address, authentication identifiers, password-verification metadata handled by the authentication provider, session metadata, account status, recovery/verification events.
- Purposes: create and secure accounts; authenticate users; recover accounts; prevent unauthorized access.
- Legal basis: performance of contract or steps requested before contract; legitimate interests in security and abuse prevention; legal obligations where applicable.
- Recipients / processors: Supabase; Vercel to the extent request/runtime metadata is processed.
- Retention: active account lifecycle plus the periods required for security, dispute handling and legal claims; deleted or anonymized when no longer required, subject to backup lifecycle.
- Security: PKCE-based recovery flow, server-side user validation, protected routes, tenant membership checks, RLS, secure environment-variable handling.

### Organization and workspace administration
- Data subjects: organization owners, members, customer contacts.
- Personal data: account identifiers, membership role, organization affiliation, configuration and activity records attributable to users.
- Purposes: provide multi-tenant workspace functionality, authorization, governance and administration.
- Legal basis: contract; legitimate interests in governance, security and service operation.
- Recipients / processors: Supabase; Vercel.
- Retention: organization/account lifecycle plus documented retention periods for security and legal claims.
- Security: tenant-scoped RLS, owner/member authorization checks, entitlement controls and audit trails.

### Support, commercial and privacy communications
- Data subjects: prospects, customers, users, privacy requesters, security reporters.
- Personal data: contact information, correspondence, support request content, privacy request metadata, organization reference, verification information strictly where necessary.
- Purposes: respond to support, commercial, privacy and security requests; document compliance handling.
- Legal basis: contract/pre-contract steps; legitimate interests; compliance with GDPR rights and other legal obligations.
- Recipients / processors: configured email-routing infrastructure including Cloudflare where enabled; relevant hosting/backend systems where requests are recorded.
- Retention: according to support/privacy/security retention matrix; minimized when no longer required.
- Security: dedicated contact channels, minimum-information principle, authenticated privacy-request intake where available.

### Security, audit and abuse prevention
- Data subjects: users and persons interacting with the service.
- Personal data: user/account identifiers, organization identifiers, event timestamps, action metadata, request/rate-limit counters, operational and security events; IP/network metadata may be processed by hosting/network providers.
- Purposes: detect abuse, maintain auditability, secure accounts and tenants, investigate incidents, enforce request limits.
- Legal basis: legitimate interests in securing the service; legal obligations where applicable.
- Recipients / processors: Supabase, Vercel, Cloudflare where enabled.
- Retention: according to incident/security/audit retention schedules and necessity for claims or investigation.
- Security: restricted grants, RLS, server-side authorization, DB-backed rate limiting, incident response process.

### Public website and essential storage
- Data subjects: website visitors.
- Personal data: ordinary HTTP/request metadata processed by infrastructure; essential authentication/session state for signed-in users; local browser preferences where used.
- Purposes: deliver and secure the website; maintain essential user preferences and session state.
- Legal basis: legitimate interests; contract for authenticated service access; ePrivacy rules as applicable for essential storage.
- Recipients / processors: Vercel, Cloudflare where enabled, Supabase for authenticated service flows.
- Retention: infrastructure/log retention according to provider configuration and operational necessity.
- Security: HTTPS/HSTS, no confirmed advertising tracker/session-replay layer in the current Public Beta baseline.

### AI-assisted product features
- Data subjects: authenticated users and, where a customer chooses to include them, persons referenced in customer-provided workspace/meeting content.
- Personal data: user instructions, relevant workspace context, meeting transcript excerpts, prompts and generated outputs; only data reasonably required for the invoked feature should be supplied.
- Purposes: provide governed AI assistance, meeting deliberation, summarization, role-based analysis and related product functions.
- Legal basis: contract/customer request; legitimate interests where appropriate; customer controller instructions when RYTHM acts as processor.
- Recipients / processors: OpenAI for enabled model inference; Vercel/Supabase as relevant to application runtime and storage.
- Transfers: governed by applicable provider contractual safeguards and deployment configuration; maintained with the public Subprocessor Register and DPA.
- Retention: application records according to workspace lifecycle and provider/service configuration; inputs must be minimized.
- Security/governance: Human CEO authority, approval boundaries, no autonomous external actions by default, rate limits, tenant scoping, AI governance baseline and restricted high-risk use gate.

## Processor processing activities on behalf of B2B customers

When a customer determines the purposes and means of processing personal data placed into its RYTHM organization, RYTHM acts as processor for the relevant processing.

- Controllers: each contracted customer organization using RYTHM to process personal data under the DPA.
- Categories of processing: hosting, storing, organizing, retrieving, transmitting to configured subprocessors where required for the feature, AI inference when invoked, backup/recovery, security logging, support and deletion/export assistance.
- Data subjects: customer employees, contractors, contacts, business partners or other persons whose data the customer lawfully submits.
- Data categories: business contact data, account identifiers, organization/workspace records, meeting/project/action content, user-provided text and other customer content. Customers are instructed not to introduce sensitive/high-risk data or use cases without appropriate review.
- Subprocessors: current register at /subprocessors, presently including Supabase, Vercel, OpenAI for invoked AI features, and Cloudflare where configured for relevant routing/network services.
- International transfers: subject to applicable provider terms, DPAs and transfer safeguards; deployment-specific review is required where necessary.
- Retention/deletion: customer instructions, contractual terms, legal obligations and backup lifecycle control retention; verified deletion/export requests follow the privacy runbook.
- Security measures: encryption in transit, platform encryption at rest where provided by infrastructure, tenant RLS, authentication, owner/member authorization, entitlement controls, server-side secret handling, rate limiting, audit/incident processes, production change discipline and human governance controls.

## Categories of recipients

- Authorized RYTHM operator personnel strictly where operationally necessary.
- Customer-authorized organization members.
- Supabase — authentication, database and backend infrastructure.
- Vercel — web hosting, deployment and runtime infrastructure.
- OpenAI — model inference only for features that invoke AI processing.
- Cloudflare — domain/DNS/network or configured email-routing functions where applicable.
- Authorities or professional advisers only where legally required or necessary for legal claims/compliance.

## Data-subject rights and operational controls

RYTHM maintains an electronic privacy-request channel, authenticated privacy-request intake, organization-owner export capability, retention/deletion workflow and incident-response procedure. Requests are verified for identity and authority before disclosure or deletion.

## Review and change control

This ROPA must be reviewed whenever a material processor, data category, purpose, legal basis, retention period, transfer mechanism, AI use case, authentication architecture or customer data flow changes, and at least annually while the service is commercially active.
