"use server";

import OpenAI from "openai";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { runAgent } from "@/lib/ai/agent-provider";
import { getRuntimeConfig } from "@/lib/runtime-config";
import type { AgentProvider } from "@/lib/agent-builder";

type ConsoleMessage = {
  role: "user" | "assistant";
  content: string;
};

export type OutputPreference =
  | "auto"
  | "text"
  | "image"
  | "mockup"
  | "line-chart"
  | "bar-chart"
  | "report";

export type ChartSpec = {
  type: "line" | "bar";
  title: string;
  xLabel?: string;
  yLabel?: string;
  points: Array<{ label: string; value: number }>;
  insight?: string;
};

type RunConsoleInput = {
  agentId: string;
  prompt: string;
  mode: "chat" | "task";
  outputPreference?: OutputPreference;
  messages?: ConsoleMessage[];
};

type AgentRuntimeRow = {
  id: string;
  name: string;
  role_title: string;
  agent_status: string;
  external_actions_allowed: boolean;
  system_instructions: string | null;
  runtime_provider: string | null;
  runtime_model: string | null;
};

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Agent execution failed.";
  if (/not configured|empty Agent response|request failed|timed out|timeout|not available|image generation/i.test(message)) return message;
  return "Agent execution failed. Refresh and try again.";
}

function transcript(messages: ConsoleMessage[] = []) {
  return messages
    .slice(-10)
    .map((message) => `${message.role === "user" ? "User" : "Agent"}: ${message.content.slice(0, 6000)}`)
    .join("\n\n")
    .slice(0, 30000);
}

function inferOutputPreference(prompt: string, roleTitle: string, mode: "chat" | "task"): OutputPreference {
  if (mode === "chat") return "text";
  const value = `${roleTitle} ${prompt}`.toLowerCase();
  const asksImage = /\b(image|photo|picture|poster|visual|illustration|render|mockup|mock-up|hero design|ui design|screen design|طرح|عکس|تصویر|پوستر|موکاپ|رندر|طراحی)\b/i.test(value);
  const asksChart = /\b(chart|graph|trend|growth|over time|time series|line chart|bar chart|visuali[sz]e|نمودار|چارت|روند|رشد)\b/i.test(value);
  const analystRole = /analyst|analytics|finance|cfo|data|business intelligence|تحلیل|آنالیز/i.test(roleTitle);
  const designerRole = /design|designer|creative|brand|ui|ux|art|طراح/i.test(roleTitle);

  if (designerRole && asksImage) return /mockup|mock-up|ui|screen|landing|hero|موکاپ|لندینگ|رابط/i.test(prompt) ? "mockup" : "image";
  if (asksImage) return "image";
  if (asksChart || (analystRole && /sales|revenue|margin|forecast|kpi|month|week|quarter|فروش|درآمد|حاشیه|پیش.?بینی|ماه|هفته/i.test(prompt))) return "line-chart";
  if (/report|memo|brief|executive summary|گزارش|خلاصه اجرایی/i.test(prompt)) return "report";
  return "text";
}

function extractJsonObject(value: string) {
  const fenced = value.match(/```(?:json)?\s*([\s\S]*?)```/i)?.[1];
  const candidate = fenced ?? value.slice(value.indexOf("{"), value.lastIndexOf("}") + 1);
  return candidate.trim();
}

async function generateImage(prompt: string, agent: AgentRuntimeRow, style: "image" | "mockup") {
  const apiKey = process.env.OPENAI_API_KEY;
  if (!apiKey) throw new Error("OpenAI image generation is not configured.");
  const client = new OpenAI({ apiKey });
  const visualInstruction = style === "mockup"
    ? "Create a polished high-fidelity product/UI mockup as the final visual deliverable. Make the interface legible, coherent, premium, and presentation-ready."
    : "Create the requested final visual/image deliverable. Prioritize visual fidelity and direct fulfillment of the brief over explaining the design.";
  const response = await client.images.generate({
    model: process.env.RYTHM_IMAGE_MODEL || "gpt-image-1",
    size: "1536x1024",
    quality: "high",
    prompt: `${visualInstruction}\n\nYou are producing work for ${agent.name}, ${agent.role_title}.\n\nUser brief:\n${prompt.slice(0, 8000)}`,
  });
  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) throw new Error("Image generation returned no image.");
  return `data:image/png;base64,${encoded}`;
}

async function generateChart(
  provider: AgentProvider,
  model: string,
  agent: AgentRuntimeRow,
  prompt: string,
  conversation: string,
  chartType: "line" | "bar",
) {
  const chartPrompt = `Create the actual data visualization requested by the user as a structured chart specification.
Do not invent numeric values. Use only numbers explicitly present in the conversation/user request or data the Agent legitimately has in the supplied context.
If there is not enough numeric data to create a truthful chart, return JSON with {"needsData":true,"message":"..."} and briefly say exactly what data is needed.
Otherwise return ONLY valid JSON with this shape:
{"type":"${chartType}","title":"...","xLabel":"...","yLabel":"...","points":[{"label":"...","value":123}],"insight":"one concise analytical takeaway"}
Use 2-24 points. Values must be finite numbers. No markdown fences.

${conversation ? `Conversation:\n${conversation}\n\n` : ""}Latest user request:\n${prompt}`;

  const raw = await runAgent({
    provider,
    model,
    systemInstructions: agent.system_instructions || "",
    prompt: chartPrompt,
    mode: "task",
    timeoutMs: getRuntimeConfig().agentTimeoutMs,
  });

  const parsed = JSON.parse(extractJsonObject(raw)) as Partial<ChartSpec> & { needsData?: boolean; message?: string };
  if (parsed.needsData) return { needsData: true as const, message: parsed.message || "Please provide the numeric data for this chart." };
  if (!Array.isArray(parsed.points) || parsed.points.length < 2) throw new Error("Agent returned an invalid chart specification.");
  const points = parsed.points
    .slice(0, 24)
    .map((point) => ({ label: String(point.label ?? ""), value: Number(point.value) }))
    .filter((point) => point.label && Number.isFinite(point.value));
  if (points.length < 2) throw new Error("Agent returned an invalid chart specification.");
  return {
    needsData: false as const,
    spec: {
      type: chartType,
      title: String(parsed.title || "Analysis"),
      xLabel: parsed.xLabel ? String(parsed.xLabel) : undefined,
      yLabel: parsed.yLabel ? String(parsed.yLabel) : undefined,
      insight: parsed.insight ? String(parsed.insight) : undefined,
      points,
    } satisfies ChartSpec,
  };
}

export async function runAgentConsole(input: RunConsoleInput) {
  const context = await requireActiveOwnerOrganizationContext();
  const prompt = String(input.prompt ?? "").trim().slice(0, 12000);
  if (!prompt) return { ok: false as const, error: "Enter a message or task first." };

  const { data, error } = await context.supabase
    .from("agents")
    .select("id,name,role_title,agent_status,external_actions_allowed,system_instructions,runtime_provider,runtime_model")
    .eq("id", input.agentId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();

  if (error || !data) return { ok: false as const, error: "Agent not found in this organization." };
  const agent = data as AgentRuntimeRow;
  if (agent.agent_status === "archived") return { ok: false as const, error: "Archived Agents cannot be run." };
  if (!agent.system_instructions?.trim()) return { ok: false as const, error: "This Agent has no generated system instruction yet." };
  if (!agent.runtime_model) return { ok: false as const, error: "This Agent has no runtime model configured." };

  const provider = (agent.runtime_provider ?? "openai") as AgentProvider;
  if (!(["openai", "anthropic", "gemini"] as string[]).includes(provider)) {
    return { ok: false as const, error: "This Agent uses an unsupported runtime provider." };
  }

  const started = Date.now();
  const requested = input.outputPreference ?? "auto";
  const resolvedOutput = requested === "auto" ? inferOutputPreference(prompt, agent.role_title, input.mode) : requested;
  const history = transcript(input.messages);

  try {
    if (resolvedOutput === "image" || resolvedOutput === "mockup") {
      const imageDataUrl = await generateImage(prompt, agent, resolvedOutput);
      return {
        ok: true as const,
        responseType: "image" as const,
        response: resolvedOutput === "mockup" ? "High-fidelity visual mockup generated." : "Visual generated.",
        imageDataUrl,
        resolvedOutput,
        provider: "openai-image",
        model: process.env.RYTHM_IMAGE_MODEL || "gpt-image-1",
        latencyMs: Date.now() - started,
        agentName: agent.name,
        roleTitle: agent.role_title,
        status: agent.agent_status,
        externalActions: false,
      };
    }

    if (resolvedOutput === "line-chart" || resolvedOutput === "bar-chart") {
      const chart = await generateChart(provider, agent.runtime_model, agent, prompt, history, resolvedOutput === "line-chart" ? "line" : "bar");
      if (chart.needsData) {
        return {
          ok: true as const,
          responseType: "text" as const,
          response: chart.message,
          resolvedOutput,
          provider,
          model: agent.runtime_model,
          latencyMs: Date.now() - started,
          agentName: agent.name,
          roleTitle: agent.role_title,
          status: agent.agent_status,
          externalActions: false,
        };
      }
      return {
        ok: true as const,
        responseType: "chart" as const,
        response: chart.spec.insight || "Chart generated from the supplied data.",
        chartSpec: chart.spec,
        resolvedOutput,
        provider,
        model: agent.runtime_model,
        latencyMs: Date.now() - started,
        agentName: agent.name,
        roleTitle: agent.role_title,
        status: agent.agent_status,
        externalActions: false,
      };
    }

    const response = await runAgent({
      provider,
      model: agent.runtime_model,
      systemInstructions: agent.system_instructions,
      prompt: resolvedOutput === "report"
        ? `Produce a concise, professional report as the actual deliverable. Use clear sections and decision-relevant conclusions.\n\n${prompt}`
        : prompt,
      conversation: history,
      mode: input.mode === "task" ? "task" : "chat",
      timeoutMs: getRuntimeConfig().agentTimeoutMs,
    });

    return {
      ok: true as const,
      responseType: "text" as const,
      response,
      resolvedOutput,
      provider,
      model: agent.runtime_model,
      latencyMs: Date.now() - started,
      agentName: agent.name,
      roleTitle: agent.role_title,
      status: agent.agent_status,
      externalActions: false,
    };
  } catch (executionError) {
    return {
      ok: false as const,
      error: safeMessage(executionError),
      latencyMs: Date.now() - started,
    };
  }
}
