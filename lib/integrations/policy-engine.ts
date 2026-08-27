import type {
  ExecutionMode,
  ExecutionReasonCode,
  ExecutionRequest,
  ExecutionRisk,
} from "@/lib/integrations/contracts";

const RISK_WEIGHT: Record<ExecutionRisk, number> = {
  low: 0,
  medium: 1,
  high: 2,
  restricted: 3,
};

export type ApprovalEvidence = {
  status: "pending" | "approved" | "rejected" | "expired";
  scopeDigest?: string | null;
  expectedScopeDigest?: string | null;
  expiresAt?: string | null;
  consumedAt?: string | null;
};

export type ExecutionPolicyContext = {
  userAuthorized: boolean;
  agentAuthorized: boolean;
  agentEnabled: boolean;
  organizationEntitled: boolean;
  integrationEnabled: boolean;
  integrationConnected: boolean;
  operationSupported: boolean;
  payloadValid: boolean;
  agentCapabilities: string[];
  userPermissions: string[];
  requiredAgentCapabilities: string[];
  requiredUserPermissions: string[];
  grantedScopes: string[];
  requiredScopes: string[];
  agentRiskCeiling: ExecutionRisk;
  environment: "development" | "preview" | "production";
  allowedEnvironments: string[];
  externalActionsAllowed: boolean;
  duplicate: boolean;
  withinRateLimit: boolean;
  withinCostLimit: boolean;
  killSwitchActive: boolean;
  mode: ExecutionMode;
  approval?: ApprovalEvidence | null;
};

export type ExecutionPolicyDecision = {
  allowed: boolean;
  authorized: boolean;
  execute: boolean;
  approvalRequired: boolean;
  reasonCode: ExecutionReasonCode;
  reasonCodes: ExecutionReasonCode[];
  mode: ExecutionMode;
};

function missing(required: string[], available: string[]) {
  const normalized = new Set(
    available.map((item) => item.trim().toLowerCase()),
  );
  return required.some((item) => !normalized.has(item.trim().toLowerCase()));
}

export function evaluateExecutionPolicy(
  request: ExecutionRequest,
  context: ExecutionPolicyContext,
): ExecutionPolicyDecision {
  const deny = (reasonCode: ExecutionReasonCode): ExecutionPolicyDecision => ({
    allowed: false,
    authorized: false,
    execute: false,
    approvalRequired: false,
    reasonCode,
    reasonCodes: [reasonCode],
    mode: context.mode,
  });

  if (context.mode === "disabled") return deny("EXTERNAL_ACTION_DISABLED");
  if (context.killSwitchActive) return deny("KILL_SWITCH_ACTIVE");
  if (!context.userAuthorized) return deny("PERMISSION_DENIED");
  if (!context.agentAuthorized) return deny("PERMISSION_DENIED");
  if (request.agentId && !context.agentEnabled) return deny("AGENT_DISABLED");
  if (!context.organizationEntitled) return deny("ENTITLEMENT_DENIED");
  if (!context.integrationEnabled || !context.integrationConnected)
    return deny("INTEGRATION_DISABLED");
  if (!context.operationSupported) return deny("OPERATION_UNSUPPORTED");
  if (!context.payloadValid) return deny("INVALID_EXECUTION_CONTEXT");
  if (!context.allowedEnvironments.includes(context.environment))
    return deny("ENVIRONMENT_DENIED");
  if (request.authoritySource === "company_library")
    return deny("DOCUMENT_AUTHORITY_REJECTED");
  if (request.authoritySource === "boardroom")
    return deny("BOARDROOM_EXECUTION_REJECTED");
  if (missing(context.requiredAgentCapabilities, context.agentCapabilities))
    return deny("PERMISSION_DENIED");
  if (missing(context.requiredUserPermissions, context.userPermissions))
    return deny("PERMISSION_DENIED");
  if (missing(context.requiredScopes, context.grantedScopes))
    return deny("SCOPE_MISSING");
  if (
    RISK_WEIGHT[request.riskLevel] > RISK_WEIGHT[context.agentRiskCeiling] &&
    request.agentId
  )
    return deny("RISK_CEILING_EXCEEDED");
  if (request.externalSideEffect && !context.externalActionsAllowed)
    return deny("EXTERNAL_ACTION_DISABLED");
  if (context.duplicate) return deny("DUPLICATE_EXECUTION_BLOCKED");
  if (!context.withinRateLimit) return deny("RATE_LIMITED");
  if (!context.withinCostLimit) return deny("COST_LIMIT_EXCEEDED");

  const approvalRequired =
    request.humanApprovalRequired ||
    request.financialImpact ||
    request.approvalPolicy !== "not_required";
  if (request.approvalPolicy === "human_only" && request.agentId)
    return deny("RISK_CEILING_EXCEEDED");
  if (approvalRequired) {
    const approval = context.approval;
    if (!approval)
      return {
        allowed: true,
        authorized: true,
        execute: false,
        approvalRequired: true,
        reasonCode: request.financialImpact
          ? "FINANCIAL_APPROVAL_REQUIRED"
          : "APPROVAL_REQUIRED",
        reasonCodes: [
          request.financialImpact
            ? "FINANCIAL_APPROVAL_REQUIRED"
            : "APPROVAL_REQUIRED",
        ],
        mode: context.mode,
      };
    if (approval.status === "rejected") return deny("PERMISSION_DENIED");
    if (
      approval.status === "expired" ||
      (approval.expiresAt && new Date(approval.expiresAt) <= new Date())
    )
      return deny("APPROVAL_EXPIRED");
    if (approval.consumedAt) return deny("APPROVAL_ALREADY_CONSUMED");
    if (
      !approval.scopeDigest ||
      approval.scopeDigest !== approval.expectedScopeDigest
    )
      return deny("APPROVAL_SCOPE_MISMATCH");
    if (approval.status !== "approved")
      return {
        allowed: true,
        authorized: true,
        execute: false,
        approvalRequired: true,
        reasonCode: "APPROVAL_REQUIRED",
        reasonCodes: ["APPROVAL_REQUIRED"],
        mode: context.mode,
      };
  }

  if (context.mode === "simulate")
    return {
      allowed: true,
      authorized: true,
      execute: false,
      approvalRequired,
      reasonCode: "ALLOWED",
      reasonCodes: ["ALLOWED"],
      mode: context.mode,
    };
  if (context.mode === "approval_only")
    return {
      allowed: true,
      authorized: true,
      execute: false,
      approvalRequired: true,
      reasonCode: "APPROVAL_REQUIRED",
      reasonCodes: ["APPROVAL_REQUIRED"],
      mode: context.mode,
    };
  if (context.mode === "limited_enforced" && request.externalSideEffect)
    return deny("EXTERNAL_ACTION_DISABLED");
  return {
    allowed: true,
    authorized: true,
    execute: true,
    approvalRequired,
    reasonCode: "ALLOWED",
    reasonCodes: ["ALLOWED"],
    mode: context.mode,
  };
}
