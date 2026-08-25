import type { OperationType, RiskLevel } from "@/lib/ai/routing-types";
import { evaluateCanonicalPermission, type CanonicalActionClass } from "@/lib/security/permissions";

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
  canonicalAction?: CanonicalActionClass | null;
};

const CONSEQUENTIAL = new Set<OperationType>(["write", "execute", "delete", "external_action"]);

function canonicalRequest(operation: OperationType): CanonicalActionClass | null {
  if (operation === "read") return "read";
  if (operation === "write") return "update";
  if (operation === "delete") return "delete";
  if (operation === "execute") return "privileged";
  if (operation === "external_action") return "external_communication";
  return null;
}

export function authorizeTool(input: ToolAuthorizationInput): ToolAuthorizationResult {
  if (input.risk === "restricted") return { allowed: false, requiresConfirmation: false, reason: "Restricted requests cannot invoke tools." };
  if (!input.agentAllowedTools.includes(input.tool)) return { allowed: false, requiresConfirmation: false, reason: "Tool is not allowed by the Agent policy." };
  if (input.tenantToolEntitlements?.length && !input.tenantToolEntitlements.includes(input.tool)) return { allowed: false, requiresConfirmation: false, reason: "Tool is not included in the tenant entitlement." };
  const canonicalAction = canonicalRequest(input.operation);
  if (!canonicalAction) return { allowed: false, requiresConfirmation: false, canonicalAction: null, reason: "Unknown operations default to deny." };
  const userDecision = evaluateCanonicalPermission(input.userPermissions, canonicalAction);
  if (!userDecision.allowed) return { allowed: false, requiresConfirmation: false, canonicalAction, reason: "User permission does not authorize the requested action." };
  const agentDecision = evaluateCanonicalPermission(input.agentPermissions, canonicalAction);
  if (!agentDecision.allowed) return { allowed: false, requiresConfirmation: false, canonicalAction, reason: "Agent permission does not authorize the requested action." };

  if (input.operation === "external_action" && !input.externalActionsAllowed) {
    return { allowed: false, requiresConfirmation: true, canonicalAction, reason: "External actions are disabled for this Agent/runtime." };
  }

  if (CONSEQUENTIAL.has(input.operation) && !input.humanApproved) {
    return { allowed: false, requiresConfirmation: true, canonicalAction, reason: "Consequential operations require explicit human approval." };
  }

  return { allowed: true, requiresConfirmation: false, canonicalAction, reason: "Authorized by canonical user, Agent and tenant policy." };
}
