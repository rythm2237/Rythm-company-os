export type ModelTier = "luna" | "terra" | "sol";
export type ReasoningLevel = "low" | "medium" | "high";
export type RiskLevel = "low" | "medium" | "high" | "restricted";
export type TaskComplexity = "low" | "medium" | "high";
export type OperationType = "read" | "analyze" | "recommend" | "write" | "execute" | "delete" | "external_action";
export type CostStrategy = "economy" | "balanced" | "quality";
export type ModelPolicyMode = "adaptive" | "fixed";

export type ModelPolicy = {
  mode: ModelPolicyMode;
  preferredTier?: ModelTier;
  minimumTier?: ModelTier;
  maximumTier?: ModelTier;
  fixedProvider?: "openai" | "anthropic" | "google";
  fixedModel?: string;
  allowEscalation: boolean;
  maxEscalations: number;
  maxRetries: number;
  maxTokens?: number;
  maxCostPerRequest?: number;
  costStrategy: CostStrategy;
};

export type LanguageSignals = {
  explicitLanguage?: string | null;
  conversationLanguage?: string | null;
  messageLanguage?: string | null;
  savedLanguage?: string | null;
  systemDefault?: string | null;
};

export type RequestIntelligence = {
  language: string;
  responseLanguage: string;
  intent: string;
  taskType: string;
  operation: OperationType;
  complexity: TaskComplexity;
  risk: RiskLevel;
  reasoningRequirement: ReasoningLevel;
  requiredTools: string[];
  requiredCapabilities: string[];
  recommendedTier: ModelTier;
  confidence: number;
  allowEscalation: boolean;
  classificationSource: "deterministic" | "classifier" | "fallback";
};

export type ProviderCapability = {
  provider: "openai" | "anthropic" | "google";
  model: string;
  tier: ModelTier;
  reasoningLevels: ReasoningLevel[];
  supportsImages: boolean;
  supportsFiles: boolean;
  supportsTools: boolean;
  maxContextTokens?: number;
  inputCostPerMillionUsd?: number;
  outputCostPerMillionUsd?: number;
};

export type RoutingDecision = RequestIntelligence & {
  requestId: string;
  selectedTier: ModelTier;
  selectedProvider: ProviderCapability["provider"];
  selectedModel: string;
  reasoningLevel: ReasoningLevel;
  estimatedCostUsd: number | null;
  escalationIndex: number;
  routingVersion: string;
};

export type AgentRoutingPolicy = {
  agentId?: string;
  roleTitle?: string;
  capabilities?: string[];
  allowedTools?: string[];
  permissions?: string[];
  riskCeiling?: RiskLevel;
  modelPolicy?: Partial<ModelPolicy>;
  savedLanguage?: string | null;
};

export type TenantAiPolicy = {
  allowedTiers?: ModelTier[];
  aiBudgetLimit?: number | null;
  remainingAiAllowance?: number | null;
  costStrategy?: CostStrategy;
  maxContextTokens?: number | null;
  advancedReasoningAllowed?: boolean;
};

export const DEFAULT_MODEL_POLICY: ModelPolicy = {
  mode: "adaptive",
  allowEscalation: true,
  maxEscalations: 2,
  maxRetries: 1,
  costStrategy: "balanced",
};
