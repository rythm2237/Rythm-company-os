import type {
  ApprovalPolicy,
  DataSensitivity,
  ExecutionMode,
  ExecutionReversibility,
  ExecutionRisk,
  RetryPolicy,
} from "@/lib/integrations/contracts";

export type ToolOperationMetadata = {
  operation: string;
  readWrite: "read" | "write";
  external: boolean;
  riskLevel: ExecutionRisk;
  riskCeiling: ExecutionRisk;
  approvalPolicy: ApprovalPolicy;
  reversibility: ExecutionReversibility;
  dataSensitivity: DataSensitivity;
  externalSideEffect: boolean;
  financialImpact: boolean;
  requiredAgentPermissions: string[];
  requiredUserPermissions: string[];
  requiredEntitlement?: string | null;
  requiredScopes: string[];
  idempotencySupported: boolean;
  timeoutMs: number;
  retryPolicy: RetryPolicy;
  rateLimit: {
    userPerHour: number;
    organizationPerHour: number;
    agentPerHour: number;
    integrationPerHour: number;
    operationPerHour: number;
  };
  allowedEnvironments: Array<"development" | "preview" | "production">;
  rollbackSupported: boolean;
};

export type ToolMetadata = {
  toolId: string;
  integrationId: string;
  name: string;
  version: string;
  category: string;
  adapterVersion: string;
  enabled: boolean;
  killSwitch: boolean;
  defaultMode: ExecutionMode;
  operations: Record<string, ToolOperationMetadata>;
};

const READ_RETRY: RetryPolicy = {
  maxAttempts: 3,
  baseDelayMs: 150,
  maxDelayMs: 1_500,
};
const WRITE_RETRY: RetryPolicy = {
  maxAttempts: 2,
  baseDelayMs: 250,
  maxDelayMs: 2_000,
};
const ENVIRONMENTS: ToolOperationMetadata["allowedEnvironments"] = [
  "development",
  "preview",
  "production",
];

function readOperation(
  permission: string,
  scopes: string[] = [],
): ToolOperationMetadata {
  return {
    operation: "read",
    readWrite: "read",
    external: true,
    riskLevel: "low",
    riskCeiling: "low",
    approvalPolicy: "not_required",
    reversibility: "not_applicable",
    dataSensitivity: "internal",
    externalSideEffect: false,
    financialImpact: false,
    requiredAgentPermissions: [permission],
    requiredUserPermissions: ["read"],
    requiredScopes: scopes,
    idempotencySupported: true,
    timeoutMs: 15_000,
    retryPolicy: READ_RETRY,
    rateLimit: {
      userPerHour: 120,
      organizationPerHour: 1_000,
      agentPerHour: 240,
      integrationPerHour: 1_000,
      operationPerHour: 500,
    },
    allowedEnvironments: ENVIRONMENTS,
    rollbackSupported: false,
  };
}

function consequentialWrite(input: {
  operation: string;
  permission: string;
  userPermission?: string;
  scopes?: string[];
  risk?: ExecutionRisk;
  reversibility?: ExecutionReversibility;
  financial?: boolean;
  idempotency?: boolean;
  rollback?: boolean;
  timeoutMs?: number;
}): ToolOperationMetadata {
  const risk = input.risk ?? "high";
  return {
    operation: input.operation,
    readWrite: "write",
    external: true,
    riskLevel: risk,
    riskCeiling: risk,
    approvalPolicy: risk === "restricted" ? "human_only" : "human_ceo_required",
    reversibility: input.reversibility ?? "irreversible",
    dataSensitivity: "confidential",
    externalSideEffect: true,
    financialImpact: Boolean(input.financial),
    requiredAgentPermissions: [input.permission],
    requiredUserPermissions: [
      input.userPermission ?? (input.financial ? "financial" : "privileged"),
    ],
    requiredScopes: input.scopes ?? [],
    idempotencySupported: input.idempotency ?? false,
    timeoutMs: input.timeoutMs ?? 20_000,
    retryPolicy: WRITE_RETRY,
    rateLimit: {
      userPerHour: 20,
      organizationPerHour: 100,
      agentPerHour: 20,
      integrationPerHour: 100,
      operationPerHour: 50,
    },
    allowedEnvironments: ENVIRONMENTS,
    rollbackSupported: Boolean(input.rollback),
  };
}

export const TOOL_REGISTRY: Record<string, ToolMetadata> = {
  "internal.validation": {
    toolId: "internal.validation",
    integrationId: "internal",
    name: "RYTHM Execution Validation",
    version: "2.0.0",
    category: "internal_control",
    adapterVersion: "internal-validation-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "validation.record.create": {
        ...consequentialWrite({
          operation: "validation.record.create",
          permission: "create_validation_record",
          userPermission: "privileged",
          risk: "medium",
          reversibility: "reversible",
          rollback: true,
          idempotency: true,
        }),
        external: false,
        externalSideEffect: false,
        dataSensitivity: "internal",
        requiredScopes: [],
        allowedEnvironments: ENVIRONMENTS,
      },
    },
  },
  "github.repository": {
    toolId: "github.repository",
    integrationId: "github",
    name: "GitHub Repository",
    version: "2.0.0",
    category: "source_control",
    adapterVersion: "github-adapter-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "repo.read": readOperation("read_repository", ["repo:read"]),
      "branch.create": consequentialWrite({
        operation: "branch.create",
        permission: "propose_code_change",
        userPermission: "create",
        scopes: ["repo:write"],
        risk: "medium",
        reversibility: "reversible",
        rollback: true,
      }),
      "code.write": consequentialWrite({
        operation: "code.write",
        permission: "execute_code_change",
        userPermission: "update",
        scopes: ["repo:write"],
        risk: "high",
        reversibility: "compensatable",
      }),
      "pull_request.create": consequentialWrite({
        operation: "pull_request.create",
        permission: "propose_code_change",
        userPermission: "create",
        scopes: ["pull_requests:write"],
        risk: "medium",
        reversibility: "reversible",
        rollback: true,
      }),
      "pull_request.merge": consequentialWrite({
        operation: "pull_request.merge",
        permission: "execute_code_change",
        userPermission: "publish",
        scopes: ["pull_requests:write"],
        risk: "high",
        reversibility: "irreversible",
      }),
    },
  },
  "vercel.deployment": {
    toolId: "vercel.deployment",
    integrationId: "vercel",
    name: "Vercel Deployment",
    version: "2.0.0",
    category: "deployment",
    adapterVersion: "vercel-adapter-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "deployment.read": readOperation("read_deployments", ["deployment:read"]),
      "preview.deploy": consequentialWrite({
        operation: "preview.deploy",
        permission: "create_preview_deployment",
        userPermission: "publish",
        scopes: ["deployment:write"],
        risk: "medium",
        reversibility: "compensatable",
      }),
      "production.deploy": consequentialWrite({
        operation: "production.deploy",
        permission: "deploy_production",
        userPermission: "publish",
        scopes: ["deployment:write"],
        risk: "high",
        reversibility: "compensatable",
      }),
    },
  },
  "supabase.database": {
    toolId: "supabase.database",
    integrationId: "supabase",
    name: "Supabase Database",
    version: "2.0.0",
    category: "database",
    adapterVersion: "supabase-adapter-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "schema.read": readOperation("read_database_schema", ["database:read"]),
      "sql.read": readOperation("read_company_data", ["database:read"]),
      "migration.apply": consequentialWrite({
        operation: "migration.apply",
        permission: "modify_database_schema",
        userPermission: "privileged",
        scopes: ["database:write"],
        risk: "high",
        reversibility: "compensatable",
        idempotency: false,
        timeoutMs: 30_000,
      }),
    },
  },
  "cloudflare.dns": {
    toolId: "cloudflare.dns",
    integrationId: "cloudflare",
    name: "Cloudflare DNS",
    version: "2.0.0",
    category: "dns_edge",
    adapterVersion: "cloudflare-adapter-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "dns.read": readOperation("read_dns", ["dns:read"]),
      "dns.write": consequentialWrite({
        operation: "dns.write",
        permission: "modify_dns",
        userPermission: "privileged",
        scopes: ["dns:write"],
        risk: "high",
        reversibility: "compensatable",
      }),
    },
  },
  "stripe.billing": {
    toolId: "stripe.billing",
    integrationId: "stripe",
    name: "Stripe Billing",
    version: "2.0.0",
    category: "payments",
    adapterVersion: "stripe-adapter-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "billing.read": readOperation("read_billing", ["billing:read"]),
      "refund.create": consequentialWrite({
        operation: "refund.create",
        permission: "create_refund",
        userPermission: "financial",
        scopes: ["refunds:write"],
        risk: "high",
        reversibility: "irreversible",
        financial: true,
        idempotency: true,
      }),
    },
  },
  "google_workspace.calendar": {
    toolId: "google_workspace.calendar",
    integrationId: "google_workspace",
    name: "Google Calendar",
    version: "2.0.0",
    category: "productivity",
    adapterVersion: "google_workspace-adapter-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "calendar.read": readOperation("read_calendar", ["calendar.readonly"]),
      "calendar.write": consequentialWrite({
        operation: "calendar.write",
        permission: "create_calendar_event",
        userPermission: "create",
        scopes: ["calendar.events"],
        risk: "medium",
        reversibility: "reversible",
        rollback: true,
      }),
    },
  },
  "google_workspace.email": {
    toolId: "google_workspace.email",
    integrationId: "google_workspace",
    name: "Gmail",
    version: "2.0.0",
    category: "communication",
    adapterVersion: "google_workspace-adapter-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "email.send": consequentialWrite({
        operation: "email.send",
        permission: "send_email",
        userPermission: "external_communication",
        scopes: ["gmail.send"],
        risk: "high",
        reversibility: "irreversible",
      }),
    },
  },
  "microsoft_365.calendar": {
    toolId: "microsoft_365.calendar",
    integrationId: "microsoft_365",
    name: "Microsoft Calendar",
    version: "2.0.0",
    category: "productivity",
    adapterVersion: "microsoft_365-adapter-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "calendar.read": readOperation("read_calendar", ["Calendars.Read"]),
      "calendar.write": consequentialWrite({
        operation: "calendar.write",
        permission: "create_calendar_event",
        userPermission: "create",
        scopes: ["Calendars.ReadWrite"],
        risk: "medium",
        reversibility: "reversible",
        rollback: true,
      }),
    },
  },
  "microsoft_365.email": {
    toolId: "microsoft_365.email",
    integrationId: "microsoft_365",
    name: "Microsoft Mail",
    version: "2.0.0",
    category: "communication",
    adapterVersion: "microsoft_365-adapter-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "email.send": consequentialWrite({
        operation: "email.send",
        permission: "send_email",
        userPermission: "external_communication",
        scopes: ["Mail.Send"],
        risk: "high",
        reversibility: "irreversible",
      }),
    },
  },
  "resend.email": {
    toolId: "resend.email",
    integrationId: "resend",
    name: "Resend Email",
    version: "2.0.0",
    category: "communication",
    adapterVersion: "resend-v2",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "email.send": consequentialWrite({
        operation: "email.send",
        permission: "send_email",
        userPermission: "external_communication",
        scopes: ["email.send"],
        risk: "high",
        reversibility: "irreversible",
        idempotency: true,
      }),
    },
  },
  "generic_business_api.request": {
    toolId: "generic_business_api.request",
    integrationId: "generic_business_api",
    name: "Generic Business API",
    version: "1.0.0",
    category: "generic_connector",
    adapterVersion: "generic-business-api-v1",
    enabled: true,
    killSwitch: false,
    defaultMode: "simulate",
    operations: {
      "api.read": {
        ...readOperation("read_connected_business_system", ["api.read"]),
        operation: "api.read",
        dataSensitivity: "confidential",
      },
      "api.write": consequentialWrite({
        operation: "api.write",
        permission: "write_connected_business_system",
        userPermission: "privileged",
        scopes: ["api.write"],
        risk: "high",
        reversibility: "compensatable",
        idempotency: true,
      }),
      "webhook.send": consequentialWrite({
        operation: "webhook.send",
        permission: "send_connected_business_webhook",
        userPermission: "privileged",
        scopes: ["webhook.send"],
        risk: "high",
        reversibility: "irreversible",
        idempotency: true,
      }),
    },
  },
};

export function getToolMetadata(toolId: string, operation: string) {
  const tool = TOOL_REGISTRY[toolId];
  if (!tool) return null;
  const metadata = tool.operations[operation];
  return metadata ? { tool, operation: metadata } : null;
}
