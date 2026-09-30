export type ProviderAvailability = { setup_availability?: string | null };

export function canStartProviderSetup(provider: ProviderAvailability) {
  return provider.setup_availability === "available" || provider.setup_availability === "setup_available";
}

export function providerAvailabilityLabel(provider: ProviderAvailability) {
  if (provider.setup_availability === "available") return "Available";
  if (provider.setup_availability === "setup_available") return "Setup available";
  if (provider.setup_availability === "coming_later") return "Coming later";
  return "Setup unavailable";
}

export function initialSetupProvider<T extends ProviderAvailability & { provider_key: string }>(providers: T[], requested?: string) {
  return providers.find(provider => provider.provider_key === requested && canStartProviderSetup(provider))
    ?? providers.find(canStartProviderSetup);
}
