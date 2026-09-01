import type { Metadata } from "next";

export const SITE_ORIGIN = "https://rythm-os.com";
export const SITE_NAME = "RYTHM Company OS";
export const DEFAULT_DESCRIPTION =
  "RYTHM Company OS is a governed AI workforce platform for building and operating specialized AI Agent teams under Human CEO authority.";
export const SOCIAL_IMAGE_PATH = "/brand/social/rythm-open-graph-1200x630.png";

export type PublicRoute = Readonly<{
  path: string;
  title: string;
  description: string;
  changeFrequency: "weekly" | "monthly";
  priority: number;
}>;

export const PUBLIC_ROUTES: readonly PublicRoute[] = [
  {
    path: "/",
    title: "Governed AI Workforce Platform | RYTHM Company OS",
    description: DEFAULT_DESCRIPTION,
    changeFrequency: "weekly",
    priority: 1,
  },
  {
    path: "/about",
    title: "About RYTHM Company OS",
    description:
      "Learn what RYTHM Company OS is, who operates it, and how its governed AI workforce model keeps consequential authority with a Human CEO.",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/ai-workforce",
    title: "Governed AI Workforce Platform",
    description:
      "Learn how RYTHM structures specialized AI Agent teams with Company Memory, organizational roles, approvals, and Human CEO authority.",
    changeFrequency: "monthly",
    priority: 0.95,
  },
  {
    path: "/ai-agents-for-business",
    title: "AI Agents for Business",
    description:
      "See how RYTHM gives business AI Agents defined roles, knowledge, permissions, risk limits, reporting context, and human approval boundaries.",
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/how-it-works",
    title: "How RYTHM Company OS Works",
    description:
      "Follow the RYTHM operating loop from company context and multi-agent deliberation through human decisions, approvals, execution, and traceability.",
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/product",
    title: "Governed AI Company Operating System",
    description:
      "See how RYTHM connects an AI workforce, Company Memory, projects, meetings, decisions, approvals, actions, economics, and traceability under human authority.",
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/product/ai-agents",
    title: "RYTHM AI Agents and Roles",
    description:
      "Explore RYTHM AI Agent role families, responsibilities, professional knowledge, permissions, reporting lines, risk limits, and customization boundaries.",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/product/integrations",
    title: "Governed AI Agent Integrations",
    description:
      "Review RYTHM integration architecture, current gateway providers, connection lifecycle, permissions, approval controls, and planned connector families.",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/product-architecture",
    title: "Multi-Agent Product Architecture",
    description:
      "Understand how RYTHM separates organization context, request intelligence, multi-agent work, human decisions, governed execution, and audit evidence.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/use-cases",
    title: "AI Workforce Use Cases",
    description:
      "Explore substantive RYTHM AI workforce use cases for startups, advertising agencies, software companies, and custom organizations.",
    changeFrequency: "monthly",
    priority: 0.82,
  },
  {
    path: "/use-cases/startups",
    title: "AI Workforce for Startups",
    description:
      "See how founders can coordinate product, delivery, growth, support, finance, and risk with a lean governed AI workforce.",
    changeFrequency: "monthly",
    priority: 0.75,
  },
  {
    path: "/use-cases/agencies",
    title: "AI Workforce for Advertising Agencies",
    description:
      "See how RYTHM coordinates agency strategy, accounts, creative, content, performance, analytics, finance, legal, and operations under human approval.",
    changeFrequency: "monthly",
    priority: 0.75,
  },
  {
    path: "/use-cases/software-companies",
    title: "AI Agents for Software Companies",
    description:
      "See how RYTHM coordinates product, design, engineering, QA, security, DevOps, growth, support, and business operations through governed delivery.",
    changeFrequency: "monthly",
    priority: 0.75,
  },
  {
    path: "/faq",
    title: "RYTHM Company OS FAQ",
    description:
      "Get direct answers about RYTHM, AI workforces, business Agents, pricing, security, integrations, human approval, custom Agents, and Public Beta limits.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/docs",
    title: "RYTHM Company OS Documentation",
    description:
      "Start with public RYTHM documentation for AI workforce concepts, setup paths, governance, Company Memory, integrations, and product architecture.",
    changeFrequency: "monthly",
    priority: 0.78,
  },
  {
    path: "/glossary",
    title: "AI Workforce and Agentic Operations Glossary",
    description:
      "Clear definitions for AI workforce, AI Agent, multi-agent system, Company Memory, human-in-the-loop, governed execution, and related RYTHM terms.",
    changeFrequency: "monthly",
    priority: 0.72,
  },
  {
    path: "/compare",
    title: "Compare AI Workforce and Agent Platforms",
    description:
      "Compare RYTHM Company OS with current AI Agent, AI workforce, and multi-agent platforms using fair criteria and official competitor sources.",
    changeFrequency: "monthly",
    priority: 0.78,
  },
  {
    path: "/compare/lindy",
    title: "RYTHM Company OS vs Lindy",
    description:
      "Compare RYTHM's governed AI workforce and company operating model with Lindy's AI teammate and tool-connected Agent approach.",
    changeFrequency: "monthly",
    priority: 0.72,
  },
  {
    path: "/compare/relevance-ai",
    title: "RYTHM Company OS vs Relevance AI",
    description:
      "Compare RYTHM's company operating model with Relevance AI's low/no-code AI Agents and visual multi-agent Workforces.",
    changeFrequency: "monthly",
    priority: 0.74,
  },
  {
    path: "/compare/crewai",
    title: "RYTHM Company OS vs CrewAI",
    description:
      "Compare RYTHM's managed governed AI organization with CrewAI's developer-oriented multi-agent framework and enterprise platform.",
    changeFrequency: "monthly",
    priority: 0.72,
  },
  {
    path: "/compare/microsoft-copilot-studio",
    title: "RYTHM Company OS vs Microsoft Copilot Studio",
    description:
      "Compare RYTHM's governed AI company operating model with Microsoft Copilot Studio's custom Agent and workflow platform.",
    changeFrequency: "monthly",
    priority: 0.72,
  },
  {
    path: "/demo",
    title: "Interactive Demo",
    description:
      "Explore Nova Commerce, a synthetic read-only RYTHM workspace with AI Agents, projects, meetings, decisions, approvals, and operational traceability.",
    changeFrequency: "monthly",
    priority: 0.9,
  },
  {
    path: "/solutions",
    title: "AI Company Solutions",
    description:
      "Compare Ready AI Company, Custom AI Company, and Enterprise AI Workforce models by how your organization needs to operate and govern AI work.",
    changeFrequency: "monthly",
    priority: 0.85,
  },
  {
    path: "/templates",
    title: "AI Company Templates",
    description:
      "Explore governed AI company and workforce templates before creating an account or provisioning a persistent organization.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/pricing",
    title: "Pricing and Product Comparison",
    description:
      "Compare configurable Public Beta offers for Ready AI Company, Custom AI Company, assisted implementation, and Enterprise AI Workforce paths.",
    changeFrequency: "weekly",
    priority: 0.85,
  },
  {
    path: "/enterprise",
    title: "Enterprise AI Workforce",
    description:
      "Plan governed AI teams across departments, human managers, AI roles, knowledge boundaries, approvals, auditability, and executive oversight.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/live-ai-meeting",
    title: "Live AI Meeting",
    description:
      "Try RYTHM with a real business objective in a bounded AI and human Boardroom experience with explicit roles, governance, and structured output.",
    changeFrequency: "monthly",
    priority: 0.8,
  },
  {
    path: "/trust",
    title: "Trust Center",
    description:
      "Review RYTHM Company OS governance boundaries, tenant isolation, Human CEO authority, authentication controls, and Public Beta trust disclosures.",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/security",
    title: "Security",
    description:
      "Review the current RYTHM Company OS Public Beta security posture for identity, tenant-aware data access, AI governance, and responsible security reporting.",
    changeFrequency: "monthly",
    priority: 0.7,
  },
  {
    path: "/support",
    title: "Support",
    description:
      "Find the correct RYTHM Public Beta path for account recovery, product help, commercial questions, enterprise review, and security reports.",
    changeFrequency: "monthly",
    priority: 0.65,
  },
  {
    path: "/contact",
    title: "Contact",
    description:
      "Contact RYTHM Company OS for product questions, support, billing, legal, privacy, partnerships, and general enquiries.",
    changeFrequency: "monthly",
    priority: 0.6,
  },
  {
    path: "/legal",
    title: "Legal Notice",
    description:
      "Legal and business identity for the Hungarian individual entrepreneur operating RYTHM Company OS, with official contact channels.",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/privacy",
    title: "Privacy Policy",
    description:
      "Learn how RYTHM Company OS processes account, workspace, support, security, billing, and AI-related data during the Public Beta.",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/terms",
    title: "Terms of Service",
    description:
      "Review the Public Beta terms governing professional and organizational use of RYTHM Company OS, including AI, accounts, content, and commercial access.",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/consumer-rights",
    title: "Consumer Rights",
    description:
      "Mandatory consumer information for RYTHM digital services, complaints, withdrawal, conformity remedies, and alternative dispute resolution.",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/consumer-terms",
    title: "Consumer Terms",
    description:
      "Consumer-specific terms for RYTHM digital services, one-off AI meetings, subscriptions, payment, withdrawal, and statutory remedies.",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/withdrawal",
    title: "Withdraw from Contract",
    description:
      "Use RYTHM's online withdrawal function for eligible consumer distance contracts and download a durable acknowledgement.",
    changeFrequency: "monthly",
    priority: 0.5,
  },
  {
    path: "/cookies",
    title: "Cookie & Storage Notice",
    description:
      "Review the essential cookies, authentication state, and local browser preferences used by the current RYTHM Company OS Public Beta.",
    changeFrequency: "monthly",
    priority: 0.45,
  },
  {
    path: "/dpa",
    title: "Data Processing Addendum",
    description:
      "Review RYTHM Company OS GDPR processor terms, processing details, security measures, subprocessors, data-subject assistance, and incident obligations.",
    changeFrequency: "monthly",
    priority: 0.45,
  },
  {
    path: "/subprocessors",
    title: "Subprocessor Register",
    description:
      "Review the current infrastructure providers that may process customer personal data for the RYTHM Company OS Public Beta.",
    changeFrequency: "monthly",
    priority: 0.45,
  },
  {
    path: "/data-requests",
    title: "Privacy Data Requests",
    description:
      "Request access, correction, deletion, restriction, objection, portability, or a customer-data export from RYTHM Company OS.",
    changeFrequency: "monthly",
    priority: 0.45,
  },
  {
    path: "/ai-transparency",
    title: "AI Transparency & Governance",
    description:
      "Review how RYTHM identifies AI interactions, limits model data, preserves Human CEO authority, and gates consequential or regulated AI use cases.",
    changeFrequency: "monthly",
    priority: 0.55,
  },
] as const;

export function absoluteUrl(path: string) {
  return new URL(path, SITE_ORIGIN).toString();
}

export function getPublicRoute(path: string) {
  const route = PUBLIC_ROUTES.find((item) => item.path === path);
  if (!route) throw new Error(`No public SEO definition exists for ${path}`);
  return route;
}

export function createPublicMetadata(path: string): Metadata {
  const route = getPublicRoute(path);
  const isHome = path === "/";

  return {
    title: isHome ? { absolute: route.title } : route.title,
    description: route.description,
    alternates: { canonical: path },
    openGraph: {
      type: "website",
      url: path,
      siteName: SITE_NAME,
      title: route.title,
      description: route.description,
      locale: "en_US",
      images: [
        {
          url: SOCIAL_IMAGE_PATH,
          width: 1200,
          height: 630,
          alt: "RYTHM Company OS — governed AI workforce platform",
        },
      ],
    },
    twitter: {
      card: "summary_large_image",
      title: route.title,
      description: route.description,
      images: [SOCIAL_IMAGE_PATH],
    },
  };
}

export const ORGANIZATION_GRAPH = {
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": `${SITE_ORIGIN}/#organization`,
      name: SITE_NAME,
      legalName: "Tayyebialashti Yaser E.V.",
      alternateName: ["RYTHM", "RYTHM OS"],
      url: SITE_ORIGIN,
      taxID: "48332376-1-42",
      identifier: {
        "@type": "PropertyValue",
        propertyID: "Hungarian Individual Entrepreneurs Register",
        value: "58642889",
      },
      email: "hello@rythm-os.com",
      address: {
        "@type": "PostalAddress",
        streetAddress: "Gizella út 35",
        postalCode: "1143",
        addressLocality: "Budapest",
        addressCountry: "HU",
      },
      contactPoint: [
        { "@type": "ContactPoint", contactType: "customer support", email: "support@rythm-os.com" },
        { "@type": "ContactPoint", contactType: "sales", email: "sales@rythm-os.com" },
        { "@type": "ContactPoint", contactType: "privacy", email: "privacy@rythm-os.com" },
        { "@type": "ContactPoint", contactType: "security", email: "security@rythm-os.com" },
      ],
      logo: {
        "@type": "ImageObject",
        url: absoluteUrl("/brand/rythm-mark-primary-1024.png"),
        contentUrl: absoluteUrl("/brand/rythm-mark-primary-1024.png"),
        width: 1024,
        height: 1024,
      },
      description: DEFAULT_DESCRIPTION,
      founder: { "@id": `${SITE_ORIGIN}/#founder` },
      brand: {
        "@type": "Brand",
        name: "RYTHM",
        alternateName: "RYTHM Company OS",
        url: SITE_ORIGIN,
      },
      knowsAbout: [
        "Governed AI workforce platforms",
        "AI agents for business",
        "Multi-agent business operations",
        "Governed AI companies",
        "AI workforce governance",
        "Human-in-the-loop AI",
        "Company operating systems",
      ],
    },
    {
      "@type": "Person",
      "@id": `${SITE_ORIGIN}/#founder`,
      name: "Yaser Tayyebialashti",
      jobTitle: "Founder and Operator",
      worksFor: { "@id": `${SITE_ORIGIN}/#organization` },
      sameAs: ["https://hu.linkedin.com/in/tayyebialashti"],
    },
    {
      "@type": "WebSite",
      "@id": `${SITE_ORIGIN}/#website`,
      url: SITE_ORIGIN,
      name: SITE_NAME,
      alternateName: "RYTHM",
      description: DEFAULT_DESCRIPTION,
      inLanguage: "en",
      publisher: { "@id": `${SITE_ORIGIN}/#organization` },
    },
  ],
} as const;

export const PRODUCT_GRAPH = {
  "@context": "https://schema.org",
  "@type": "WebApplication",
  "@id": `${SITE_ORIGIN}/#company-os`,
  name: SITE_NAME,
  url: absoluteUrl("/product"),
  applicationCategory: "BusinessApplication",
  applicationSubCategory: "Governed AI workforce platform",
  operatingSystem: "Web",
  description: DEFAULT_DESCRIPTION,
  publisher: { "@id": `${SITE_ORIGIN}/#organization` },
  featureList: [
    "Governed AI workforce",
    "Human CEO authority",
    "Company Memory",
    "AI and human meetings",
    "Projects and accountable actions",
    "Approvals, governance, and traceability",
  ],
} as const;
