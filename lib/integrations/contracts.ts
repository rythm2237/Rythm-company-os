export const EXECUTION_POLICY_VERSION = "execution-policy-v2.0.0";

export type ExecutionMode =
  | "disabled"
  | "simulate"
  | "approval_only"
  | "limited_enforced"
  | "enforced";
export type ExecutionRisk = "low" | "medium" | "high" | "restricted";
export type ExecutionReversibility =
  | "reversible"
  | "compensatable"
  | "irreversible"
  | "not_applicable";
export type DataSensitivity =
  | "public"
  | "internal"
  | "confidential"
  | "restricted";
export type ApprovalPolicy =
  | "not_required"
  | "human_ceo_required"
  | "human_only";
export type RetryPolicy = {
  maxAttempts: number;
  baseDelayMs: number;
  maxDelayMs: number;
};

export type ExecutionStatus =
  | "requested"
  | "authorized"
  | "waiting_approval"
  | "approved"
  | "executing"
  | "succeeded"
  | "failed"
  | "rolled_back"
  | "rejected"
  | "expired"
  | "cancelled"
  | "denied"
  | "simulated";

export type ExecutionRequest = {
  executionId?: string;
  correlationId: string;
  organizationId: string;
  userId: string;
  agentId?: string | null;
  originatingRequestId?: string | null;
  projectId?: string | null;
  meetingId?: string | null;
  sessionId?: string | null;
  actionType: string;
  integration: string;
  integrationId: string;
  tool: string;
  operation: string;
  target?: string | null;
  payloadReference?: string | null;
  payloadDigest?: string | null;
  input: Record<string, unknown>;
  requestedAt: string;
  requestedBy: "user" | "agent" | "system";
  intent: string;
  riskLevel: ExecutionRisk;
  reversibility: ExecutionReversibility;
  externalSideEffect: boolean;
  financialImpact: boolean;
  dataSensitivity: DataSensitivity;
  requiredPermissions: string[];
  requiredScopes: string[];
  humanApprovalRequired: boolean;
  approvalPolicy: ApprovalPolicy;
  idempotencyKey: string;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  costLimit?: number | null;
  executionMode: ExecutionMode;
  policyVersion: string;
  authoritySource?:
    | "human"
    | "agent"
    | "boardroom"
    | "company_library"
    | "system";
};

export type VerificationResult = {
  status: "verified" | "not_verified" | "not_applicable" | "failed";
  detail?: Record<string, unknown>;
};

export type ExecutionResult = {
  executionId: string;
  status: ExecutionStatus;
  authorized: boolean;
  approvalStatus:
    | "not_required"
    | "pending"
    | "approved"
    | "rejected"
    | "expired";
  executed: boolean;
  provider: string;
  integration: string;
  tool: string;
  operation: string;
  startedAt?: string | null;
  completedAt?: string | null;
  latencyMs?: number | null;
  retries: number;
  externalReferenceId?: string | null;
  resultMetadata: Record<string, unknown>;
  verificationResult: VerificationResult;
  rollbackAvailable: boolean;
  rollbackReference?: Record<string, unknown> | null;
  normalizedErrorClass?: string | null;
  sanitizedError?: string | null;
  auditEventId?: string | number | null;
};

export const EXECUTION_REASON_CODES = [
  "ALLOWED",
  "APPROVAL_REQUIRED",
  "PERMISSION_DENIED",
  "ENTITLEMENT_DENIED",
  "TOOL_UNAVAILABLE",
  "SCOPE_MISSING",
  "RISK_CEILING_EXCEEDED",
  "EXTERNAL_ACTION_DISABLED",
  "FINANCIAL_APPROVAL_REQUIRED",
  "DUPLICATE_EXECUTION_BLOCKED",
  "RATE_LIMITED",
  "COST_LIMIT_EXCEEDED",
  "KILL_SWITCH_ACTIVE",
  "INVALID_EXECUTION_CONTEXT",
  "AGENT_DISABLED",
  "INTEGRATION_DISABLED",
  "ENVIRONMENT_DENIED",
  "OPERATION_UNSUPPORTED",
  "APPROVAL_EXPIRED",
  "APPROVAL_SCOPE_MISMATCH",
  "APPROVAL_ALREADY_CONSUMED",
  "DOCUMENT_AUTHORITY_REJECTED",
  "BOARDROOM_EXECUTION_REJECTED",
] as const;

export type ExecutionReasonCode = (typeof EXECUTION_REASON_CODES)[number];
