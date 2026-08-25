export type DirectProviderDisposition = "adapter_boundary" | "migrate_phase_1" | "temporary_exception" | "deprecated_dead_path";

export type DirectProviderInventoryItem = {
  path: string;
  providers: string[];
  disposition: DirectProviderDisposition;
  reason: string;
  futurePath: string;
};

export const DIRECT_PROVIDER_INVENTORY: DirectProviderInventoryItem[] = [
  {
    path: "lib/ai/agent-provider.ts",
    providers: ["openai", "anthropic", "google"],
    disposition: "adapter_boundary",
    reason: "Existing provider transport implementation retained behind the Phase 1A adapter registry.",
    futurePath: "Split transports into provider-specific modules without changing the canonical Gateway contract.",
  },
  {
    path: "app/api/meetings/deliberate/route.ts",
    providers: ["openai"],
    disposition: "migrate_phase_1",
    reason: "Existing governed Boardroom inference path.",
    futurePath: "Migrate incrementally in Phase 1D while preserving CEO authorization and meeting budget controls.",
  },
  {
    path: "app/api/meetings/summarize/route.ts",
    providers: ["openai"],
    disposition: "migrate_phase_1",
    reason: "Existing tenant-scoped Boardroom summary path.",
    futurePath: "Migrate in Phase 1D with structured telemetry and existing session accounting.",
  },
  {
    path: "app/api/meetings/legal-triage/route.ts",
    providers: ["openai"],
    disposition: "migrate_phase_1",
    reason: "Existing advisory legal triage path with owner and organization checks.",
    futurePath: "Migrate in Phase 1D while preserving advisory-only and Human CEO boundaries.",
  },
  {
    path: "app/api/meetings/legal-review/route.ts",
    providers: ["openai"],
    disposition: "migrate_phase_1",
    reason: "Existing structured advisory legal review path.",
    futurePath: "Migrate in Phase 1D with structured-output validation intact.",
  },
  {
    path: "lib/company-library-ingestion.ts",
    providers: ["openai"],
    disposition: "migrate_phase_1",
    reason: "Existing provider-assisted extraction for tenant documents.",
    futurePath: "Migrate in Phase 1D under a specialized document-extraction feature profile.",
  },
  {
    path: "app/(app)/studio/agents/[id]/run/actions.ts",
    providers: ["openai"],
    disposition: "temporary_exception",
    reason: "Approved image generation and visual-QA exception; tenant context is resolved canonically and no external business action is authorized.",
    futurePath: "Move through a specialized multimodal Gateway profile after the Phase 1 text paths stabilize.",
  },
  {
    path: "app/api/runtime/execute-validation/route.ts",
    providers: ["openai"],
    disposition: "temporary_exception",
    reason: "Approved runtime execution-validation exception; existing owner, organization, dry-run and external-action-off guards remain authoritative.",
    futurePath: "Migrate with the future governed Execution Gateway phase, not Phase 1.",
  },
  {
    path: "lib/evaluation/runtime.ts",
    providers: ["openai"],
    disposition: "temporary_exception",
    reason: "Approved fixed-model evaluation exception required for benchmark comparability and isolated from external execution.",
    futurePath: "Introduce an auditable fixed-model Gateway profile without adaptive model substitution.",
  },
  {
    path: "lib/evaluation/promotion.ts",
    providers: ["openai"],
    disposition: "temporary_exception",
    reason: "Approved fixed-model promotion benchmark exception; tenant records remain organization-scoped and no automatic promotion occurs.",
    futurePath: "Introduce an auditable fixed-model Gateway profile without adaptive model substitution.",
  },
];
