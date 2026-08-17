import OpenAI from "openai";
import type { AgentProvider } from "@/lib/agent-builder";

const OPTIMIZER_SYSTEM = `You are the RYTHM Agent Architect. Convert the supplied structured Agent Blueprint into a production-quality system instruction for one AI Agent.
Preserve every governance boundary, authority level, approval gate, responsibility, skill, KPI, language, and tool restriction.
Do not invent permissions, credentials, integrations, external-action authority, or company facts.
Make the instructions operational and unambiguous. Tell the Agent how to reason within its role, how to communicate, when to escalate, how to behave in multi-agent meetings, and how to handle uncertainty.
Return only the final system instruction as plain text. Do not wrap it in markdown fences and do not add commentary.`;

export type GenerateSystemInstructionInput = {
  provider: AgentProvider;
  model: string;
  blueprint: string;
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
