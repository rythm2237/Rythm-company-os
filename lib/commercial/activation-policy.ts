// Launch policy is explicit: adding provider credentials must never enable checkout.
export const COMMERCIAL_ACTIVATION_MODEL = "assisted" as const;
export const ONLINE_CHECKOUT_ENABLED = false;
export const ASSISTED_ACTIVATION_COPY = "B2B activation is assisted. Creating an account does not place an order or charge you. RYTHM confirms the scope, invoice, taxes and payment before enabling paid access.";

export function commercialContactPath(offerCode?: string) {
  const params = new URLSearchParams({ topic: "activation" });
  if (offerCode) params.set("offer", offerCode);
  return `/contact?${params}`;
}
