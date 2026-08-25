export type DirectProviderDisposition = "adapter_boundary" | "gateway_migrated" | "temporary_exception" | "deprecated_dead_path";

export type DirectProviderInventoryItem = {
  path: string;
  providers: string[];
  disposition: DirectProviderDisposition;
  reason: string;
  securityImplications: string;
  futurePath: string;
};

export const DIRECT_PROVIDER_INVENTORY: DirectProviderInventoryItem[] = [
  {
    path: "lib/ai/agent-provider.ts",
    providers: ["openai", "anthropic", "google"],
    disposition: "adapter_boundary",
    reason: "Existing provider transport implementation retained behind the Phase 1A adapter registry.",
    securityImplications: "Provider credentials remain server-only and provider eligibility is enforced before transport execution.",
    futurePath: "Split transports into provider-specific modules without changing the canonical Gateway contract.",
  },
  {
    path: "app/api/meetings/deliberate/route.ts",
    providers: ["openai"],
    disposition: "gateway_migrated",
    reason: "Phase 1D governed Boardroom inference now executes only through the canonical Gateway.",
    securityImplications: "CEO authorization, organization-scoped participants, internal-analysis constraints and meeting budget checks remain authoritative.",
    futurePath: "Remain on the canonical Gateway; Phase 1E may only adjust feature-scoped rollout controls after approval.",
  },
  {
    path: "app/api/meetings/summarize/route.ts",
    providers: ["openai"],
    disposition: "gateway_migrated",
    reason: "Phase 1D tenant-scoped Boardroom summary now executes only through the canonical Gateway.",
    securityImplications: "Owner context, meeting tenant filters, telemetry and budget accounting are required before a result is accepted.",
    futurePath: "Remain on the canonical Gateway; Phase 1E may only adjust feature-scoped rollout controls after approval.",
  },
  {
    path: "app/api/meetings/legal-triage/route.ts",
    providers: ["openai"],
    disposition: "gateway_migrated",
    reason: "Phase 1D advisory legal triage now executes only through the canonical Gateway.",
    securityImplications: "B-001 must belong to the organization and Human CEO closure remains an authoritative prerequisite.",
    futurePath: "Remain on the canonical Gateway; Phase 1E may only adjust feature-scoped rollout controls after approval.",
  },
  {
    path: "app/api/meetings/legal-review/route.ts",
    providers: ["openai"],
    disposition: "gateway_migrated",
    reason: "Phase 1D structured advisory legal review now executes only through the canonical Gateway.",
    securityImplications: "A-106 remains tenant-bound and advisory; model strength never implies legal approval or execution authority.",
    futurePath: "Remain on the canonical Gateway; Phase 1E may only adjust feature-scoped rollout controls after approval.",
  },
  {
    path: "lib/company-library-ingestion.ts",
    providers: ["openai"],
    disposition: "gateway_migrated",
    reason: "Phase 1D provider-assisted tenant document extraction now executes only through the canonical Gateway.",
    securityImplications: "Organization context, entitlement, source provenance and fail-closed binary handling prevent cross-tenant or source-free extraction.",
    futurePath: "Remain on the specialized document-extraction Gateway feature and preserve Phase 0 ingestion protections.",
  },
  {
    path: "app/(app)/studio/agents/[id]/run/actions.ts",
    providers: ["openai"],
    disposition: "temporary_exception",
    reason: "Approved image generation and visual-QA exception; tenant context is resolved canonically and no external business action is authorized.",
    securityImplications: "OpenAI credentials remain server-only; the path is restricted to image output and internal QA with external actions disabled.",
    futurePath: "Move through a specialized multimodal Gateway profile after the Phase 1 text paths stabilize.",
  },
  {
    path: "app/api/runtime/execute-validation/route.ts",
    providers: ["openai"],
    disposition: "temporary_exception",
    reason: "Approved runtime execution-validation exception; existing owner, organization, dry-run and external-action-off guards remain authoritative.",
    securityImplications: "A direct provider remains reachable, but only after owner and tenant validation and without real external execution.",
    futurePath: "Migrate with the future governed Execution Gateway phase, not Phase 1.",
  },
  {
    path: "lib/evaluation/runtime.ts",
    providers: ["openai"],
    disposition: "temporary_exception",
    reason: "Approved fixed-model evaluation exception required for benchmark comparability and isolated from external execution.",
    securityImplications: "The fixed provider/model is server-side, benchmark-only and cannot grant tools, permissions or external execution.",
    futurePath: "Introduce an auditable fixed-model Gateway profile without adaptive model substitution.",
  },
  {
    path: "lib/evaluation/promotion.ts",
    providers: ["openai"],
    disposition: "temporary_exception",
    reason: "Approved fixed-model promotion benchmark exception; tenant records remain organization-scoped and no automatic promotion occurs.",
    securityImplications: "The fixed provider/model is server-side and promotion remains evidence-based, tenant-scoped and human-governed.",
    futurePath: "Introduce an auditable fixed-model Gateway profile without adaptive model substitution.",
  },
];
