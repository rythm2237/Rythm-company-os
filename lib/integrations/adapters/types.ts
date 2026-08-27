import type {
  ExecutionRequest,
  VerificationResult,
} from "@/lib/integrations/contracts";
import type { NormalizedExecutionErrorClass } from "@/lib/integrations/error-normalization";

export type AdapterContext = {
  request: ExecutionRequest;
  credential: string;
  accountRef?: string | null;
  baseUrl?: string | null;
  idempotencyKey: string;
};

export type PreparedAdapterExecution = { url: URL; init: RequestInit };
export type AdapterExecutionOutcome = {
  rawResult: unknown;
  externalReferenceId?: string | null;
  rollbackReference?: Record<string, unknown> | null;
};
export type AdapterError = {
  errorClass: NormalizedExecutionErrorClass;
  retryable: boolean;
  uncertainCompletion: boolean;
  sanitizedError: string;
};

export interface IntegrationAdapter {
  readonly integrationId: string;
  readonly version: string;
  readonly supportedTools: readonly string[];
  validate(context: AdapterContext): Promise<void> | void;
  prepare(
    context: AdapterContext,
  ): Promise<PreparedAdapterExecution> | PreparedAdapterExecution;
  execute(
    context: AdapterContext,
    prepared: PreparedAdapterExecution,
  ): Promise<AdapterExecutionOutcome>;
  verify(
    context: AdapterContext,
    outcome: AdapterExecutionOutcome,
  ): Promise<VerificationResult>;
  normalizeError(error: unknown): AdapterError;
  rollback?(
    context: AdapterContext,
    rollbackReference: Record<string, unknown>,
  ): Promise<AdapterExecutionOutcome>;
  verifyRollback?(
    context: AdapterContext,
    rollbackReference: Record<string, unknown>,
    outcome: AdapterExecutionOutcome,
  ): Promise<VerificationResult>;
  healthCheck(
    context: Pick<AdapterContext, "credential" | "baseUrl" | "accountRef">,
  ): Promise<{ healthy: boolean; detail: string }>;
}
