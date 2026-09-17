import type { OrganizationEntitlement } from "@/lib/auth/organization-context";

const PREMIUM_PRODUCTS = new Set(["custom_company", "company_studio"]);

function internalAllowlist() {
  return new Set((process.env.RYTHM_CONNECTION_AGENT_ORG_ALLOWLIST ?? "").split(",").map(value => value.trim()).filter(Boolean));
}

export function hasPremiumConnectionAiSetupAccess(input: { organizationId: string; entitlement: OrganizationEntitlement | null | undefined }) {
  if (internalAllowlist().has(input.organizationId)) return true;
  if (!input.entitlement || input.entitlement.status !== "active") return false;
  return PREMIUM_PRODUCTS.has(input.entitlement.product_code);
}

export const connectionAiSetupPlanMessage = "AI-assisted connection setup is available on Custom Company and Company Studio plans. Guide me and direct OAuth remain available without cloud-browser usage.";
