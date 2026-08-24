import type { OperationType, RiskLevel } from "@/lib/ai/routing-types";

export type ToolAuthorizationInput = {
  tool: string;
  operation: OperationType;
  risk: RiskLevel;
  agentAllowedTools: string[];
  agentPermissions?: string[];
  userPermissions?: string[];
  tenantToolEntitlements?: string[];
  externalActionsAllowed: boolean;
  humanApproved?: boolean;
};

export type ToolAuthorizationResult = {
  allowed: boolean;
  requiresConfirmation: boolean;
  reason: string;
};

const CONSEQUENTIAL = new Set<OperationType>(["write", "execute", "delete", "external_action"]);

export function authorizeTool(input: ToolAuthorizationInput): ToolAuthorizationResult {
  if (input.risk === "restricted") return { allowed: false, requiresConfirmation: false, reason: "Restricted requests cannot invoke tools." };
  if (!input.agentAllowedTools.includes(input.tool)) return { allowed: false, requiresConfirmation: false, reason: "Tool is not allowed by the Agent policy." };
  if (input.tenantToolEntitlements?.length && !input.tenantToolEntitlements.includes(input.tool)) return { allowed: false, requiresConfirmation: false, reason: "Tool is not included in the tenant entitlement." };
  if (input.userPermissions?.length && !input.userPermissions.includes(input.tool) && !input.userPermissions.includes("*")) return { allowed: false, requiresConfirmation: false, reason: "User is not authorized for this tool." };
  if (input.agentPermissions?.length && !input.agentPermissions.includes(input.tool) && !input.agentPermissions.includes("*")) return { allowed: false, requiresConfirmation: false, reason: "Agent permission does not authorize this tool." };

  if (input.operation === "external_action" && !input.externalActionsAllowed) {
    return { allowed: false, requiresConfirmation: true, reason: "External actions are disabled for this Agent/runtime." };
  }

  if (CONSEQUENTIAL.has(input.operation) && !input.humanApproved) {
    return { allowed: false, requiresConfirmation: true, reason: "Consequential operations require explicit human approval." };
  }

  return { allowed: true, requiresConfirmation: false, reason: "Authorized by user, Agent and tenant policy." };
}
