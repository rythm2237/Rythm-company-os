export type CommercialProduct = "ready_company" | "company_studio";

// Public template selection is an offer choice. Software Company requires the
// Studio capacity and entitlement in the Production template catalog (19 Agents).
export const COMMERCIAL_TEMPLATES = {
  ready_ai_advertising_agency_v1: { name: "AI Advertising Agency", product: "ready_company", offer: "ready_ai_company" },
  ready_software_company_v1: { name: "Software Company", product: "company_studio", offer: "custom_ai_company" },
} as const;

export function selectedCommercialOffer(product: string | null | undefined, template: string | null | undefined) {
  const templateKey = template && Object.hasOwn(COMMERCIAL_TEMPLATES, template)
    ? template as keyof typeof COMMERCIAL_TEMPLATES : "";
  const productCode: CommercialProduct = templateKey
    ? COMMERCIAL_TEMPLATES[templateKey].product
    : product === "ready_company" ? "ready_company" : "company_studio";
  return { productCode, templateKey, offerCode: templateKey
    ? COMMERCIAL_TEMPLATES[templateKey].offer
    : productCode === "ready_company" ? "ready_ai_company" : "custom_ai_company" };
}

export function commercialTemplateName(template: string) {
  return Object.hasOwn(COMMERCIAL_TEMPLATES, template)
    ? COMMERCIAL_TEMPLATES[template as keyof typeof COMMERCIAL_TEMPLATES].name : "";
}

export function commercialSetupPath(selection: ReturnType<typeof selectedCommercialOffer>) {
  const query = new URLSearchParams({ product: selection.productCode });
  if (selection.templateKey) query.set("template", selection.templateKey);
  return `/setup/company?${query}`;
}

export function commercialSignupPath(selection: ReturnType<typeof selectedCommercialOffer>) {
  const query = new URLSearchParams({ product: selection.productCode });
  if (selection.templateKey) query.set("template", selection.templateKey);
  return `/signup?${query}`;
}
