import type { Metadata } from "next";

export const SITE_ORIGIN = "https://company.rythm-os.com";
export const SITE_NAME = "RYTHM Company OS";
export const DEFAULT_DESCRIPTION =
  "Build and operate a governed AI company with a Human CEO, specialized AI Agents, Company Memory, meetings, approvals, and traceable execution.";
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
    title: "RYTHM Company OS — Governed AI Company Operating System",
    description: DEFAULT_DESCRIPTION,
    changeFrequency: "weekly",
    priority: 1,
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
          alt: "RYTHM Company OS — the governed AI company operating system",
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
        propertyID: "Hungarian individual entrepreneur registration number",
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
      knowsAbout: [
        "Governed AI companies",
        "AI workforce governance",
        "Human-in-the-loop AI",
        "AI agents",
        "Company operating systems",
      ],
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
