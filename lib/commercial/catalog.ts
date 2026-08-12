import { createClient } from "@supabase/supabase-js";

export type CommercialOffer = {
  offer_code: string;
  entitlement_product_code: string | null;
  name: string;
  category: "subscription" | "enterprise" | "service";
  audience: string;
  summary: string;
  price_label: string;
  contact_sales: boolean;
  self_serve: boolean;
  cta_label: string;
  cta_href: string;
  features: string[];
  sort_order: number;
};

const FALLBACK_CATALOG: CommercialOffer[] = [
  {
    offer_code: "ready_ai_company",
    entitlement_product_code: "ready_company",
    name: "Ready AI Company",
    category: "subscription",
    audience: "Teams that want a governed AI company without designing the structure themselves.",
    summary: "Launch a pre-built company with a defined AI workforce, operating model, and Human CEO controls.",
    price_label: "€249 / month + AI usage",
    contact_sales: false,
    self_serve: true,
    cta_label: "Choose a Ready Company",
    cta_href: "/signup?product=ready_company",
    features: ["Pre-built company structure", "Specialized AI Agent workforce", "Human CEO workspace", "Governed operating loop", "Audit and budget controls"],
    sort_order: 10,
  },
  {
    offer_code: "custom_ai_company",
    entitlement_product_code: "company_studio",
    name: "Custom AI Company",
    category: "subscription",
    audience: "Businesses that need ongoing control over departments, Agents, responsibilities, and governance.",
    summary: "Design, build, modify, and govern your own AI company with the included Company Studio.",
    price_label: "€699 / month + AI usage",
    contact_sales: false,
    self_serve: true,
    cta_label: "Build a Custom AI Company",
    cta_href: "/signup?product=company_studio",
    features: ["Company Studio included", "Company and Agent builders", "Editable reporting structure", "RYTHM templates", "Configurable governance"],
    sort_order: 20,
  },
  {
    offer_code: "enterprise_ai_workforce",
    entitlement_product_code: null,
    name: "Enterprise AI Workforce",
    category: "enterprise",
    audience: "Larger organizations that require controlled rollout, integration planning, and enterprise governance.",
    summary: "Deploy a governed AI workforce across business functions with enterprise implementation and controls.",
    price_label: "Contact Sales",
    contact_sales: true,
    self_serve: false,
    cta_label: "Discuss Enterprise Beta",
    cta_href: "/contact?offer=enterprise_ai_workforce",
    features: ["Enterprise discovery", "Advanced governance design", "Integration architecture", "Custom capacity", "Controlled beta onboarding"],
    sort_order: 30,
  },
  {
    offer_code: "assisted_build",
    entitlement_product_code: null,
    name: "RYTHM Assisted Build",
    category: "service",
    audience: "Customers who want RYTHM to design and configure their company before handover.",
    summary: "Add expert-assisted company design, Agent definition, workflow configuration, and onboarding.",
    price_label: "From €2,500 implementation",
    contact_sales: true,
    self_serve: false,
    cta_label: "Request Assisted Build",
    cta_href: "/contact?offer=assisted_build",
    features: ["Company design workshop", "Agent configuration", "Governance setup", "Structured handover", "Optional change requests"],
    sort_order: 40,
  },
];

export async function getCommercialCatalog(): Promise<CommercialOffer[]> {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const publishableKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !publishableKey) return FALLBACK_CATALOG;

  try {
    const supabase = createClient(url, publishableKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await supabase
      .from("commercial_offers")
      .select("offer_code,entitlement_product_code,name,category,audience,summary,price_label,contact_sales,self_serve,cta_label,cta_href,features,sort_order")
      .eq("status", "public")
      .order("sort_order");

    if (error || !data?.length) return FALLBACK_CATALOG;
    return data as CommercialOffer[];
  } catch {
    return FALLBACK_CATALOG;
  }
}
