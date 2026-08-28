# RYTHM Ready Company Minimum Standard

Version: 1.0
Status: Phase 4 mandatory catalog contract

A Ready Company can be marked `stable` only when it satisfies this standard. The standard is intentionally provider-neutral: a company capability is required even when a specific vendor adapter is not yet available. Vendor-specific integrations plug into the capability contract through the governed Execution Gateway.

## 1. Mandatory company functions

Every stable Ready Company must cover these functions either through a dedicated Agent, a combined Agent, or an explicitly delegated governed service role:

1. Executive / Operations coordination
2. Finance / Accounting
3. Legal / Compliance
4. People / Workforce
5. Sales / CRM / client development
6. Communications / customer support
7. Core industry delivery roles
8. Reporting / analytics
9. Security / permissions / auditability
10. Human CEO authority for consequential decisions

Lean templates may combine functions, but may not silently omit accountability.

## 2. Mandatory integration capability families

Every stable Ready Company must declare integration requirements for the following capability families. Requirements are provider-neutral and can be fulfilled by an approved first-party adapter, OAuth/API token integration, or the Generic Business Connector fallback.

- productivity: email, calendar, contacts, documents
- accounting_erp: accounting, bookkeeping, invoicing, ERP
- payments_banking: payments and financial-state read access; spending/payout actions remain restricted
- crm_sales: CRM, pipeline and customer records
- website_cms: website, CMS, e-commerce storefront or content platform
- analytics_bi: web/product/campaign analytics and reporting
- legal_contracts: contract repository, e-signature and legal document systems
- people_hris: HRIS / workforce records when applicable
- project_work: project/task/work-management system
- file_storage: governed company files and creative assets
- generic_business_api: REST/GraphQL API, webhook, SFTP/file exchange or custom connector fallback

Industry templates must add their own capability families in addition to this baseline.

## 3. Generic Business Connector fallback

A Ready Company must never be coupled to one country or one vendor. Unsupported local systems must be connectable through a governed generic adapter contract, in this order when available:

OAuth -> API token -> REST/GraphQL API -> webhook -> SFTP/file exchange -> custom connector.

The generic connector still requires an explicit capability manifest, least-privilege credentials, tenant isolation, risk classification, approval mode, audit logging and kill switch. It is not a bypass around the Execution Gateway.

## 4. External action governance

Read-only operations may be autonomous when classified low risk. External writes use the Execution Gateway and exact capability grants.

- content/campaign draft: medium; may be autonomous internally
- publish/post/send: high; Human CEO approval required by default
- campaign creation or material targeting changes: high; approval required
- budget/spend increase, payment, refund, payout, settlement: high/restricted; explicit Human CEO approval or human-only according to capability
- contract signature, regulatory filing or destructive legal action: restricted; human-only
- destructive production/data actions: restricted; human-only

A meeting decision does not itself grant execution authority. It produces a governed execution proposal that must satisfy the capability's approval policy.

## 5. Advertising Agency extension

A stable Advertising Agency must additionally support:

- Meta Marketing / Facebook Pages / Instagram professional publishing
- Google Ads
- YouTube channel publishing and campaign/video workflows
- TikTok for Business Marketing API and TikTok Content Posting
- LinkedIn Marketing / company Page publishing
- campaign analytics and attribution
- social/creative asset storage
- client CRM/account management
- optional additional ad/social networks via the Generic Business Connector

The agency may create strategy, copy, creative specifications, channel variants, campaign structures and draft posts autonomously inside RYTHM. Publishing, campaign activation and material account changes require approval. Any spend/budget authorization requires explicit Human CEO approval.

`Facebook Blueprint` is treated as training/knowledge content, not an execution API. Operational Meta execution uses the Meta Marketing API / Pages / Instagram APIs.

## 6. Stable-template release gate

A template cannot be promoted to `stable` unless CI validates:

- mandatory company-function coverage
- mandatory baseline integration families declared
- industry-specific integration families declared
- no credentials embedded in catalog data
- Agents paused and external actions disabled at initial provisioning
- Human CEO authority present
- high-risk/restricted external capabilities are never autonomous
- snapshot isolation/version contract present
- Generic Business Connector fallback declared

Template exceptions require an explicit versioned waiver with owner, rationale and expiry; silent exceptions are prohibited.
