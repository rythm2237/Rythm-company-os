import { createHash, randomUUID } from "node:crypto";

function canonicalize(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(canonicalize);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .filter(([, item]) => item !== undefined)
      .sort(([a], [b]) => a.localeCompare(b))
      .map(([key, item]) => [key, canonicalize(item)]),
  );
}

export function stableExecutionJson(value: unknown) {
  return JSON.stringify(canonicalize(value));
}

export function executionDigest(value: unknown) {
  return createHash("sha256").update(stableExecutionJson(value)).digest("hex");
}

export function buildExecutionIdempotencyKey(input: {
  organizationId: string;
  originatingRequestId?: string | null;
  agentId?: string | null;
  tool: string;
  operation: string;
  target?: string | null;
  input: Record<string, unknown>;
}) {
  return `ex2_${executionDigest({
    organizationId: input.organizationId,
    originatingRequestId: input.originatingRequestId ?? null,
    agentId: input.agentId ?? null,
    tool: input.tool,
    operation: input.operation,
    target: input.target ?? null,
    input: input.input,
  })}`;
}

export function buildApprovalScopeDigest(input: {
  organizationId: string;
  executionId: string;
  tool: string;
  operation: string;
  target?: string | null;
  payloadDigest: string;
}) {
  return executionDigest(input);
}

export function newCorrelationId() {
  return randomUUID();
}
