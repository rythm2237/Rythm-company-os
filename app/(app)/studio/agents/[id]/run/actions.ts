"use server";

import { requireActiveOwnerOrganizationContext } from "@/lib/auth/organization-context";
import { runAgent } from "@/lib/ai/agent-provider";
import { getRuntimeConfig } from "@/lib/runtime-config";
import type { AgentProvider } from "@/lib/agent-builder";

type ConsoleMessage = {
  role: "user" | "assistant";
  content: string;
};

type RunConsoleInput = {
  agentId: string;
  prompt: string;
  mode: "chat" | "task";
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
  if (/not configured|empty Agent response|request failed|timed out|timeout|not available/i.test(message)) return message;
  return "Agent execution failed. Refresh and try again.";
}

function transcript(messages: ConsoleMessage[] = []) {
  return messages
    .slice(-10)
    .map((message) => `${message.role === "user" ? "User" : "Agent"}: ${message.content.slice(0, 6000)}`)
    .join("\n\n")
    .slice(0, 30000);
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
  try {
    const response = await runAgent({
      provider,
      model: agent.runtime_model,
      systemInstructions: agent.system_instructions,
      prompt,
      conversation: transcript(input.messages),
      mode: input.mode === "task" ? "task" : "chat",
      timeoutMs: getRuntimeConfig().agentTimeoutMs,
    });

    return {
      ok: true as const,
      response,
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
