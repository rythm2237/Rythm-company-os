export type ExecutionPathClass = "A" | "B" | "C" | "D" | "E" | "F" | "G" | "H";
export type ExecutionDisposition =
  | "gateway_migrated"
  | "adapter_boundary"
  | "platform_control_boundary"
  | "temporary_exception";

export type DirectExecutionInventoryItem = {
  path: string;
  classification: ExecutionPathClass[];
  disposition: ExecutionDisposition;
  owner: string;
  scope: string;
  risk: string;
  reason: string;
  migrationPlan: string;
  reviewPoint: string;
};

export const DIRECT_EXECUTION_INVENTORY: DirectExecutionInventoryItem[] = [
  {
    path: "lib/integrations/provider-executors.ts",
    classification: ["B", "D", "E", "F", "G"],
    disposition: "adapter_boundary",
    owner: "Integration Gateway",
    scope:
      "Provider-specific HTTP implementation reached only through registered adapters",
    risk: "Provider mutations",
    reason: "Compatibility transport behind the canonical adapter lifecycle",
    migrationPlan:
      "Split transports by provider without changing the adapter contract",
    reviewPoint: "Phase 2.1 adapter maintenance",
  },
  {
    path: "lib/integrations/adapters/http.ts",
    classification: ["B", "D", "E"],
    disposition: "adapter_boundary",
    owner: "Integration Gateway",
    scope: "SSRF-safe HTTP transport",
    risk: "External network access",
    reason: "Only approved adapter code may perform provider HTTP",
    migrationPlan: "Permanent boundary",
    reviewPoint: "Every provider addition",
  },
  {
    path: "app/api/communication/outbound/resend/route.ts",
    classification: ["E"],
    disposition: "gateway_migrated",
    owner: "Communication Center",
    scope: "Exact Human CEO approved outbound email",
    risk: "External communication",
    reason:
      "Route now proposes through requestToolExecution and contains no direct provider call",
    migrationPlan: "Remain on resend.email adapter",
    reviewPoint: "Each transport change",
  },
  {
    path: "lib/ai/agent-provider.ts",
    classification: ["B"],
    disposition: "platform_control_boundary",
    owner: "AI Request Gateway",
    scope: "Phase 1 AI inference transport",
    risk: "Model-provider data transfer",
    reason: "Phase 1 adapter boundary; not an operational execution tool",
    migrationPlan: "Preserve Phase 1 contract",
    reviewPoint: "Phase 1 provider inventory review",
  },
  {
    path: "app/(app)/studio/agents/[id]/run/actions.ts",
    classification: ["A", "C"],
    disposition: "temporary_exception",
    owner: "Agent Runtime",
    scope:
      "Image/visual QA plus internal evidence writes; external actions remain false",
    risk: "Provider inference and tenant evidence mutation",
    reason:
      "Existing Phase 1 approved multimodal exception and platform-authored runtime evidence",
    migrationPlan:
      "Move multimodal inference through its specialized AI Gateway profile; keep evidence writes platform-owned",
    reviewPoint: "Phase 2.1 / multimodal gateway",
  },
  {
    path: "app/api/runtime/execute-validation/route.ts",
    classification: ["A", "C"],
    disposition: "temporary_exception",
    owner: "Runtime Assurance",
    scope: "Owner-triggered dry-run validation only",
    risk: "Internal validation records",
    reason:
      "Existing dual-lock validation exception; no external business action",
    migrationPlan: "Retire in favor of internal.validation adapter",
    reviewPoint: "After Release Gate 2 Production validation",
  },
  {
    path: "lib/evaluation/runtime.ts",
    classification: ["A", "C"],
    disposition: "temporary_exception",
    owner: "Evaluation",
    scope: "Fixed-model isolated benchmark evidence",
    risk: "Internal evidence writes",
    reason: "Benchmark comparability; no tool authority or external action",
    migrationPlan: "Auditable fixed-model AI Gateway profile",
    reviewPoint: "Evaluation phase",
  },
  {
    path: "lib/evaluation/promotion.ts",
    classification: ["A", "C"],
    disposition: "temporary_exception",
    owner: "Evaluation",
    scope: "Fixed-model promotion evidence; no automatic promotion",
    risk: "Internal evidence writes",
    reason: "Human certification remains mandatory",
    migrationPlan: "Auditable fixed-model AI Gateway profile",
    reviewPoint: "Evaluation phase",
  },
  {
    path: "lib/trusted-agent-knowledge.ts",
    classification: ["A", "B", "C"],
    disposition: "platform_control_boundary",
    owner: "Knowledge Provisioning",
    scope:
      "Trusted-source acquisition and versioned internal knowledge evidence",
    risk: "External read and tenant-scoped internal mutation",
    reason:
      "Platform provisioning service, not prompt-authorized Agent execution",
    migrationPlan: "Route any future external write through Execution Gateway",
    reviewPoint: "Every acquisition-provider addition",
  },
  {
    path: "lib/trusted-specialization-acquisition.ts",
    classification: ["A", "B", "C"],
    disposition: "platform_control_boundary",
    owner: "Knowledge Provisioning",
    scope: "Allowlisted research reads and internal specialization evidence",
    risk: "External read",
    reason:
      "Document/source content is untrusted data and cannot grant execution authority",
    migrationPlan: "Permanent read boundary; no external mutations allowed",
    reviewPoint: "Every source-provider addition",
  },
  {
    path: "lib/billing/stripe-rest.ts",
    classification: ["F"],
    disposition: "temporary_exception",
    owner: "Commercial Billing",
    scope:
      "Authenticated Human Owner self-service Checkout and Portal session creation",
    risk: "Commercial commitment",
    reason:
      "Human-initiated billing UI is not reachable by Agents; provider idempotency is enforced",
    migrationPlan:
      "Adopt a platform-owned Stripe adapter profile with exact checkout preview",
    reviewPoint: "Phase 2.1 before Agent-accessible billing tools",
  },
  {
    path: "app/api/billing/checkout/route.ts",
    classification: ["F"],
    disposition: "temporary_exception",
    owner: "Commercial Billing",
    scope: "Authenticated Owner creates a Stripe-hosted checkout session",
    risk: "Subscription commitment",
    reason:
      "The Human CEO click is the initiating authority; Agents have no route or capability to invoke it",
    migrationPlan:
      "Move session creation behind the platform Stripe adapter before exposing any billing capability to Agents",
    reviewPoint: "Phase 2.1 commercial execution review",
  },
  {
    path: "app/api/billing/portal/route.ts",
    classification: ["F"],
    disposition: "temporary_exception",
    owner: "Commercial Billing",
    scope: "Authenticated Owner opens the Stripe billing portal",
    risk: "Customer-controlled billing mutation",
    reason:
      "Portal mutations happen in Stripe's authenticated user surface and are not Agent reachable",
    migrationPlan:
      "Record portal-session creation through the platform Stripe adapter",
    reviewPoint: "Phase 2.1 commercial execution review",
  },
  {
    path: "app/api/billing/webhook/route.ts",
    classification: ["C", "F", "G"],
    disposition: "platform_control_boundary",
    owner: "Commercial Billing",
    scope: "Signature-verified inbound Stripe lifecycle events",
    risk: "Financial record mutation",
    reason:
      "Provider-initiated inbound event, not Agent execution; duplicate ledger exists",
    migrationPlan: "Permanent signed webhook boundary with reconciliation",
    reviewPoint: "Every Stripe event expansion",
  },
  {
    path: "app/api/communication/inbound/resend/route.ts",
    classification: ["C", "G"],
    disposition: "platform_control_boundary",
    owner: "Communication Transport",
    scope: "Signature-verified inbound email",
    risk: "Tenant message creation",
    reason: "Provider-initiated inbound event, not Agent execution",
    migrationPlan: "Permanent inbound transport boundary",
    reviewPoint: "Every webhook schema change",
  },
  {
    path: "app/api/communication/inbound/cloudflare/route.ts",
    classification: ["C", "G"],
    disposition: "platform_control_boundary",
    owner: "Communication Transport",
    scope: "Shared-secret verified inbound email",
    risk: "Tenant message creation",
    reason: "Provider-initiated inbound event, not Agent execution",
    migrationPlan:
      "Prefer asymmetric webhook signing when Cloudflare supports it",
    reviewPoint: "Phase 2.1 security review",
  },
];
