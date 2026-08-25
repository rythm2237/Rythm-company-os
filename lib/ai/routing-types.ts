export type ModelTier = "luna" | "terra" | "sol";
export type CapabilityTier = "fast" | "standard" | "advanced_reasoning" | "high_accuracy" | "coding" | "multimodal" | "specialized" | "fallback";
export type ReasoningLevel = "low" | "medium" | "high";
export type ReasoningDepth = "minimal" | "standard" | "deep" | "expert";
export type RiskLevel = "low" | "medium" | "high" | "restricted";
export type TaskComplexity = "low" | "medium" | "high";
export type OperationType = "read" | "analyze" | "recommend" | "write" | "execute" | "delete" | "external_action";
export type CostStrategy = "economy" | "balanced" | "quality";
export type ModelPolicyMode = "adaptive" | "fixed";
export type IntentClass = "information" | "drafting" | "analysis" | "planning" | "decision_support" | "summarization" | "transformation" | "coding" | "tool_execution" | "workflow_coordination" | "meeting_deliberation" | "knowledge_retrieval" | "high_impact_action";
export type LatencyPreference = "interactive" | "normal" | "quality_preferred";
export type ContextRequirement = "conversation" | "company" | "project" | "boardroom" | "company_knowledge" | "agent";
export type AuthorizationSignal = "not_required" | "allowed" | "denied" | "unknown";

export type RoutingReasonCode =
  | "LANGUAGE_MATCH" | "MIXED_LANGUAGE"
  | "LOW_COMPLEXITY" | "MEDIUM_COMPLEXITY" | "HIGH_COMPLEXITY"
  | "ADVANCED_REASONING_REQUIRED" | "HIGH_ACCURACY_REQUIRED"
  | "CODING_CAPABILITY_REQUIRED" | "MULTIMODAL_REQUIRED" | "TOOL_CAPABILITY_REQUIRED"
  | "COMPANY_CONTEXT_REQUIRED" | "PROJECT_CONTEXT_REQUIRED" | "BOARDROOM_CONTEXT_REQUIRED" | "KNOWLEDGE_RETRIEVAL_REQUIRED"
  | "HIGH_RISK" | "RESTRICTED_RISK" | "HUMAN_REVIEW_REQUIRED"
  | "PERMISSION_DENIED" | "PERMISSION_UNKNOWN" | "TOOL_UNAVAILABLE"
  | "LOW_LATENCY_PREFERRED" | "QUALITY_PREFERRED" | "COST_OPTIMIZED" | "BUDGET_LIMIT_REACHED"
  | "ENTITLEMENT_CONSTRAINED" | "POLICY_TIER_CLAMPED"
  | "FIXED_MODEL_EXCEPTION" | "FIXED_MODEL_UNAVAILABLE" | "MODEL_METADATA_UNKNOWN" | "LEGACY_FALLBACK"
  | "PROVIDER_NOT_APPROVED" | "PROVIDER_DISABLED" | "MODEL_UNAVAILABLE" | "CONTEXT_LIMIT_EXCEEDED"
  | "ESCALATION_REQUIRED" | "NO_ELIGIBLE_MODEL";

export type ModelPolicy = {
  mode: ModelPolicyMode;
  preferredTier?: ModelTier;
  minimumTier?: ModelTier;
  maximumTier?: ModelTier;
  fixedProvider?: "openai" | "anthropic" | "google";
  fixedModel?: string;
  fixedModelFallback?: "deny" | "adaptive";
  allowEscalation: boolean;
  maxEscalations: number;
  maxRetries: number;
  maxTokens?: number;
  maxCostPerRequest?: number;
  costStrategy: CostStrategy;
  latencyPreference?: LatencyPreference;
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
  detectedLanguages: string[];
  responseLanguage: string;
  intent: IntentClass;
  intentTaxonomyVersion: string;
  taskType: string;
  operation: OperationType;
  complexity: TaskComplexity;
  risk: RiskLevel;
  reasoningRequirement: ReasoningLevel;
  reasoningDepth: ReasoningDepth;
  requiredTools: string[];
  unavailableTools: string[];
  requiredCapabilities: string[];
  requiredModalities: Array<"text" | "image" | "file" | "audio">;
  contextRequirements: ContextRequirement[];
  estimatedInputTokens: number | null;
  latencyPreference: LatencyPreference;
  authorizationSignal: AuthorizationSignal;
  humanReviewRequired: boolean;
  recommendedCapabilityTier: CapabilityTier;
  recommendedTier: ModelTier;
  reasonCodes: RoutingReasonCode[];
  reasonSummary: string;
  confidence: number;
  allowEscalation: boolean;
  classificationSource: "deterministic" | "classifier" | "fallback";
  classifierVersion: string;
};

export type ProviderCapability = {
  provider: "openai" | "anthropic" | "google";
  model: string;
  tier: ModelTier;
  capabilityTiers: CapabilityTier[];
  reasoningLevels: ReasoningLevel[];
  reasoningDepths: ReasoningDepth[];
  supportedModalities: Array<"text" | "image" | "file" | "audio">;
  supportsImages: boolean;
  supportsFiles: boolean;
  supportsTools: boolean;
  codingSuitability: "basic" | "strong" | "expert";
  languageSuitability: "multilingual" | "limited";
  latencyProfile: "low" | "normal" | "high";
  estimatedLatencyMs?: number;
  costProfile: "low" | "medium" | "high";
  availability: "available" | "disabled";
  fallbackPriority: number;
  maxContextTokens?: number;
  inputCostPerMillionUsd?: number;
  outputCostPerMillionUsd?: number;
};

export type RoutingDecision = RequestIntelligence & {
  requestId: string;
  selectedCapabilityTier: CapabilityTier;
  selectedTier: ModelTier;
  selectedProvider: ProviderCapability["provider"];
  selectedModel: string;
  reasoningLevel: ReasoningLevel;
  estimatedCostUsd: number | null;
  estimatedLatencyMs: number | null;
  escalationIndex: number;
  escalationReasons: RoutingReasonCode[];
  routingVersion: string;
  policyVersion: string;
  modelRegistryVersion: string;
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
  userPermissions?: string[];
  organizationPolicyVersion?: string;
  humanReviewRiskThreshold?: RiskLevel;
};

export const DEFAULT_MODEL_POLICY: ModelPolicy = {
  mode: "adaptive",
  allowEscalation: true,
  maxEscalations: 2,
  maxRetries: 1,
  costStrategy: "balanced",
  fixedModelFallback: "deny",
  latencyPreference: "normal",
};
