import OpenAI from "openai";
import type { AgentProvider } from "@/lib/agent-builder";

const OPTIMIZER_SYSTEM = `You are the RYTHM Agent Architect. Convert the supplied structured Agent Blueprint into a production-quality system instruction for one AI Agent.
Preserve every governance boundary, authority level, approval gate, responsibility, skill, KPI, language, and tool restriction.
Do not invent permissions, credentials, integrations, external-action authority, or company facts.
Make the instructions operational and unambiguous. Tell the Agent how to reason within its role, how to communicate, when to escalate, how to behave in multi-agent meetings, and how to handle uncertainty.
Return only the final system instruction as plain text. Do not wrap it in markdown fences and do not add commentary.`;

const SAFE_CONSOLE_OVERLAY = `You are operating inside the RYTHM Safe Agent Console for an internal evaluation session.
You may reason, write, analyze, design, critique, plan, and produce text deliverables within your assigned role.
You have no external-action authority in this console. Do not claim to have sent messages, changed files, published designs, called tools, contacted people, purchased anything, or modified external systems.
When the user asks for an external action, produce the proposed output or action plan and clearly identify what would require execution or human approval.
Follow your Agent system instruction and its governance boundaries. If a user request conflicts with those boundaries, explain the constraint and provide the closest permitted output.`;

export type GenerateSystemInstructionInput = {
  provider: AgentProvider;
  model: string;
  blueprint: string;
  timeoutMs?: number;
};

export type RunAgentInput = {
  provider: AgentProvider;
  model: string;
  systemInstructions: string;
  prompt: string;
  conversation?: string;
  mode?: "chat" | "task";
  timeoutMs?: number;
};

function timeout(ms = 45000) {
  return AbortSignal.timeout(Math.max(5000, Math.min(180000, ms)));
}

export async function generateSystemInstruction(input: GenerateSystemInstructionInput) {
  if (input.provider === "openai") return generateWithOpenAI(input);
  if (input.provider === "anthropic") return generateWithAnthropic(input);
  return generateWithGemini(input);
}

export async function runAgent(input: RunAgentInput) {
  const system = `${input.systemInstructions.trim()}\n\n${SAFE_CONSOLE_OVERLAY}`;
  const modeInstruction = input.mode === "task"
    ? "Treat the latest user message as a concrete work assignment. Produce the actual deliverable or best complete draft you can create now, not merely advice about how to do it."
    : "Respond conversationally and directly to the latest user message while remaining in your assigned professional role.";
  const transcript = input.conversation?.trim()
    ? `Conversation so far:\n${input.conversation.trim()}\n\nLatest user message:\n${input.prompt.trim()}`
    : `Latest user message:\n${input.prompt.trim()}`;
  const prompt = `${modeInstruction}\n\n${transcript}`;

  if (input.provider === "openai") return runWithOpenAI({ ...input, systemInstructions: system, prompt });
  if (input.provider === "anthropic") return runWithAnthropic({ ...input, systemInstructions: system, prompt });
  return runWithGemini({ ...input, systemInstructions: system, prompt });
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
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 2600,
      system: OPTIMIZER_SYSTEM,
      messages: [{ role: "user", content: input.blueprint }],
    }),
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
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: OPTIMIZER_SYSTEM }] },
      contents: [{ role: "user", parts: [{ text: input.blueprint }] }],
      generationConfig: { maxOutputTokens: 2600, temperature: 0.2 },
    }),
    signal: timeout(input.timeoutMs),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("\n").trim();
  if (!text) throw new Error("Gemini returned an empty Agent instruction.");
  return text;
}

async function runWithOpenAI(input: RunAgentInput) {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI is not configured.");
  const client = new OpenAI({ apiKey });
  const response = await client.responses.create({
    model: input.model,
    max_output_tokens: 3200,
    store: false,
    input: [
      { role: "system", content: [{ type: "input_text", text: input.systemInstructions }] },
      { role: "user", content: [{ type: "input_text", text: input.prompt }] },
    ],
  }, { signal: timeout(input.timeoutMs) });
  const text = response.output_text?.trim();
  if (!text) throw new Error("OpenAI returned an empty Agent response.");
  return text;
}

async function runWithAnthropic(input: RunAgentInput) {
  const apiKey = process.env.ANTHROPIC_API_KEY;
  if (!apiKey) throw new Error("Anthropic is not configured.");
  const response = await fetch("https://api.anthropic.com/v1/messages", {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-api-key": apiKey,
      "anthropic-version": "2023-06-01",
    },
    body: JSON.stringify({
      model: input.model,
      max_tokens: 3200,
      system: input.systemInstructions,
      messages: [{ role: "user", content: input.prompt }],
    }),
    signal: timeout(input.timeoutMs),
  });
  if (!response.ok) throw new Error(`Anthropic request failed (${response.status}).`);
  const data = await response.json() as { content?: Array<{ type?: string; text?: string }> };
  const text = (data.content ?? []).filter((item) => item.type === "text").map((item) => item.text ?? "").join("\n").trim();
  if (!text) throw new Error("Anthropic returned an empty Agent response.");
  return text;
}

async function runWithGemini(input: RunAgentInput) {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) throw new Error("Gemini is not configured.");
  const model = encodeURIComponent(input.model);
  const response = await fetch(`https://generativelanguage.googleapis.com/v1beta/models/${model}:generateContent`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      "x-goog-api-key": apiKey,
    },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: input.systemInstructions }] },
      contents: [{ role: "user", parts: [{ text: input.prompt }] }],
      generationConfig: { maxOutputTokens: 3200, temperature: 0.35 },
    }),
    signal: timeout(input.timeoutMs),
  });
  if (!response.ok) throw new Error(`Gemini request failed (${response.status}).`);
  const data = await response.json() as { candidates?: Array<{ content?: { parts?: Array<{ text?: string }> } }> };
  const text = (data.candidates?.[0]?.content?.parts ?? []).map((part) => part.text ?? "").join("\n").trim();
  if (!text) throw new Error("Gemini returned an empty Agent response.");
  return text;
}
