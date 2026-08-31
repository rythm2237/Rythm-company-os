import OpenAI from "openai";
import type { AgentProvider } from "@/lib/agent-builder";
import { escalationDecision, routeRequestV2 } from "@/lib/ai/adaptive-router";
import type { AiGatewayAttachment, AiProviderAdapter, ProviderExecutionInput, ProviderExecutionResult, ProviderInstructionInput, ProviderUsage } from "@/lib/ai/gateway-contracts";
import type { AgentRoutingPolicy, ModelTier, RoutingDecision, TenantAiPolicy } from "@/lib/ai/routing-types";

const OPTIMIZER_SYSTEM = `You are the RYTHM Agent Architect. Convert the supplied structured Agent Blueprint into a production-quality system instruction for one AI Agent.
Preserve every governance boundary, authority level, approval gate, responsibility, skill, KPI, language, and tool restriction.
Do not invent permissions, credentials, integrations, external-action authority, or company facts.
Make the instructions operational and unambiguous. Tell the Agent how to reason within its role, how to communicate, when to escalate, how to behave in multi-agent meetings, and how to handle uncertainty.
Return only the final system instruction as plain text. Do not wrap it in markdown fences and do not add commentary.`;

const SAFE_CONSOLE_OVERLAY = `You are operating inside the RYTHM Safe Agent Console for an internal evaluation session.
You may reason, write, analyze, design, critique, plan, inspect user-provided files, and produce deliverables within your assigned role.
When files are attached, read/inspect them before answering and treat their contents as primary task context. Never pretend you read a file if the provider could not actually receive it.
You have no external-action authority in this console. Do not claim to have sent messages, changed files, published designs, contacted people, purchased anything, or modified external systems.
When the user asks for an external action, produce the proposed output or action plan and clearly identify what would require execution or human approval.
Follow your Agent system instruction and its governance boundaries. If a user request conflicts with those boundaries, explain the constraint and provide the closest permitted output.`;

export type AgentAttachmentInput = AiGatewayAttachment;

export type GenerateSystemInstructionInput = {
  provider: AgentProvider;
  model: string;
  blueprint: string;
  timeoutMs?: number;
};

export type RunAgentInput = {
  /** Legacy provider/model remain a fixed-mode compatibility path only. */
  provider?: AgentProvider;
  model?: string;
  requestId?: string;
  systemInstructions: string;
  prompt: string;
  conversation?: string;
  attachments?: AgentAttachmentInput[];
  attachmentFailurePolicy?: "fail" | "retry_without_binary";
  mode?: "chat" | "task";
  maxOutputTokens?: number;
  timeoutMs?: number;
  agentPolicy?: AgentRoutingPolicy;
  tenantPolicy?: TenantAiPolicy;
  conversationLanguage?: string | null;
  /** Internal Gateway control. Callers must not construct authoritative decisions from user input. */
  authoritativeDecision?: RoutingDecision;
  /** Internal Gateway marker for a compatibility decision selected by rollout mode. */
  executionPolicyOverride?: "legacy_fallback";
  onRoutingDecision?: (decision: RoutingDecision) => void | Promise<void>;
};

export type RunAgentResult = ProviderExecutionResult & {
  routingDecision: RoutingDecision;
  fallbackUsed: boolean;
  executionPolicy: "adaptive" | "legacy_fallback" | "fixed_model";
};

type ConcreteRunInput = ProviderExecutionInput & Omit<RunAgentInput, "provider" | "model" | "systemInstructions" | "prompt" | "attachments" | "timeoutMs">;

function timeout(ms = 45000) {
  return AbortSignal.timeout(Math.max(5000, Math.min(180000, ms)));
}

export async function generateSystemInstruction(input: GenerateSystemInstructionInput) {
  return getAgentProviderAdapter(input.provider).generateSystemInstruction(input);
}

function canEscalateExecutionError(error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  return /empty Agent response|invalid structured|insufficient capability|context length|unsupported capability|tool complexity/i.test(message);
}

async function executeConcrete(input: ConcreteRunInput) {
  return getAgentProviderAdapter(input.provider).execute(input);
}

export async function runAgentDetailed(input: RunAgentInput): Promise<RunAgentResult> {
  let decision: RoutingDecision;
  let fallbackUsed = input.executionPolicyOverride === "legacy_fallback";
  let cumulativeProviderLatencyMs = 0;
  const fixedModel = input.agentPolicy?.modelPolicy?.mode === "fixed";
  try {
    decision = input.authoritativeDecision ?? routeRequestV2({
      prompt: input.prompt,
      requestId: input.requestId,
      conversationLanguage: input.conversationLanguage,
      attachments: input.attachments?.map(({ mimeType }) => ({ mimeType })),
      contextCharacterCount: input.conversation?.length ?? 0,
      agent: input.agentPolicy,
      tenant: input.tenantPolicy,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (/restricted handling|blocked this request|budget/i.test(message)) throw error;
    if (!input.provider || !input.model) throw error;
    fallbackUsed = true;
    console.warn("[RYTHM AI Gateway] adaptive router fallback", {
      provider: input.provider,
      model: input.model,
      errorClass: error instanceof Error ? error.name : "unknown",
    });
    const fallbackLanguage = input.conversationLanguage || "en";
    decision = {
      language: fallbackLanguage,
      detectedLanguages: [fallbackLanguage],
      responseLanguage: fallbackLanguage,
      intent: "information",
      intentTaxonomyVersion: "legacy-intents-v1",
      taskType: "read",
      operation: "read",
      complexity: "medium",
      risk: "low",
      reasoningRequirement: "medium",
      reasoningDepth: "standard",
      requiredTools: [],
      unavailableTools: [],
      requiredCapabilities: [],
      requiredModalities: ["text"],
      contextRequirements: [],
      estimatedInputTokens: null,
      latencyPreference: "normal",
      authorizationSignal: "unknown",
      humanReviewRequired: false,
      recommendedCapabilityTier: "fallback",
      recommendedTier: "terra",
      reasonCodes: ["LEGACY_FALLBACK"],
      reasonSummary: "legacy fallback; adaptive selection unavailable",
      classificationSource: "fallback",
      classifierVersion: "request-intelligence-v1-fallback",
      confidence: 0.3,
      allowEscalation: false,
      requestId: input.requestId ?? crypto.randomUUID(),
      selectedCapabilityTier: "fallback",
      selectedTier: "terra",
      selectedProvider: input.provider,
      selectedModel: input.model,
      reasoningLevel: "medium",
      estimatedCostUsd: null,
      estimatedLatencyMs: null,
      escalationIndex: 0,
      escalationReasons: [],
      routingVersion: "adaptive-router-v2-legacy-fallback",
      policyVersion: "adaptive-policy-v1-fallback",
      modelRegistryVersion: "legacy-model-registry-v1-fallback",
    } satisfies RoutingDecision;
  }

  const modeInstruction = input.mode === "task"
    ? "Treat the latest user message as a concrete work assignment. Produce the actual deliverable or best complete draft you can create now, not merely advice about how to do it."
    : "Respond conversationally and directly to the latest user message while remaining in your assigned professional role.";
  const attachmentNote = input.attachments?.length
    ? `\n\nThe user attached ${input.attachments.length} file(s): ${input.attachments.map((file) => file.filename).join(", ")}. Inspect them before answering.`
    : "";
  const transcript = input.conversation?.trim()
    ? `Conversation so far:\n${input.conversation.trim()}\n\nLatest user message:\n${input.prompt.trim()}${attachmentNote}`
    : `Latest user message:\n${input.prompt.trim()}${attachmentNote}`;
  const prompt = `${modeInstruction}\n\n${transcript}`;

  let current = decision;
  while (true) {
    await input.onRoutingDecision?.(current);
    const system = `${input.systemInstructions.trim()}\n\n${SAFE_CONSOLE_OVERLAY}\n\nRYTHM RESPONSE POLICY\nRespond in language code: ${current.responseLanguage}. Preserve Unicode correctly. For Persian or Arabic content, produce natural RTL-compatible text.\nOperation class: ${current.operation}. Risk class: ${current.risk}. Never reinterpret a read/recommendation request as permission for an external action.`;
    const concrete: ConcreteRunInput = {
      ...input,
      provider: current.selectedProvider,
      model: current.selectedModel,
      systemInstructions: system,
      prompt,
      reasoningLevel: current.reasoningLevel,
    };
    const providerAttemptStarted = performance.now();
    try {
      const result = await executeConcrete(concrete);
      cumulativeProviderLatencyMs += Math.max(0, Math.round(performance.now() - providerAttemptStarted));
      return {
        ...result,
        providerLatencyMs: cumulativeProviderLatencyMs,
        routingDecision: current,
        fallbackUsed,
        executionPolicy: input.executionPolicyOverride ?? (fallbackUsed ? "legacy_fallback" : fixedModel ? "fixed_model" : "adaptive"),
      };
    } catch (error) {
      cumulativeProviderLatencyMs += Math.max(0, Math.round(performance.now() - providerAttemptStarted));
      if (!canEscalateExecutionError(error)) throw error;
      const next = escalationDecision(current, input.agentPolicy);
      if (!next) throw error;
      current = routeRequestV2({
        prompt: input.prompt,
        requestId: current.requestId,
        conversationLanguage: input.conversationLanguage,
        attachments: input.attachments?.map(({ mimeType }) => ({ mimeType })),
        contextCharacterCount: input.conversation?.length ?? 0,
        agent: input.agentPolicy,
        tenant: input.tenantPolicy,
        escalationIndex: current.escalationIndex + 1,
        forcedTier: next as ModelTier,
      });
      console.warn("[RYTHM AI Gateway] escalating request", { requestId: current.requestId, tier: current.selectedTier, model: current.selectedModel });
    }
  }
}

export async function runAgent(input: RunAgentInput) {
  return (await runAgentDetailed(input)).outputText;
}

async function generateWithOpenAI(input: GenerateSystemInstructionInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI is not configured.");
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: input.model,
    max_output_tokens: 2600,
    store: false,
    input: [
      { role: "system", content: [{ type: "input_text", text: OPTIMIZER_SYSTEM }] },
      { role: "user", content: [{ type: "input_text", text: input.blueprint }] },
    ],
  }, { signal: timeout(input.timeoutMs) });
  const text = response.output_text?.trim();
  if (!text) throw new Error("OpenAI returned an empty Agent instruction.");
  return text;
}

function openAIUserContent(input: ConcreteRunInput, includeBinary: boolean) {
  const userContent: any[] = [{ type: "input_text", text: input.prompt }];
  if (!includeBinary) return userContent;
  for (const file of input.attachments ?? []) {
    if (file.mimeType.startsWith("image/")) userContent.push({ type: "input_image", image_url: `data:${file.mimeType};base64,${file.base64}`, detail: "auto" });
    else userContent.push({ type: "input_file", filename: file.filename, file_data: `data:${file.mimeType || "application/octet-stream"};base64,${file.base64}` });
  }
  return userContent;
}

async function runWithOpenAI(input: ConcreteRunInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI is not configured.");
  const client = new OpenAI({ apiKey });
  const request = async (includeBinary: boolean) => client.responses.create({
    model: input.model,
    reasoning: input.reasoningLevel ? { effort: input.reasoningLevel } : undefined,
    max_output_tokens: Math.max(1, Math.min(16_000, input.maxOutputTokens ?? 3200)),
    store: false,
    input: [
      { role: "system", content: [{ type: "input_text", text: input.systemInstructions }] },
      { role: "user", content: openAIUserContent(input, includeBinary) },
    ] as any,
  } as any, { signal: timeout(input.timeoutMs) });
  let response;
  try { response = await request(true); }
  catch (error) {
    if (!(input.attachments?.length) || input.attachmentFailurePolicy === "fail") throw error;
    console.warn("[RYTHM Agent Runtime] Provider rejected binary context; retrying with live text knowledge only.", { model: input.model, attachmentCount: input.attachments.length, errorClass: error instanceof Error ? error.name : "unknown" });
    response = await request(false);
  }
  const text = response.output_text?.trim();
  if (!text) throw new Error("OpenAI returned an empty Agent response.");
  const usage = (response as any).usage as {
    input_tokens?: number;
    output_tokens?: number;
    input_tokens_details?: { cached_tokens?: number };
    output_tokens_details?: { reasoning_tokens?: number };
  } | undefined;
  return {
    outputText: text,
    actualModel: String((response as any).model ?? input.model),
    usage: usage ? {
      inputTokens: usage.input_tokens,
      cachedTokens: usage.input_tokens_details?.cached_tokens,
      outputTokens: usage.output_tokens,
      reasoningTokens: usage.output_tokens_details?.reasoning_tokens,
    } satisfies ProviderUsage : undefined,
    providerLatencyMs: 0,
  } satisfies ProviderExecutionResult;
}

const AGENT_PROVIDER_ADAPTERS: Record<AgentProvider, AiProviderAdapter> = {
  openai: {
    id: "openai",
    generateSystemInstruction: (input: ProviderInstructionInput) => generateSystemInstruction(input as GenerateSystemInstructionInput),
    execute: (input: ProviderExecutionInput) => runWithOpenAI(input as ConcreteRunInput),
  },
  anthropic: {
    id: "anthropic",
    generateSystemInstruction: async () => { throw new Error("Anthropic is not configured for system instruction generation in the OpenAI-only Production policy."); },
    execute: async () => { throw new Error("Anthropic is not enabled by the OpenAI-only Production policy."); },
  },
  google: {
    id: "google",
    generateSystemInstruction: async () => { throw new Error("Google is not configured for system instruction generation in the OpenAI-only Production policy."); },
    execute: async () => { throw new Error("Google is not enabled by the OpenAI-only Production policy."); },
  },
};

export function getAgentProviderAdapter(provider: AgentProvider): AiProviderAdapter {
  return AGENT_PROVIDER_ADAPTERS[provider];
}
