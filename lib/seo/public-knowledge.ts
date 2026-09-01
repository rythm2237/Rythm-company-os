import type { PublicKnowledgeContent } from "@/app/(public)/_components/PublicKnowledgePage";

const REVIEW_DATE = "2026-09-01";

export const AI_WORKFORCE_CONTENT: PublicKnowledgeContent = {
  path: "/ai-workforce",
  breadcrumbLabel: "AI Workforce",
  kicker: "GOVERNED AI WORKFORCE",
  title: "Build an AI workforce that operates inside a human authority model.",
  summary:
    "RYTHM Company OS gives founders and organizations a structured way to assemble specialized AI Agent teams, coordinate their work, preserve company context, and keep consequential decisions under Human CEO control.",
  definition:
    "An AI workforce is a coordinated set of specialized AI Agents with defined roles, responsibilities, context, permissions, reporting relationships, and escalation boundaries—not a collection of unrelated chat windows.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "THE BUSINESS PROBLEM",
      title: "Individual AI tools can produce answers without creating an operating organization.",
      paragraphs: [
        "Businesses often lose context between tools, repeat instructions, and struggle to determine who owns a recommendation. RYTHM connects the workforce to meetings, decisions, approvals, actions, projects, and Company Memory so work has an accountable operating path.",
      ],
      items: [
        { title: "Fragmented context", detail: "Company Memory keeps approved organizational context connected to the work that uses it." },
        { title: "Unclear accountability", detail: "Each AI Agent has an explicit role, manager, responsibility set, authority level, and risk ceiling." },
        { title: "Uncontrolled action", detail: "Consequential external actions stop at approval and execution-policy boundaries." },
      ],
    },
    {
      eyebrow: "OPERATING MODEL",
      title: "The workforce moves through a governed company loop.",
      items: [
        { title: "Organize", detail: "Choose a Ready Company or define departments, reporting lines, Agents, and responsibilities in Company Studio." },
        { title: "Deliberate", detail: "Bring relevant human and AI roles into structured meetings around an objective, evidence, and decision boundary." },
        { title: "Approve and trace", detail: "Turn approved decisions into accountable work while preserving the link from intent to outcome." },
      ],
    },
    {
      eyebrow: "WHO IT IS FOR",
      title: "Designed for leaders who need operating structure around AI work.",
      items: [
        { title: "Founders and small teams", detail: "Start with a pre-built company pattern instead of designing every role and workflow from zero." },
        { title: "Operating teams", detail: "Use specialized Agents for research, strategy, operations, communication, finance, risk, and delivery." },
        { title: "Enterprise programs", detail: "Plan departmental AI teams with knowledge boundaries, human managers, approvals, and phased rollout." },
      ],
    },
  ],
  questions: [
    { question: "Is an AI workforce the same as AI employees?", answer: "The market sometimes uses both terms. RYTHM uses AI workforce and AI Agents because the system discloses AI identity and does not present software as a human employee." },
    { question: "Can an AI workforce replace employees?", answer: "RYTHM is designed to support and reorganize work, not to promise wholesale employee replacement. Human leadership, judgment, legal responsibility, and consequential authority remain necessary." },
    { question: "Can I create custom AI Agents?", answer: "Custom Company plans are designed to support editable departments, roles, Agent definitions, reporting structures, governance settings, and capability boundaries." },
    { question: "Does the workforce act autonomously?", answer: "Agents may perform bounded low-risk work where policy permits it. External or consequential actions remain locked by default and require the configured authorization path." },
  ],
};

export const AI_AGENTS_FOR_BUSINESS_CONTENT: PublicKnowledgeContent = {
  path: "/ai-agents-for-business",
  breadcrumbLabel: "AI Agents for Business",
  kicker: "AI AGENTS FOR BUSINESS",
  title: "Give business AI Agents a real role, not unrestricted access.",
  summary:
    "RYTHM places specialized AI Agents inside an organizational model with responsibilities, Company Memory, permissions, governance, approvals, and a visible Human CEO escalation path.",
  definition:
    "A business AI Agent is an AI system configured for a defined organizational role and task boundary. In RYTHM, the Agent also has explicit permissions, risk limits, reporting context, and human-approval requirements.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "ROLE DESIGN",
      title: "An Agent specification connects expertise to authority.",
      items: [
        { title: "Purpose and responsibilities", detail: "The role states what the Agent is accountable for and which outputs it should produce." },
        { title: "Knowledge and context", detail: "Company and professional knowledge can be supplied within the Agent's authorized memory scope." },
        { title: "Permissions and risk", detail: "Allowed tools, authority level, risk ceiling, and approval requirements define what the Agent may do." },
      ],
    },
    {
      eyebrow: "CURRENT ROLE FAMILIES",
      title: "Use general business roles or template-specific specialists.",
      paragraphs: [
        "The current RYTHM foundations include strategy, operations, finance, risk and compliance, research, and communication roles. Ready Company templates extend these foundations with specialists for advertising and software-company operations.",
      ],
      items: [
        { title: "Executive and analytical", detail: "Executive orchestration, strategic analysis, operations planning, research, finance control, and risk review." },
        { title: "Growth and client work", detail: "GTM strategy, accounts, content, creative, performance marketing, analytics, and communications roles." },
        { title: "Product and technology", detail: "Product, design, architecture, engineering, QA, security, documentation, DevOps, and AI automation roles." },
      ],
    },
    {
      eyebrow: "DIFFERENT BY DESIGN",
      title: "A governed Agent is more than a prompt or chatbot.",
      items: [
        { title: "Compared with ChatGPT", detail: "A chat assistant answers in a conversation; a RYTHM Agent also has a persistent organizational role and governed operating context." },
        { title: "Compared with automation", detail: "Automation follows predefined triggers; an Agent can analyze and recommend, but execution still passes through policy and approval controls." },
        { title: "Compared with an autonomous bot", detail: "RYTHM does not grant blanket authority. Capability, risk, tenant, entitlement, and human decision boundaries are evaluated before action." },
      ],
    },
  ],
  questions: [
    { question: "What can RYTHM AI Agents do?", answer: "Depending on role and configuration, Agents can analyze, research, plan, draft, deliberate, summarize, coordinate, and propose actions. Tool use and external execution depend on permissions, connected integrations, risk, and approval." },
    { question: "Can Agents work together?", answer: "Yes. RYTHM supports multi-agent meetings and coordinated company work where relevant specialists contribute within explicit roles before a decision or action is finalized." },
    { question: "Can an Agent send emails or spend money?", answer: "Not by default. External communication, publishing, deployment, financial changes, and other consequential actions require a supported integration and the applicable human authorization." },
    { question: "Do Agents identify themselves as AI?", answer: "Yes. Explicit AI identity is part of the RYTHM operating and transparency model." },
  ],
  primaryCta: { label: "Explore Agent roles", href: "/product/ai-agents" },
};

export const HOW_IT_WORKS_CONTENT: PublicKnowledgeContent = {
  path: "/how-it-works",
  breadcrumbLabel: "How It Works",
  kicker: "HOW RYTHM WORKS",
  title: "From company context to a governed, traceable outcome.",
  summary:
    "RYTHM connects organization design, Company Memory, AI and human meetings, decisions, approvals, execution controls, and operating evidence in one repeatable loop.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "STEP 1–3",
      title: "Build the company context before asking Agents to operate.",
      items: [
        { title: "1. Choose a company model", detail: "Start with a Ready Company, design a Custom Company, or plan an Enterprise workforce deployment." },
        { title: "2. Define authority", detail: "Set human ownership, departments, Agent roles, risk ceilings, permissions, and approval boundaries." },
        { title: "3. Add governed context", detail: "Provide company profile, objectives, documents, projects, and other authorized Company Memory." },
      ],
    },
    {
      eyebrow: "STEP 4–5",
      title: "Turn an objective into a structured decision.",
      items: [
        { title: "4. Convene the right roles", detail: "Relevant Agents and humans deliberate around an agenda, evidence, assumptions, disagreement, and the decision owner." },
        { title: "5. Close with human authority", detail: "Recommendations remain recommendations until the Human CEO or designated human authority makes the required decision." },
      ],
    },
    {
      eyebrow: "STEP 6–7",
      title: "Execute only what is authorized and preserve the evidence.",
      items: [
        { title: "6. Preview and approve", detail: "Consequential work presents the proposed action, target, scope, risk, and approval requirement before execution." },
        { title: "7. Execute and trace", detail: "Allowed work enters the execution ledger and remains connected to the originating intent, decision, approval, action, and outcome." },
      ],
    },
  ],
  questions: [
    { question: "Do I need to design a company before using RYTHM?", answer: "No. Ready Company templates provide predefined structures. Custom Company is for customers who need to design or modify the organization themselves." },
    { question: "Is human approval always required?", answer: "Not for every low-risk analysis or read operation. Approval is required where role permissions, risk, policy, financial impact, or external side effects call for it." },
    { question: "How does multi-agent collaboration work?", answer: "RYTHM selects relevant roles for the objective, preserves each contribution and disagreement, and routes the resulting recommendation to the appropriate human decision boundary." },
  ],
};

export const PRODUCT_AGENTS_CONTENT: PublicKnowledgeContent = {
  path: "/product/ai-agents",
  breadcrumbLabel: "Product AI Agents",
  kicker: "RYTHM AI AGENTS",
  title: "Specialized AI roles with explicit operating boundaries.",
  summary:
    "Explore how RYTHM represents AI Agents as visible organizational members with role definitions, professional knowledge, permissions, reporting lines, risk limits, and Human CEO escalation.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "AGENT PROFILE",
      title: "Every Agent carries an operational specification.",
      items: [
        { title: "Identity", detail: "Name, AI disclosure, role title, department, manager, purpose, and current operating status." },
        { title: "Capability", detail: "Responsibilities, skills, professional knowledge, allowed tools, language behavior, and success criteria." },
        { title: "Governance", detail: "Authority level, risk ceiling, memory scope, budget policy, approval requirements, and external-action status." },
      ],
    },
    {
      eyebrow: "WORKFORCE PATTERNS",
      title: "Choose a pre-built specialist set or define your own.",
      items: [
        { title: "Core company roles", detail: "Strategy, operations, finance, research, governance, communication, and executive coordination." },
        { title: "Advertising Agency", detail: "GTM, account management, creative, content, performance, analytics, finance, legal, and operations roles." },
        { title: "Software Company", detail: "Product, design, engineering, QA, security, DevOps, documentation, growth, sales, support, finance, and people operations." },
      ],
    },
    {
      eyebrow: "CUSTOMIZATION",
      title: "Custom Agents begin paused and bounded.",
      paragraphs: [
        "Company Studio can create or clone role definitions, but a new Agent does not receive automatic external authority. Knowledge readiness, entitlement, permissions, risk, and integration grants must be satisfied before supported execution becomes available.",
      ],
    },
  ],
  questions: [
    { question: "Are all listed Agents active for every customer?", answer: "No. Available roles depend on the selected template or custom company, commercial entitlement, provisioning state, and the customer's configuration." },
    { question: "Can I change an Agent's role?", answer: "Custom Company capabilities are designed for controlled changes to role, responsibilities, reporting context, knowledge, and governance settings." },
    { question: "Which model does an Agent use?", answer: "RYTHM routes requests through a centralized request-intelligence layer. The selected model tier can vary by task complexity, risk, tools, language, latency, cost policy, and escalation requirements." },
  ],
  primaryCta: { label: "Explore company templates", href: "/templates" },
};

export const PRODUCT_INTEGRATIONS_CONTENT: PublicKnowledgeContent = {
  path: "/product/integrations",
  breadcrumbLabel: "Product Integrations",
  kicker: "GOVERNED INTEGRATIONS",
  title: "Connect business tools without giving Agents blanket authority.",
  summary:
    "RYTHM separates connection, capability, Agent permission, human approval, execution, verification, and audit so a connected account does not automatically become an unrestricted AI action channel.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "CURRENT GATEWAY",
      title: "The execution layer models real tools and explicit operations.",
      paragraphs: [
        "The current gateway includes governed capability contracts for GitHub, Vercel, Supabase, Cloudflare, Stripe, Google Workspace, Microsoft 365, Resend, and internal validation. Customer availability still depends on provider configuration, entitlement, verified credentials, scopes, and rollout state.",
      ],
      items: [
        { title: "Productivity and communication", detail: "Google Calendar, Gmail, Microsoft Calendar, Microsoft Mail, and Resend email capabilities are represented in the governed execution layer." },
        { title: "Software operations", detail: "GitHub repositories, Vercel deployments, Supabase database operations, and Cloudflare DNS use operation-specific contracts." },
        { title: "Commercial operations", detail: "Stripe read/refund operations and other financial actions carry explicit financial and Human CEO approval requirements." },
      ],
    },
    {
      eyebrow: "CONNECTION LIFECYCLE",
      title: "Connected does not mean authorized for every action.",
      items: [
        { title: "1. Authenticate", detail: "Use provider OAuth or a restricted provider-issued credential; RYTHM does not request the user's personal provider password." },
        { title: "2. Grant minimum scope", detail: "The organization connects only the scopes needed for the intended capability." },
        { title: "3. Grant Agent capability", detail: "An Agent needs a matching integration grant and permission before it can propose or execute the operation." },
        { title: "4. Apply policy", detail: "Risk, environment, entitlement, side effect, financial impact, approval, and kill-switch rules are evaluated." },
        { title: "5. Verify and record", detail: "Execution results and supported compensating actions are recorded in the tenant-scoped ledger." },
      ],
    },
    {
      eyebrow: "PLANNED CONNECTOR FAMILIES",
      title: "Some capability contracts exist before production adapters do.",
      paragraphs: [
        "Accounting/ERP, CRM, CMS, analytics, legal, HRIS, project work, file storage, generic business APIs, and advertising connectors are represented as disabled contracts until hardened provider adapters and verification are complete. They must not be interpreted as currently available integrations.",
      ],
    },
  ],
  questions: [
    { question: "Which integrations are available today?", answer: "The gateway contains the providers listed above, but availability is deployment- and customer-specific. The authenticated Integrations workspace is the source of truth for what a particular organization can connect now." },
    { question: "Does connecting a tool let every Agent use it?", answer: "No. Organization connection, granted scopes, Agent capability grants, user permissions, entitlement, risk policy, and approval are evaluated separately." },
    { question: "How are credentials stored?", answer: "Provider authorization or restricted credentials are handled by the governed integration layer; supported secret material is stored through the configured secure credential boundary rather than exposed to Agents." },
    { question: "Can integrations run without human approval?", answer: "Bounded low-risk read operations may run where policy permits. Publishing, spending, deployment, data changes, communication, and other consequential writes require the applicable approval path." },
  ],
  primaryCta: { label: "Review security", href: "/security" },
  secondaryCta: { label: "Discuss enterprise integration", href: "/enterprise" },
};

export const FAQ_CONTENT: PublicKnowledgeContent = {
  path: "/faq",
  breadcrumbLabel: "FAQ",
  kicker: "RYTHM QUESTIONS",
  title: "Direct answers about RYTHM Company OS.",
  summary:
    "Definitions, product boundaries, pricing, security, integrations, custom AI Agents, human approval, and Public Beta availability in one first-party reference.",
  reviewedOn: REVIEW_DATE,
  sections: [],
  questions: [
    { question: "What is RYTHM Company OS?", answer: "RYTHM Company OS is a governed AI workforce platform and AI company operating system. It connects specialized AI Agents, Company Memory, meetings, decisions, approvals, actions, projects, economics, and traceability under Human CEO authority." },
    { question: "Who is RYTHM for?", answer: "RYTHM is designed for founders, operators, teams, and enterprise programs that need structured, persistent, and governed AI work rather than disconnected chats or unrestricted automation." },
    { question: "How is RYTHM different from ChatGPT?", answer: "ChatGPT is a general AI assistant. RYTHM adds organizational roles, company context, multi-agent coordination, decision ownership, approvals, execution policies, tenant boundaries, and operating traceability." },
    { question: "How is RYTHM different from automation software?", answer: "Automation tools typically run predefined triggers and steps. RYTHM coordinates AI analysis and organizational work, then applies permission, risk, approval, and execution controls before supported actions occur." },
    { question: "Does RYTHM replace employees?", answer: "RYTHM does not promise wholesale employee replacement. It helps leaders reorganize and augment work with AI Agents while preserving human judgment, responsibility, and consequential authority." },
    { question: "Can I build custom AI Agents?", answer: "Custom Company plans are designed to let eligible customers define Agents, responsibilities, hierarchy, knowledge, tools, risk limits, and approval requirements." },
    { question: "Is human approval required?", answer: "Human approval is required for actions whose permissions, risk, financial impact, external side effect, or policy demand it. Low-risk analysis and authorized reads may not require an approval every time." },
    { question: "What integrations exist?", answer: "The current execution gateway models GitHub, Vercel, Supabase, Cloudflare, Stripe, Google Workspace, Microsoft 365, Resend, and internal operations. Actual customer availability depends on configuration and rollout state." },
    { question: "How is company data separated?", answer: "RYTHM uses authenticated organization context, tenant-aware application checks, Supabase Row Level Security, and organization-scoped execution records. The public Demo uses synthetic read-only data." },
    { question: "How much does RYTHM cost?", answer: "The current Public Beta catalog lists Ready AI Company from €249 per month plus AI usage, Custom AI Company from €699 per month plus AI usage, Assisted Build from €2,500, and Enterprise pricing through Sales. The Pricing page is the current source of truth." },
    { question: "Is RYTHM fully autonomous?", answer: "No. RYTHM is intentionally designed around bounded autonomy. Consequential authority remains human and external actions are locked by default unless a governed workflow authorizes them." },
    { question: "Is RYTHM generally available?", answer: "RYTHM is currently a Public Beta. Capabilities, integrations, commercial availability, and controls may change as the product is validated and hardened." },
  ],
};

export const DOCS_CONTENT: PublicKnowledgeContent = {
  path: "/docs",
  breadcrumbLabel: "Documentation",
  kicker: "PRODUCT DOCUMENTATION",
  title: "Start with the RYTHM operating model and its boundaries.",
  summary:
    "A public documentation entry point for the concepts, setup paths, governance model, AI Agent architecture, integrations, Company Memory, and Public Beta limits behind RYTHM Company OS.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "QUICK START",
      title: "Choose the path that matches what you need to learn.",
      items: [
        { title: "Understand the category", detail: "Read AI Workforce and AI Agents for Business for the product definition and market language." },
        { title: "See the operating loop", detail: "Use How It Works and Product Architecture to understand context, deliberation, authority, execution, and traceability." },
        { title: "Inspect the product", detail: "Open the synthetic read-only Demo before creating an account or selecting a commercial path." },
      ],
    },
    {
      eyebrow: "CORE CONCEPTS",
      title: "The product is organized around five public concepts.",
      items: [
        { title: "AI workforce", detail: "A coordinated organization of specialized AI roles rather than isolated assistants." },
        { title: "Company Memory", detail: "Governed organizational context available within tenant, role, and task boundaries." },
        { title: "Human authority", detail: "The Human CEO or designated human owner closes consequential decisions." },
        { title: "Execution Gateway", detail: "Tool actions pass through capability, permission, scope, risk, approval, and ledger controls." },
        { title: "Operating trace", detail: "Intent, evidence, meetings, decisions, approvals, actions, and outcomes remain connected." },
      ],
    },
    {
      eyebrow: "CURRENT DOCUMENTATION SCOPE",
      title: "Public documentation describes the product without exposing customer or security-sensitive detail.",
      paragraphs: [
        "Authenticated configuration, tenant data, credentials, internal runbooks, and exploit-sensitive implementation details are intentionally excluded. Public pages describe current behavior and boundaries; signed enterprise terms or current in-product configuration control where they differ.",
      ],
    },
  ],
  questions: [
    { question: "Is there a public API?", answer: "A generally available public customer API is not currently claimed. Integration capabilities run through the governed execution architecture and customer-specific availability." },
    { question: "Where should I verify current pricing or security?", answer: "Use the canonical Pricing, Security, Trust Center, Privacy, and Terms pages because those facts may change during Public Beta." },
    { question: "Where can I try RYTHM?", answer: "The public Demo provides a synthetic read-only company workspace. The Live AI Meeting page describes a bounded meeting experience for a real business objective." },
  ],
  primaryCta: { label: "Read how RYTHM works", href: "/how-it-works" },
  secondaryCta: { label: "Open the product Demo", href: "/demo" },
};

export const PRODUCT_ARCHITECTURE_CONTENT: PublicKnowledgeContent = {
  path: "/product-architecture",
  breadcrumbLabel: "Product Architecture",
  kicker: "MULTI-AGENT PRODUCT ARCHITECTURE",
  title: "A company system around AI—not a direct path from prompt to action.",
  summary:
    "RYTHM separates organizational context, AI request routing, human decisions, integration policy, execution, and audit so intelligence and authority do not collapse into one opaque step.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "ORGANIZATION LAYER",
      title: "Roles and company context define where work belongs.",
      items: [
        { title: "Tenant boundary", detail: "Every persistent company operates in an authenticated organization context with tenant-aware data controls." },
        { title: "Workforce graph", detail: "Departments, human authority, Agent roles, managers, permissions, knowledge, and risk form the operating structure." },
        { title: "Company Memory", detail: "Authorized company context supports continuity without becoming unrestricted universal memory." },
      ],
    },
    {
      eyebrow: "INTELLIGENCE LAYER",
      title: "Requests pass through centralized interpretation and routing.",
      items: [
        { title: "Request intelligence", detail: "Language, intent, task, complexity, risk, tools, context, permissions, cost, and latency requirements are evaluated." },
        { title: "Adaptive model routing", detail: "Production-approved model tiers are selected centrally instead of being hard-wired independently into every Agent." },
        { title: "Multi-agent deliberation", detail: "Relevant roles can contribute distinct analysis while disagreement and evidence remain visible for human closure." },
      ],
    },
    {
      eyebrow: "EXECUTION LAYER",
      title: "A recommendation cannot silently become an external action.",
      items: [
        { title: "Capability contract", detail: "Every supported operation declares scopes, permissions, risk, approval, sensitivity, side effects, retry, idempotency, and reversibility." },
        { title: "Human approval", detail: "Approvals are action-, target-, scope-, and time-bound rather than reusable blanket permission." },
        { title: "Execution ledger", detail: "Preview, policy result, approval, attempt, verification, failure, and compensating action remain attributable." },
      ],
    },
  ],
  questions: [
    { question: "Is RYTHM a multi-agent platform?", answer: "Yes, but its intended category is broader: a governed AI workforce platform and company operating system that combines multi-agent work with organization, memory, human authority, execution controls, and traceability." },
    { question: "Is critical content rendered only in the browser?", answer: "Public explanatory pages use Next.js Server Components and metadata APIs so definitions and structured content are present in rendered HTML rather than depending on a client-only application shell." },
    { question: "Can a customer bypass the Execution Gateway?", answer: "Supported product execution is designed to use the centralized gateway. Direct provider execution is guarded in CI and only explicitly approved, bounded exceptions may exist." },
  ],
  primaryCta: { label: "Review integrations", href: "/product/integrations" },
  secondaryCta: { label: "Review the Trust Center", href: "/trust" },
};

export const USE_CASES_CONTENT: PublicKnowledgeContent = {
  path: "/use-cases",
  breadcrumbLabel: "Use Cases",
  kicker: "AI WORKFORCE USE CASES",
  title: "Apply governed AI teams to an operating model—not a vague industry promise.",
  summary:
    "RYTHM use cases connect a real company pattern, specialized roles, recurring workflows, evidence, approvals, integrations, and Human CEO ownership. Start with the operating context closest to your organization.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "CURRENT PATTERNS",
      title: "Three substantive starting points are available for evaluation.",
      items: [
        { title: "Startups", detail: "Coordinate product discovery, planning, delivery, growth, support, finance, and risk with a lean governed workforce." },
        { title: "Advertising agencies", detail: "Connect GTM strategy, accounts, creative, content, performance, analytics, finance, legal, and operations." },
        { title: "Software companies", detail: "Coordinate product, design, architecture, engineering, QA, security, DevOps, growth, sales, support, and business operations." },
      ],
    },
    {
      eyebrow: "QUALIFICATION",
      title: "A good use case has a clear human owner and evidence boundary.",
      items: [
        { title: "Repeatable objective", detail: "The work has a recurring outcome, inputs, responsibilities, and review cadence." },
        { title: "Explicit risk", detail: "Legal, financial, security, privacy, brand, and external-action consequences can be identified before execution." },
        { title: "Verifiable outcome", detail: "The organization can review the recommendation, decision, action, and evidence rather than trusting an opaque output." },
      ],
    },
  ],
  questions: [
    { question: "Does RYTHM support every industry?", answer: "The underlying organization model is configurable, but RYTHM does not claim validated expertise for every industry. Regulated, high-risk, or domain-specific deployment requires additional review and evidence." },
    { question: "Can we create a custom use case?", answer: "Yes. Custom Company and Enterprise paths are intended for organizations that need their own roles, hierarchy, knowledge, integrations, workflows, and governance." },
    { question: "Do use cases include automatic external execution?", answer: "No. A use case describes how work is organized. Actual execution still depends on supported integrations, grants, policy, risk, approval, and rollout state." },
  ],
  primaryCta: { label: "Explore company templates", href: "/templates" },
};

export const STARTUP_USE_CASE_CONTENT: PublicKnowledgeContent = {
  path: "/use-cases/startups",
  breadcrumbLabel: "AI Workforce for Startups",
  kicker: "STARTUP USE CASE",
  title: "Give a founder a lean AI team without hiding decision ownership.",
  summary:
    "A startup can use RYTHM to organize research, product planning, software delivery, growth, customer operations, finance, and risk around one Human CEO and a traceable operating cadence.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "STARTING WORKFORCE",
      title: "Cover essential functions without pretending every role is autonomous.",
      items: [
        { title: "Strategy and product", detail: "Structure customer evidence, strategic options, roadmap decisions, assumptions, and success criteria." },
        { title: "Delivery and quality", detail: "Turn approved priorities into projects, milestones, engineering work, QA, security review, and release evidence." },
        { title: "Growth and operations", detail: "Coordinate GTM planning, content drafts, sales support, customer communication, financial control, and risk escalation." },
      ],
    },
    {
      eyebrow: "EXAMPLE LOOP",
      title: "From customer problem to an approved release plan.",
      items: [
        { title: "Input", detail: "The founder supplies the customer problem, evidence, constraints, current product context, and decision deadline." },
        { title: "Deliberation", detail: "Product, research, engineering, GTM, finance, and risk roles test assumptions and propose options." },
        { title: "Human close", detail: "The founder selects the option, approves resources and external commitments, and assigns accountable work." },
      ],
    },
    {
      eyebrow: "LIMITS",
      title: "The system does not become the legal founder or accountable executive.",
      paragraphs: [
        "Human leadership remains responsible for company commitments, hiring, regulated decisions, financial authorization, contracts, production release, and other consequential choices. RYTHM supplies structured AI work and governance evidence around those decisions.",
      ],
    },
  ],
  questions: [
    { question: "Is this suitable for a solo founder?", answer: "It can be, especially where the founder needs structured cross-functional analysis and continuity. The founder still owns prioritization, validation, external commitments, and legal responsibility." },
    { question: "Which plan fits a startup?", answer: "Ready AI Company is the lower-complexity starting point. Custom AI Company fits teams that need to change roles, hierarchy, Agents, or governance. Current inclusions and prices are listed on the Pricing page." },
    { question: "Can RYTHM ship software automatically?", answer: "Production deployment is a consequential action. It requires a supported integration, exact scope, policy approval, and the configured human release authority." },
  ],
};

export const AGENCY_USE_CASE_CONTENT: PublicKnowledgeContent = {
  path: "/use-cases/agencies",
  breadcrumbLabel: "AI Workforce for Agencies",
  kicker: "AGENCY USE CASE",
  title: "Run an AI advertising agency with client, brand, budget, and legal boundaries.",
  summary:
    "The RYTHM Advertising Agency pattern coordinates GTM strategy, client accounts, creative, content, performance, analytics, finance, legal/compliance, and operations under Human CEO approval.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "SPECIALIST TEAM",
      title: "Separate strategic, creative, analytical, and control responsibilities.",
      items: [
        { title: "Client and strategy", detail: "GTM strategy and account roles clarify objectives, audiences, offer, evidence, channels, constraints, and decision criteria." },
        { title: "Creative and distribution", detail: "Creative and content specialists prepare concepts and channel-ready drafts without autonomous publication." },
        { title: "Performance and governance", detail: "Performance, analytics, finance, legal, and operations roles review measurement, spend, claims, risk, and delivery readiness." },
      ],
    },
    {
      eyebrow: "CAMPAIGN LOOP",
      title: "Turn a client brief into an approval-ready campaign plan.",
      items: [
        { title: "Brief and evidence", detail: "Record the commercial objective, audience, claims evidence, budget boundary, channel access, brand rules, and delivery deadline." },
        { title: "Cross-functional review", detail: "Strategy, creative, performance, analytics, finance, and legal roles challenge the plan before approval." },
        { title: "Controlled activation", detail: "Publishing and spend changes remain exact, scoped actions requiring the appropriate Human CEO or authorized human approval." },
      ],
    },
    {
      eyebrow: "INTEGRATION STATUS",
      title: "Advertising contracts do not imply active provider adapters.",
      paragraphs: [
        "Meta Marketing, Google Ads, YouTube, TikTok for Business, and LinkedIn Marketing capability contracts exist in the company standard, but they remain disabled until provider adapters, allowlisting, scopes, credential handling, and execution verification are production-ready.",
      ],
    },
  ],
  questions: [
    { question: "Can an Agent launch a paid campaign?", answer: "Not autonomously. Campaign creation and material changes require an exact approved action; budget or spend authorization is Human CEO-only in the current governance contract." },
    { question: "Can RYTHM make performance guarantees?", answer: "No. Agents must separate evidence, assumptions, attribution limits, and forecasts. RYTHM does not guarantee ROAS, conversion, or market outcomes." },
    { question: "Can the agency serve multiple clients?", answer: "The operating model can support client-specific work, but customer data, permissions, claims, approvals, and connected accounts must remain appropriately separated and authorized." },
  ],
  primaryCta: { label: "View the Agency template", href: "/templates" },
};

export const SOFTWARE_USE_CASE_CONTENT: PublicKnowledgeContent = {
  path: "/use-cases/software-companies",
  breadcrumbLabel: "AI Agents for Software Companies",
  kicker: "SOFTWARE COMPANY USE CASE",
  title: "Coordinate a software company from product intent to governed production release.",
  summary:
    "The RYTHM Software Company pattern brings product, design, architecture, engineering, QA, security, DevOps, documentation, growth, support, finance, and operations into one traceable delivery model.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "FUNCTION COVERAGE",
      title: "Software delivery needs more than a coding Agent.",
      items: [
        { title: "Product and design", detail: "Define evidence, requirements, user experience, acceptance criteria, trade-offs, roadmap, and accountable outcomes." },
        { title: "Engineering and quality", detail: "Coordinate architecture, frontend, backend, database, AI automation, testing, security, documentation, and reliability." },
        { title: "Business operations", detail: "Connect growth, sales, customer support, finance, legal/risk, people operations, and executive decisions to delivery." },
      ],
    },
    {
      eyebrow: "DELIVERY CONTROL",
      title: "Use preview, evidence, approval, and rollback boundaries.",
      items: [
        { title: "Plan", detail: "Convert approved product intent into milestones, dependencies, owners, risks, acceptance criteria, and evidence requirements." },
        { title: "Verify", detail: "Code, tests, security review, build output, preview behavior, and observability are checked before production promotion." },
        { title: "Release", detail: "Production deployment remains a scoped, approved action with a known artifact, target, verification plan, and rollback path." },
      ],
    },
    {
      eyebrow: "CONNECTED DELIVERY",
      title: "Current execution contracts cover core software operations.",
      paragraphs: [
        "The governed gateway represents GitHub repository work, Vercel deployment, Supabase database operations, and Cloudflare DNS. Availability and execution depend on connected credentials, scopes, permissions, risk, approval, environment, and rollout controls.",
      ],
    },
  ],
  questions: [
    { question: "Can RYTHM write code?", answer: "Supported Agents can analyze and prepare code changes within their role. Writing to an external repository requires a supported integration, permission, exact scope, and the applicable approval." },
    { question: "Can RYTHM deploy to production?", answer: "The execution architecture includes a production deployment operation, but it is high-risk, approval-required, tenant-scoped, and subject to configured rollout and credentials." },
    { question: "Does the template include security and QA?", answer: "Yes. The current Software Company pattern includes dedicated quality and application-security responsibilities rather than treating them as optional afterthoughts." },
  ],
  primaryCta: { label: "View the Software template", href: "/templates" },
};

export const GLOSSARY_CONTENT: PublicKnowledgeContent = {
  path: "/glossary",
  breadcrumbLabel: "AI Workforce Glossary",
  kicker: "RYTHM GLOSSARY",
  title: "Clear definitions for AI workforce and agentic operations.",
  summary:
    "A first-party glossary for the product and market terms used across RYTHM Company OS. Definitions describe the current RYTHM model and do not claim that every market participant uses the terms identically.",
  reviewedOn: REVIEW_DATE,
  sections: [
    {
      eyebrow: "ORGANIZATION",
      title: "Workforce and company terms",
      items: [
        { title: "AI workforce", detail: "A coordinated set of specialized AI Agents with roles, context, permissions, reporting relationships, and escalation boundaries." },
        { title: "AI Agent", detail: "An AI system configured for a defined organizational role, task boundary, knowledge scope, permissions, risk, and approval model." },
        { title: "AI company operating system", detail: "A platform that connects AI workforce design with company context, coordination, decisions, approvals, actions, and traceability." },
        { title: "Human CEO", detail: "The human role that retains final consequential authority in the RYTHM company model." },
        { title: "AI organization", detail: "An organizational structure containing AI roles and, where applicable, human roles, reporting lines, departments, responsibilities, and governance." },
      ],
    },
    {
      eyebrow: "INTELLIGENCE",
      title: "Agent and context terms",
      items: [
        { title: "Multi-agent system", detail: "A system where multiple AI Agents contribute distinct role-based work or deliberation toward a shared objective." },
        { title: "Agentic workflow", detail: "A workflow in which AI can interpret context and choose bounded steps, while permissions and human decision rights still constrain execution." },
        { title: "Company Memory", detail: "Persistent governed organizational context available within tenant, role, purpose, and authorization boundaries." },
        { title: "Request Intelligence", detail: "RYTHM's centralized classification of language, intent, task, complexity, risk, tools, context, permissions, cost, and routing needs." },
      ],
    },
    {
      eyebrow: "GOVERNANCE",
      title: "Authority and execution terms",
      items: [
        { title: "Human-in-the-loop", detail: "A control pattern where a human reviews, decides, approves, corrects, or closes work at defined points." },
        { title: "Governed execution", detail: "Execution that passes through capability, permission, scope, risk, approval, idempotency, verification, and audit controls." },
        { title: "Risk ceiling", detail: "The highest risk level an Agent or operation may handle under its current policy and authority." },
        { title: "External action", detail: "An action that changes or communicates with a system outside the current RYTHM tenant, such as publishing, emailing, spending, deploying, or updating provider data." },
        { title: "Execution ledger", detail: "The tenant-scoped record of proposal, policy decision, approval, execution attempt, verification, outcome, and supported compensating action." },
      ],
    },
  ],
  questions: [
    { question: "Why does RYTHM avoid calling Agents employees?", answer: "The word employee can imply human legal and social status. RYTHM uses AI Agent and AI workforce to preserve explicit AI identity and avoid presenting software as a human worker." },
    { question: "Does agentic mean autonomous?", answer: "Not necessarily. Agentic behavior can include choosing bounded steps or tools, while autonomy describes the degree of independent authority. RYTHM intentionally limits consequential autonomy." },
    { question: "What is a virtual company?", answer: "The phrase can mean a remote human company or a simulated/AI-operated organization. Because it is ambiguous, RYTHM does not use it as the primary product category." },
  ],
  primaryCta: { label: "Read the AI Workforce guide", href: "/ai-workforce" },
  secondaryCta: { label: "Read the FAQ", href: "/faq" },
};
