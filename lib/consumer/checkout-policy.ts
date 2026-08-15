export type ConsumerCheckoutInput = {
  offerCode: string;
  serviceName: string;
  serviceDescription: string;
  currency: string;
  totalPriceMinor: number | null;
  taxIncluded: boolean;
  paymentMethodLabel: string | null;
  performanceStart: string | null;
  contractDuration: string | null;
  billingInterval: string | null;
  renewalTerms: string | null;
  cancellationTerms: string | null;
  minimumCommitment: string | null;
  withdrawalDisclosure: string | null;
  consumerEligible: boolean;
};

export type ConsumerCheckoutReadiness = {
  ready: boolean;
  missing: string[];
};

export const CONSUMER_ORDER_BUTTON_LABEL = "Order with obligation to pay";

export function validateConsumerCheckout(input: ConsumerCheckoutInput): ConsumerCheckoutReadiness {
  const missing: string[] = [];

  if (!input.consumerEligible) missing.push("consumer eligibility");
  if (!input.offerCode.trim()) missing.push("offer code");
  if (!input.serviceName.trim()) missing.push("service name");
  if (!input.serviceDescription.trim()) missing.push("main service characteristics");
  if (!input.currency.trim()) missing.push("currency");
  if (!Number.isInteger(input.totalPriceMinor) || (input.totalPriceMinor ?? -1) < 0) missing.push("total payable price");
  if (!input.taxIncluded) missing.push("VAT/tax-inclusive total confirmation");
  if (!input.paymentMethodLabel?.trim()) missing.push("accepted payment method");
  if (!input.performanceStart?.trim()) missing.push("performance/access timing");
  if (!input.contractDuration?.trim()) missing.push("contract duration");
  if (!input.cancellationTerms?.trim()) missing.push("termination/cancellation terms");
  if (!input.withdrawalDisclosure?.trim()) missing.push("withdrawal disclosure");

  if (input.billingInterval && !input.renewalTerms?.trim()) {
    missing.push("subscription renewal terms");
  }

  return { ready: missing.length === 0, missing };
}

export function assertConsumerCheckoutReady(input: ConsumerCheckoutInput) {
  const result = validateConsumerCheckout(input);
  if (!result.ready) {
    throw new Error(`CONSUMER_CHECKOUT_NOT_READY: ${result.missing.join(", ")}`);
  }
  return result;
}
