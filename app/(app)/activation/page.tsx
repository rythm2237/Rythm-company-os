import Link from "next/link";
import { redirect } from "next/navigation";
import {
  isOrganizationEntitlementActive,
  requireOwnerOrganizationContext,
} from "@/lib/auth/organization-context";
import { commercialTemplateName, selectedCommercialOffer } from "@/lib/commercial/selection";

export const dynamic = "force-dynamic";

type Props = { searchParams: Promise<{ template?: string }> };

const PRODUCT_LABELS: Record<string, string> = {
  ready_company: "Ready AI Company",
  company_studio: "Custom AI Company with Company Studio",
  custom_company: "Legacy Custom Company",
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
  const { data: commercialRecord } = context.entitlement
    ? await context.supabase
        .from("organization_entitlements")
        .select("currency,base_price,billing_interval,ai_usage_policy,selected_template_key")
        .eq("organization_id", context.organizationId)
        .maybeSingle()
    : { data: null };
  const persistedTemplate = commercialRecord?.selected_template_key;
  const requestedTemplate = isOrganizationEntitlementActive(context.entitlement)
    ? params.template ?? persistedTemplate
    : persistedTemplate;
  const chosen = selectedCommercialOffer(context.entitlement?.product_code, requestedTemplate);
  // A URL or mutable user metadata cannot substitute another product's template.
  const selectedTemplate = chosen.templateKey && chosen.productCode === context.entitlement?.product_code
    ? chosen.templateKey : "";

  if (isOrganizationEntitlementActive(context.entitlement)) {
    redirect(selectedTemplate
      ? `/studio/templates?template=${encodeURIComponent(selectedTemplate)}`
      : "/onboarding?source=commercial_activation");
  }

  const entitlement = context.entitlement;
  const status = entitlement?.status ?? "not provisioned";

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
          <span>Organization ID</span><strong>{context.organizationId}</strong>
          <span>Selected product</span><strong>{productLabel}</strong>
          {selectedTemplate ? <><span>Selected Ready Company</span><strong>{commercialTemplateName(selectedTemplate)}</strong></> : null}
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
          Paid Public Beta uses assisted B2B activation. Contact Billing with your organization ID
          and selected product. RYTHM confirms scope, taxes, invoice and payment before a
          platform administrator records the paid service period and activates your entitlement. Your selected Ready Company opens in the
          template library, where you confirm provisioning before it is installed.
        </p>
        <p>
          Creating this account does not place an order or charge you. AI usage and connected-provider costs are confirmed separately from the company subscription.
        </p>

        <div className="activation-actions">
          <Link className="primary-link" href="/contact?topic=activation">Request invoice and activation</Link>
          <Link href="/pricing">Review product and pricing</Link>
        </div>
      </section>
    </main>
  );
}
