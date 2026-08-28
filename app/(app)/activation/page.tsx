import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isOrganizationEntitlementActive,
  requireOwnerOrganizationContext,
} from "@/lib/auth/organization-context";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ template?: string }> };

const PRODUCT_LABELS: Record<string, string> = {
  ready_company: "Ready AI Company",
  company_studio: "Custom AI Company with Company Studio",
  custom_company: "Legacy Custom Company",
};
const TEMPLATE_LABELS: Record<string, string> = {
  ready_saas_startup_v1: "SaaS Startup",
  ready_ai_advertising_agency_v1: "AI Advertising Agency",
  ready_software_company_v1: "Software Company",
};

function formatPrice(currency: string | undefined, value: number | undefined) {
  if (typeof value !== "number") return "Commercial confirmation required";
  try {
    return new Intl.NumberFormat("en-IE", {
      style: "currency",
      currency: currency || "EUR",
      maximumFractionDigits: 0,
    }).format(value);
  } catch {
    return `${currency || "EUR"} ${value}`;
  }
}

export default async function ActivationPage({ searchParams }: Props) {
  const params = await searchParams;
  const context = await requireOwnerOrganizationContext();
  const { data: { user } } = await context.supabase.auth.getUser();
  const metadataTemplate = typeof user?.user_metadata?.selected_template_key === "string"
    ? user.user_metadata.selected_template_key
    : "";
  const requestedTemplate = params.template ?? metadataTemplate;
  const selectedTemplate = TEMPLATE_LABELS[requestedTemplate] ? requestedTemplate : "";

  if (isOrganizationEntitlementActive(context.entitlement)) {
    redirect(selectedTemplate
      ? `/studio/templates?template=${encodeURIComponent(selectedTemplate)}`
      : "/onboarding?source=commercial_activation");
  }

  const entitlement = context.entitlement;
  const status = entitlement?.status ?? "not provisioned";

  const { data: commercialRecord } = entitlement
    ? await context.supabase
        .from("organization_entitlements")
        .select("currency,base_price,billing_interval,ai_usage_policy")
        .eq("organization_id", context.organizationId)
        .maybeSingle()
    : { data: null };

  const productLabel = entitlement
    ? PRODUCT_LABELS[entitlement.product_code] ?? entitlement.product_code
    : "Not selected";
  const basePrice = commercialRecord?.base_price == null
    ? undefined
    : Number(commercialRecord.base_price);
  const price = formatPrice(commercialRecord?.currency, basePrice);

  return (
    <main className="page-shell">
      <section className="panel activation-panel">
        <p className="eyebrow">PAID PUBLIC BETA · COMMERCIAL ACTIVATION</p>
        <h1>Complete commercial activation</h1>
        <p>
          Your account and isolated organization shell are ready. RYTHM keeps product
          capabilities locked until commercial confirmation and payment / invoice confirmation
          are complete.
        </p>

        <div className="activation-status">
          <span>Organization</span><strong>{context.organization.name}</strong>
          <span>Selected product</span><strong>{productLabel}</strong>
          {selectedTemplate ? <><span>Selected Ready Company</span><strong>{TEMPLATE_LABELS[selectedTemplate]}</strong></> : null}
          <span>Subscription</span><strong>{price}{commercialRecord?.billing_interval ? ` / ${commercialRecord.billing_interval}` : ""} + AI usage</strong>
          <span>Entitlement status</span><strong>{status}</strong>
        </div>

        <div className="activation-status" aria-label="Activation progress">
          <span>1 · Account</span><strong>Complete</strong>
          <span>2 · Organization + entitlement</span><strong>Reserved · locked</strong>
          <span>3 · Payment / invoice</span><strong>Confirmation pending</strong>
          <span>4 · Product provisioning</span><strong>Locked until entitlement is active</strong>
        </div>

        <p>
          Paid Public Beta uses controlled commercial confirmation. RYTHM may confirm invoices
          manually; a payment-provider webhook is not required for launch. When payment is
          confirmed, the entitlement becomes active and an explicitly selected Ready Company is
          resumed without asking you to find it again.
        </p>
        <p>
          This boundary is enforced server-side and in database mutation guards. A pending
          entitlement cannot create or modify Agents, provision company templates, or use Company
          Builder capabilities even if a restricted URL is opened directly.
        </p>

        <div className="activation-actions">
          <Link className="primary-link" href="/contact?topic=activation">Continue commercial activation</Link>
          <Link href="/pricing">Review product and pricing</Link>
        </div>
      </section>
    </main>
  );
}
