import assert from "node:assert/strict";
import { IntegrationExecutionError, normalizeExecutionError, normalizeHttpError } from "../lib/integrations/error-normalization";

const canary = "W06_PRIVATE_CUSTOMER_CANARY_example_AT_example.invalid";
const samples: Array<{ error: unknown; expected: string; kind: string }> = [
  { error: Error("Database rejected "+canary), expected: "EXECUTION_UNKNOWN", kind: "unknown" },
  { error: Error("Socket aborted for "+canary), expected: "EXECUTION_TIMEOUT", kind: "timeout" },
  { error: Error("Network failure "+canary), expected: "EXECUTION_NETWORK_ERROR", kind: "network_error" },
  { error: Error("Validation failure on "+canary), expected: "EXECUTION_VALIDATION_ERROR", kind: "validation_error" },
  { error: new IntegrationExecutionError("Provider error "+canary,"authorization_error",false,false,403), expected: "EXECUTION_AUTHORIZATION_ERROR", kind: "authorization_error" },
  { error: new IntegrationExecutionError("Rate limited "+canary,"rate_limit",true,false,429), expected: "EXECUTION_RATE_LIMIT", kind: "rate_limit" },
  { error: normalizeHttpError(500), expected: "EXECUTION_PROVIDER_UNAVAILABLE", kind: "provider_unavailable" },
];
for(const {error,expected,kind} of samples){
  const result=normalizeExecutionError(error);
  assert.equal(result.errorClass,kind);
  assert.equal(result.sanitizedError,expected);
  assert.doesNotMatch(JSON.stringify(result),/W06_PRIVATE_CUSTOMER_CANARY|example_AT_example/);
}
const rate=normalizeExecutionError(samples[samples.length-2].error);
assert.equal(rate.retryable,true);
assert.equal(rate.statusCode,429);
const timeout=normalizeExecutionError(samples[1].error);
assert.equal(timeout.uncertainCompletion,true);
console.log("PASS W06 real integration error normalizer: no raw customer content persisted, stable class/retry/uncertainty retained.");
