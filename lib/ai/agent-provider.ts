import OpenAI from "openai";
import type { AgentProvider } from "@/lib/agent-builder";
import { escalationDecision, routeRequest } from "@/lib/ai/adaptive-router";
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
  mode?: "chat" | "task";
  timeoutMs?: number;
  agentPolicy?: AgentRoutingPolicy;
  tenantPolicy?: TenantAiPolicy;
  conversationLanguage?: string | null;
  /** Internal Gateway control. Callers must not construct authoritative decisions from user input. */
  authoritativeDecision?: RoutingDecision;
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
  const started = performance.now();
  const result = await getAgentProviderAdapter(input.provider).execute(input);
  return { ...result, providerLatencyMs: Math.max(0, Math.round(performance.now() - started)) };
}

export async function runAgentDetailed(input: RunAgentInput): Promise<RunAgentResult> {
  let decision: RoutingDecision;
  let fallbackUsed = false;
  const fixedModel = input.agentPolicy?.modelPolicy?.mode === "fixed";
  try {
    decision = input.authoritativeDecision ?? routeRequest({
      prompt: input.prompt,
      requestId: input.requestId,
      conversationLanguage: input.conversationLanguage,
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
    decision = {
      requestId: crypto.randomUUID(), language: input.conversationLanguage || "en", responseLanguage: input.conversationLanguage || "en",
      intent: "information", taskType: "read", operation: "read", complexity: "medium", risk: "low", reasoningRequirement: "medium",
      requiredTools: [], requiredCapabilities: [], recommendedTier: "terra", confidence: 0.3, allowEscalation: false, classificationSource: "fallback",
      selectedTier: "terra", selectedProvider: input.provider, selectedModel: input.model, reasoningLevel: "medium", estimatedCostUsd: null,
      escalationIndex: 0, routingVersion: "adaptive-v1-fallback",
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
    try {
      const result = await executeConcrete(concrete);
      return {
        ...result,
        routingDecision: current,
        fallbackUsed,
        executionPolicy: fallbackUsed ? "legacy_fallback" : fixedModel ? "fixed_model" : "adaptive",
      };
    } catch (error) {
      if (!canEscalateExecutionError(error)) throw error;
      const next = escalationDecision(current, input.agentPolicy);
      if (!next) throw error;
      current = routeRequest({
        prompt: input.prompt,
        requestId: current.requestId,
        conversationLanguage: input.conversationLanguage,
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

async function generateWithAnthropic(input: GenerateSystemInstructionInput) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic is not configured.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: input.model, max_tokens: 2600, system: OPTIMIZER_SYSTEM, messages: [{ role: "user", content: input.blueprint }] }),
    signal: timeout(input.timeoutMs),
  });
  if (!response.ok) throw new Error(`Anthropic request failed (${response.status}).`);
  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const text = (data.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n").trim();
  if (!text) throw new Error("Anthropic returned an empty Agent instruction.");
  return text;
}

async function generateWithGemini(input: GenerateSystemInstructionInput) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini is not configured.");
  const model = encodeURIComponent(input.model);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: OPTIMIZER_SYSTEM }] }, contents: [{ role: "user", parts: [{ text: input.blueprint }] }], generationConfig: { maxOutputTokens: 2600, temperature: 0.2 } }),
    signal: timeout(input.timeoutMs),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("\n").trim();
  if (!text) throw new Error("Gemini returned an empty Agent instruction.");
  return text;
}

function openAIUserContent(input: ConcreteRunInput, includeBinary: boolean) {
  const userContent: any[] = [{ type: "input_text", text: input.prompt }];
  if (!includeBinary) return userContent;
  for (const file of input.attachments ?? []) {
    if (file.mimeType.startsWith("image/")) userContent.push({ type: "input_image", image_url: `data:${file.mimeType};base64,${file.base64}`, detail: "auto" });
    else userContent.push({ type: "input_file", filename: file.filename, file_data: file.base64 });
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
    max_output_tokens: 3200,
    store: false,
    input: [
      { role: "system", content: [{ type: "input_text", text: input.systemInstructions }] },
      { role: "user", content: openAIUserContent(input, includeBinary) },
    ] as any,
  } as any, { signal: timeout(input.timeoutMs) });
  let response;
  try { response = await request(true); }
  catch (error) {
    if (!(input.attachments?.length)) throw error;
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

function textualAttachmentContext(files: AgentAttachmentInput[] = []) {
  return files.filter((file) => /^(text\/|application\/(json|xml))/.test(file.mimeType) || /\.(csv|txt|md|json|xml)$/i.test(file.filename)).map((file) => {
    try { return `\n\nAttachment ${file.filename}:\n${Buffer.from(file.base64, "base64").toString("utf8").slice(0, 18000)}`; }
    catch { return ""; }
  }).join("");
}

async function runWithAnthropic(input: ConcreteRunInput) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic is not configured.");
  const prompt = `${input.prompt}${textualAttachmentContext(input.attachments)}`;
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: { "content-type": "application/json", "x-api-key": apiKey, "anthropic-version": "2023-06-01" },
    body: JSON.stringify({ model: input.model, max_tokens: 3200, system: input.systemInstructions, messages: [{ role: "user", content: prompt }] }),
    signal: timeout(input.timeoutMs),
  });
  if (!response.ok) throw new Error(`Anthropic request failed (${response.status}).`);
  const data = await response.json() as { model?: string; usage?: { input_tokens?: number; output_tokens?: number }; content?: Array<{ type?: string; text?: string }> };
  const text = (data.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n").trim();
  if (!text) throw new Error("Anthropic returned an empty Agent response.");
  return {
    outputText: text,
    actualModel: data.model ?? input.model,
    usage: data.usage ? { inputTokens: data.usage.input_tokens, outputTokens: data.usage.output_tokens } : undefined,
    providerLatencyMs: 0,
  } satisfies ProviderExecutionResult;
}

async function runWithGemini(input: ConcreteRunInput) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini is not configured.");
  const model = encodeURIComponent(input.model);
  const parts: Array<Record<string, unknown>> = [{ text: input.prompt }];
  for (const file of input.attachments ?? []) if (file.mimeType.startsWith("image/") || file.mimeType === "application/pdf") parts.push({ inlineData: { mimeType: file.mimeType, data: file.base64 } });
  const textFallback = textualAttachmentContext(input.attachments);
  if (textFallback) parts.push({ text: textFallback });
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: { "content-type": "application/json", "x-goog-api-key": apiKey },
    body: JSON.stringify({ systemInstruction: { parts: [{ text: input.systemInstructions }] }, contents: [{ role: "user", parts }], generationConfig: { maxOutputTokens: 3200, temperature: 0.35 } }),
    signal: timeout(input.timeoutMs),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
  const data = await response.json() as {
    modelVersion?: string;
    usageMetadata?: { promptTokenCount?: number; candidatesTokenCount?: number; cachedContentTokenCount?: number; thoughtsTokenCount?: number };
    candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }>;
  };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("\n").trim();
  if (!text) throw new Error("Gemini returned an empty Agent response.");
  return {
    outputText: text,
    actualModel: data.modelVersion ?? input.model,
    usage: data.usageMetadata ? {
      inputTokens: data.usageMetadata.promptTokenCount,
      cachedTokens: data.usageMetadata.cachedContentTokenCount,
      outputTokens: data.usageMetadata.candidatesTokenCount,
      reasoningTokens: data.usageMetadata.thoughtsTokenCount,
    } : undefined,
    providerLatencyMs: 0,
  } satisfies ProviderExecutionResult;
}

const AGENT_PROVIDER_ADAPTERS: Record<AgentProvider, AiProviderAdapter> = {
  openai: {
    id: "openai",
    generateSystemInstruction: (input: ProviderInstructionInput) => generateWithOpenAI(input),
    execute: (input: ProviderExecutionInput) => runWithOpenAI(input as ConcreteRunInput),
  },
  anthropic: {
    id: "anthropic",
    generateSystemInstruction: (input: ProviderInstructionInput) => generateWithAnthropic(input),
    execute: (input: ProviderExecutionInput) => runWithAnthropic(input as ConcreteRunInput),
  },
  google: {
    id: "google",
    generateSystemInstruction: (input: ProviderInstructionInput) => generateWithGemini(input),
    execute: (input: ProviderExecutionInput) => runWithGemini(input as ConcreteRunInput),
  },
};

export function getAgentProviderAdapter(provider: AgentProvider): AiProviderAdapter {
  return AGENT_PROVIDER_ADAPTERS[provider];
}
