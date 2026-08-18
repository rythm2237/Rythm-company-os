"use server";

import OpenAI from "openai";
import { randomUUID } from "crypto";
import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { runAgent, type AgentAttachmentInput } from "@/lib/ai/agent-provider";
import { getRuntimeConfig } from "@/lib/runtime-config";
import type { AgentProvider } from "@/lib/agent-builder";

type ConsoleMessage = { role: "user" | "assistant"; content: string };

export type OutputPreference = "auto" | "text" | "image" | "mockup" | "line-chart" | "bar-chart" | "report";

export type ChartSpec = {
  type: "line" | "bar";
  title: string;
  xLabel?: string;
  yLabel?: string;
  points: Array<{ label: string; value: number }>;
  insight?: string;
};

export type UploadedAttachment = {
  id: string;
  filename: string;
  mimeType: string;
  sizeBytes: number;
};

type RunConsoleInput = {
  agentId: string;
  prompt: string;
  mode: "chat" | "task";
  outputPreference?: OutputPreference;
  messages?: ConsoleMessage[];
  attachmentIds?: string[];
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

type AttachmentRow = {
  id: string;
  filename: string;
  mime_type: string;
  size_bytes: number;
  storage_path: string;
};

const MAX_FILE_BYTES = 12 * 1024 * 1024;
const MAX_FILES_PER_MESSAGE = 4;

function safeMessage(error: unknown) {
  const message = error instanceof Error ? error.message : "Agent execution failed.";
  if (/not configured|empty Agent response|request failed|timed out|timeout|not available|image generation|file|attachment|provider/i.test(message)) return message;
  return "Agent execution failed. Refresh and try again.";
}

function transcript(messages: ConsoleMessage[] = []) {
  return messages.slice(-10).map((message) => `${message.role === "user" ? "User" : "Agent"}: ${message.content.slice(0, 6000)}`).join("\n\n").slice(0, 30000);
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

function safeFilename(name: string) {
  const clean = name.normalize("NFKC").replace(/[^a-zA-Z0-9._()\- ]+/g, "-").replace(/\s+/g, "-").slice(0, 140);
  return clean || "attachment";
}

async function getAgent(agentId: string) {
  const context = await requireActiveOwnerOrganizationContext();
  const { data, error } = await context.supabase
    .from("agents")
    .select("id,name,role_title,agent_status,external_actions_allowed,system_instructions,runtime_provider,runtime_model")
    .eq("id", agentId)
    .eq("organization_id", context.organizationId)
    .maybeSingle();
  if (error || !data) throw new Error("Agent not found in this organization.");
  return { context, agent: data as AgentRuntimeRow };
}

export async function uploadAgentAttachment(formData: FormData) {
  try {
    const agentId = String(formData.get("agentId") ?? "");
    const file = formData.get("file");
    if (!agentId || !(file instanceof File)) return { ok: false as const, error: "Choose a file first." };
    if (file.size <= 0) return { ok: false as const, error: "This file is empty." };
    if (file.size > MAX_FILE_BYTES) return { ok: false as const, error: "Each file must be 12 MB or smaller." };

    const { context } = await getAgent(agentId);
    const filename = safeFilename(file.name);
    const mimeType = file.type || "application/octet-stream";
    const storagePath = `${context.organizationId}/${agentId}/${randomUUID()}-${filename}`;
    const bytes = Buffer.from(await file.arrayBuffer());

    const { error: storageError } = await context.supabase.storage
      .from("agent-attachments")
      .upload(storagePath, bytes, { contentType: mimeType, upsert: false });
    if (storageError) throw new Error(`File upload failed: ${storageError.message}`);

    const { data, error } = await context.supabase
      .from("agent_attachments")
      .insert({
        organization_id: context.organizationId,
        agent_id: agentId,
        filename: file.name.slice(0, 240),
        mime_type: mimeType,
        size_bytes: file.size,
        storage_path: storagePath,
      })
      .select("id,filename,mime_type,size_bytes")
      .single();

    if (error || !data) {
      await context.supabase.storage.from("agent-attachments").remove([storagePath]);
      throw new Error("File metadata could not be saved.");
    }

    await context.supabase.from("agent_memories").insert({
      organization_id: context.organizationId,
      agent_id: agentId,
      source_attachment_id: data.id,
      memory_type: "file",
      title: `Reference file: ${data.filename}`,
      content: `A user supplied ${data.filename} (${data.mime_type}, ${data.size_bytes} bytes) as a reference for this Agent. The original file remains available in the Agent attachment library.`,
    });

    return {
      ok: true as const,
      attachment: { id: data.id, filename: data.filename, mimeType: data.mime_type, sizeBytes: data.size_bytes } satisfies UploadedAttachment,
    };
  } catch (error) {
    return { ok: false as const, error: safeMessage(error) };
  }
}

async function loadAttachments(context: Awaited<ReturnType<typeof requireActiveOwnerOrganizationContext>>, agentId: string, ids: string[]) {
  const uniqueIds = Array.from(new Set(ids.filter(Boolean))).slice(0, MAX_FILES_PER_MESSAGE);
  if (!uniqueIds.length) return [] as AgentAttachmentInput[];
  const { data, error } = await context.supabase
    .from("agent_attachments")
    .select("id,filename,mime_type,size_bytes,storage_path")
    .eq("organization_id", context.organizationId)
    .eq("agent_id", agentId)
    .eq("status", "active")
    .in("id", uniqueIds);
  if (error) throw new Error("Attached files could not be loaded.");

  const files: AgentAttachmentInput[] = [];
  for (const row of (data ?? []) as AttachmentRow[]) {
    const { data: blob, error: downloadError } = await context.supabase.storage.from("agent-attachments").download(row.storage_path);
    if (downloadError || !blob) throw new Error(`Could not read ${row.filename}.`);
    const buffer = Buffer.from(await blob.arrayBuffer());
    files.push({ filename: row.filename, mimeType: row.mime_type, base64: buffer.toString("base64") });
  }
  return files;
}

async function loadMemoryContext(context: Awaited<ReturnType<typeof requireActiveOwnerOrganizationContext>>, agentId: string) {
  const { data } = await context.supabase
    .from("agent_memories")
    .select("title,content,created_at")
    .eq("organization_id", context.organizationId)
    .eq("agent_id", agentId)
    .order("created_at", { ascending: false })
    .limit(12);
  if (!data?.length) return "";
  return `Agent memory from prior work:\n${data.map((item) => `- ${item.title}: ${String(item.content).slice(0, 900)}`).join("\n")}`.slice(0, 10000);
}

async function rememberExperience(
  context: Awaited<ReturnType<typeof requireActiveOwnerOrganizationContext>>,
  agentId: string,
  prompt: string,
  response: string,
  outputType: string,
  attachmentIds: string[],
) {
  const content = `User request: ${prompt.slice(0, 1800)}\nOutput type: ${outputType}\nAgent result: ${response.slice(0, 2200)}${attachmentIds.length ? `\nReferenced attachment IDs: ${attachmentIds.join(", ")}` : ""}`;
  await context.supabase.from("agent_memories").insert({
    organization_id: context.organizationId,
    agent_id: agentId,
    memory_type: "experience",
    title: `Work experience — ${outputType}`,
    content,
  });
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
    prompt: `${visualInstruction}\n\nYou are producing work for ${agent.name}, ${agent.role_title}.\n\nVisual brief:\n${prompt.slice(0, 12000)}`,
  });
  const encoded = response.data?.[0]?.b64_json;
  if (!encoded) throw new Error("Image generation returned no image.");
  return `data:image/png;base64,${encoded}`;
}

async function generateChart(provider: AgentProvider, model: string, agent: AgentRuntimeRow, prompt: string, conversation: string, chartType: "line" | "bar", attachments: AgentAttachmentInput[]) {
  const chartPrompt = `Create the actual data visualization requested by the user as a structured chart specification.
Read all attached files before deciding what data is available. Do not invent numeric values.
If there is not enough numeric data to create a truthful chart, return JSON with {"needsData":true,"message":"..."} and say exactly what is needed.
Otherwise return ONLY valid JSON with this shape:
{"type":"${chartType}","title":"...","xLabel":"...","yLabel":"...","points":[{"label":"...","value":123}],"insight":"one concise analytical takeaway"}
Use 2-24 points. Values must be finite numbers. No markdown fences.

${conversation ? `Conversation:\n${conversation}\n\n` : ""}Latest user request:\n${prompt}`;
  const raw = await runAgent({ provider, model, systemInstructions: agent.system_instructions || "", prompt: chartPrompt, attachments, mode: "task", timeoutMs: getRuntimeConfig().agentTimeoutMs });
  const parsed = JSON.parse(extractJsonObject(raw)) as Partial<ChartSpec> & { needsData?: boolean; message?: string };
  if (parsed.needsData) return { needsData: true as const, message: parsed.message || "Please provide the numeric data for this chart." };
  if (!Array.isArray(parsed.points) || parsed.points.length < 2) throw new Error("Agent returned an invalid chart specification.");
  const points = parsed.points.slice(0, 24).map((point) => ({ label: String(point.label ?? ""), value: Number(point.value) })).filter((point) => point.label && Number.isFinite(point.value));
  if (points.length < 2) throw new Error("Agent returned an invalid chart specification.");
  return { needsData: false as const, spec: { type: chartType, title: String(parsed.title || "Analysis"), xLabel: parsed.xLabel ? String(parsed.xLabel) : undefined, yLabel: parsed.yLabel ? String(parsed.yLabel) : undefined, insight: parsed.insight ? String(parsed.insight) : undefined, points } satisfies ChartSpec };
}

export async function runAgentConsole(input: RunConsoleInput) {
  const prompt = String(input.prompt ?? "").trim().slice(0, 12000);
  if (!prompt) return { ok: false as const, error: "Enter a message or task first." };

  try {
    const { context, agent } = await getAgent(input.agentId);
    if (agent.agent_status === "archived") return { ok: false as const, error: "Archived Agents cannot be run." };
    if (!agent.system_instructions?.trim()) return { ok: false as const, error: "This Agent has no generated system instruction yet." };
    if (!agent.runtime_model) return { ok: false as const, error: "This Agent has no runtime model configured." };

    const provider = (agent.runtime_provider ?? "openai") as AgentProvider;
    if (!(["openai", "anthropic", "gemini"] as string[]).includes(provider)) return { ok: false as const, error: "This Agent uses an unsupported runtime provider." };

    const started = Date.now();
    const requested = input.outputPreference ?? "auto";
    const resolvedOutput = requested === "auto" ? inferOutputPreference(prompt, agent.role_title, input.mode) : requested;
    const history = transcript(input.messages);
    const attachmentIds = (input.attachmentIds ?? []).slice(0, MAX_FILES_PER_MESSAGE);
    const attachments = await loadAttachments(context, agent.id, attachmentIds);
    const memory = await loadMemoryContext(context, agent.id);
    const conversationContext = [memory, history].filter(Boolean).join("\n\n");

    if (provider !== "openai" && attachments.some((file) => /\.(xlsx|xls|xlsm)$/i.test(file.filename))) {
      return { ok: false as const, error: "Excel workbook reading is currently enabled for OpenAI Agents. Choose an OpenAI Agent for this workbook while Claude/Gemini workbook ingestion is being added." };
    }

    if (resolvedOutput === "image" || resolvedOutput === "mockup") {
      let visualBrief = prompt;
      if (attachments.length) {
        visualBrief = await runAgent({
          provider,
          model: agent.runtime_model,
          systemInstructions: agent.system_instructions,
          prompt: `Inspect every attached reference file/image. Convert the user's request and references into a precise visual generation brief. Preserve important visual details, layout cues, brand elements, and constraints. Return only the generation brief.\n\nUser request:\n${prompt}`,
          conversation: conversationContext,
          attachments,
          mode: "task",
          timeoutMs: getRuntimeConfig().agentTimeoutMs,
        });
      }
      const imageDataUrl = await generateImage(visualBrief, agent, resolvedOutput);
      const responseText = resolvedOutput === "mockup" ? "High-fidelity visual mockup generated from your brief and references." : "Visual generated from your brief and references.";
      await rememberExperience(context, agent.id, prompt, responseText, resolvedOutput, attachmentIds);
      return { ok: true as const, responseType: "image" as const, response: responseText, imageDataUrl, resolvedOutput, provider: "openai-image", model: process.env.RYTHM_IMAGE_MODEL || "gpt-image-1", latencyMs: Date.now() - started, agentName: agent.name, roleTitle: agent.role_title, status: agent.agent_status, externalActions: false };
    }

    if (resolvedOutput === "line-chart" || resolvedOutput === "bar-chart") {
      const chart = await generateChart(provider, agent.runtime_model, agent, prompt, conversationContext, resolvedOutput === "line-chart" ? "line" : "bar", attachments);
      if (chart.needsData) {
        await rememberExperience(context, agent.id, prompt, chart.message, resolvedOutput, attachmentIds);
        return { ok: true as const, responseType: "text" as const, response: chart.message, resolvedOutput, provider, model: agent.runtime_model, latencyMs: Date.now() - started, agentName: agent.name, roleTitle: agent.role_title, status: agent.agent_status, externalActions: false };
      }
      const responseText = chart.spec.insight || "Chart generated from the supplied data.";
      await rememberExperience(context, agent.id, prompt, responseText, resolvedOutput, attachmentIds);
      return { ok: true as const, responseType: "chart" as const, response: responseText, chartSpec: chart.spec, resolvedOutput, provider, model: agent.runtime_model, latencyMs: Date.now() - started, agentName: agent.name, roleTitle: agent.role_title, status: agent.agent_status, externalActions: false };
    }

    const response = await runAgent({
      provider,
      model: agent.runtime_model,
      systemInstructions: agent.system_instructions,
      prompt: resolvedOutput === "report" ? `Produce a concise, professional report as the actual deliverable. Read all attached files completely before analyzing them. Use clear sections and decision-relevant conclusions.\n\n${prompt}` : prompt,
      conversation: conversationContext,
      attachments,
      mode: input.mode === "task" ? "task" : "chat",
      timeoutMs: getRuntimeConfig().agentTimeoutMs,
    });
    await rememberExperience(context, agent.id, prompt, response, resolvedOutput, attachmentIds);
    return { ok: true as const, responseType: "text" as const, response, resolvedOutput, provider, model: agent.runtime_model, latencyMs: Date.now() - started, agentName: agent.name, roleTitle: agent.role_title, status: agent.agent_status, externalActions: false };
  } catch (executionError) {
    return { ok: false as const, error: safeMessage(executionError) };
  }
}
