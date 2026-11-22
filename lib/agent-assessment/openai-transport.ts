import OpenAI from "openai";
import { ASSESSMENT_MODEL } from "./run-controlled";

export function createControlledAssessmentTransport(apiKey: string) {
  if (!apiKey.trim()) throw new Error("OPENAI_API_KEY is required.");
  const client = new OpenAI({ apiKey, baseURL: "https://api.openai.com/v1", maxRetries: 0, timeout: 60_000 });
  return async (request: { system: string; prompt: string; maxOutputTokens: number }) => {
    const response = await client.responses.create({
      model: ASSESSMENT_MODEL,
      store: false,
      tools: [],
      tool_choice: "none",
      reasoning: { effort: "low" },
      truncation: "disabled",
      instructions: request.system,
      input: request.prompt,
      max_output_tokens: request.maxOutputTokens,
    });
    return {
      text: response.output_text,
      complete: response.status === "completed" && response.output.every((item) => item.type === "message" || item.type === "reasoning"),
      model: response.model,
      requestId: response.id,
      inputTokens: response.usage?.input_tokens ?? 0,
      outputTokens: response.usage?.output_tokens ?? 0,
    };
  };
}
