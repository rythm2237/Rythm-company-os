import type { RequestIntelligence } from "@/lib/ai/routing-types";

export type ContextLayer = {
  kind: "global_policy" | "agent_instruction" | "tenant_context" | "user_preference" | "conversation" | "memory" | "retrieved_context" | "tool_result" | "attachment";
  content: string;
  priority: number;
  sensitive?: boolean;
};

export type ContextPlan = {
  layers: ContextLayer[];
  totalCharacters: number;
  truncated: boolean;
};

export function planContext(input: {
  intelligence: RequestIntelligence;
  layers: ContextLayer[];
  maxCharacters?: number;
}): ContextPlan {
  const maxCharacters = Math.max(4000, input.maxCharacters ?? (input.intelligence.complexity === "high" ? 80000 : input.intelligence.complexity === "medium" ? 48000 : 24000));
  const ordered = [...input.layers]
    .filter((layer) => layer.content.trim())
    .sort((a, b) => b.priority - a.priority);
  const selected: ContextLayer[] = [];
  let used = 0;
  let truncated = false;
  for (const layer of ordered) {
    const remaining = maxCharacters - used;
    if (remaining <= 0) { truncated = true; break; }
    if (layer.content.length <= remaining) {
      selected.push(layer);
      used += layer.content.length;
      continue;
    }
    if (remaining >= 1000) {
      selected.push({ ...layer, content: layer.content.slice(0, remaining) });
      used += remaining;
    }
    truncated = true;
    break;
  }
  return { layers: selected, totalCharacters: used, truncated };
}

export function renderContextPlan(plan: ContextPlan) {
  return plan.layers.map((layer) => `[${layer.kind}]\n${layer.content}`).join("\n\n");
}
