import type { AgentProvider } from "@/lib/agent-builder";

export type ProviderEligibility = {
  provider: AgentProvider;
  registered: boolean;
  technicallySupported: boolean;
  environmentEnabled: boolean;
  productionApproved: boolean;
  eligible: boolean;
  reasonCodes: string[];
};

const REGISTERED_PROVIDERS = new Set<AgentProvider>(["openai", "anthropic", "google"]);
const TECHNICALLY_SUPPORTED_PROVIDERS = new Set<AgentProvider>(["openai", "anthropic", "google"]);
const PRODUCTION_APPROVED_PROVIDERS = new Set<AgentProvider>(["openai"]);

function providerKey(provider: AgentProvider, environment: NodeJS.ProcessEnv) {
  if (provider === "openai") return environment.OPENAI_API_KEY;
  if (provider === "anthropic") return environment.ANTHROPIC_API_KEY;
  return environment.GEMINI_API_KEY;
}

export function getProviderEligibility(
  provider: AgentProvider,
  runtimeEnvironment: string,
  environment: NodeJS.ProcessEnv = process.env,
): ProviderEligibility {
  const registered = REGISTERED_PROVIDERS.has(provider);
  const technicallySupported = TECHNICALLY_SUPPORTED_PROVIDERS.has(provider);
  const environmentEnabled = Boolean(providerKey(provider, environment)?.trim());
  const productionApproved = PRODUCTION_APPROVED_PROVIDERS.has(provider);
  const production = runtimeEnvironment === "production";
  const reasonCodes: string[] = [];
  if (!registered) reasonCodes.push("provider_not_registered");
  if (!technicallySupported) reasonCodes.push("provider_not_supported");
  if (!environmentEnabled) reasonCodes.push("provider_not_environment_enabled");
  if (production && !productionApproved) reasonCodes.push("provider_not_production_approved");
  return {
    provider,
    registered,
    technicallySupported,
    environmentEnabled,
    productionApproved,
    eligible: registered && technicallySupported && environmentEnabled && (!production || productionApproved),
    reasonCodes,
  };
}

export function listProviderEligibility(runtimeEnvironment: string, environment: NodeJS.ProcessEnv = process.env) {
  return (["openai", "anthropic", "google"] as AgentProvider[]).map((provider) => getProviderEligibility(provider, runtimeEnvironment, environment));
}
