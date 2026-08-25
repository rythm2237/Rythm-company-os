import type { AgentProvider } from "@/lib/agent-builder";
import type { AgentRoutingPolicy, RoutingDecision, TenantAiPolicy } from "@/lib/ai/routing-types";

export type AiGatewayActor = {
  type: "user" | "agent" | "system";
  userId?: string | null;
  agentId?: string | null;
};

export type AiGatewayFeature =
  | "agent.console"
  | "agent.instruction_generation"
  | "agent.knowledge_acquisition"
  | "company.document_extraction"
  | "boardroom.deliberation"
  | "boardroom.summary"
  | "boardroom.legal_triage"
  | "boardroom.legal_review"
  | "internal.unspecified";

export type AiGatewayAttachment = {
  filename: string;
  mimeType: string;
  base64: string;
};

export type LegacyModelFallback = {
  provider: AgentProvider;
  model: string;
  reason: "legacy_agent" | "explicit_fixed_model" | "compatibility";
};

export type AiGatewayRequest = {
  organizationId: string;
  actor: AiGatewayActor;
  feature: AiGatewayFeature;
  prompt: string;
  systemInstructions: string;
  correlationId?: string;
  conversation?: string;
  conversationLanguage?: string | null;
  attachments?: AiGatewayAttachment[];
  mode?: "chat" | "task";
  timeoutMs?: number;
  agentPolicy?: AgentRoutingPolicy;
  tenantPolicy?: TenantAiPolicy;
  legacyFallback?: LegacyModelFallback;
  onRoutingDecision?: (decision: RoutingDecision) => void | Promise<void>;
};

export type AiGatewayResponse = {
  correlationId: string;
  outputText: string;
  routingDecision: RoutingDecision;
  usage?: {
    inputTokens?: number;
    cachedTokens?: number;
    outputTokens?: number;
  };
  actualCostUsd?: number | null;
  latencyMs?: number;
};

export type ProviderExecutionInput = {
  provider: AgentProvider;
  model: string;
  systemInstructions: string;
  prompt: string;
  attachments?: AiGatewayAttachment[];
  timeoutMs?: number;
  reasoningLevel?: RoutingDecision["reasoningLevel"];
};

export type ProviderInstructionInput = {
  provider: AgentProvider;
  model: string;
  blueprint: string;
  timeoutMs?: number;
};

export type AiProviderAdapter = {
  id: AgentProvider;
  generateSystemInstruction(input: ProviderInstructionInput): Promise<string>;
  execute(input: ProviderExecutionInput): Promise<string>;
};
