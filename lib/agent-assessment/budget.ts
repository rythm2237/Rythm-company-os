export type RunLimits = {
  calls: number;
  tokens: number;
  costMicrousd: number;
  durationMs: number;
};

// Reserve the worst case before dispatch. A timeout or failed request retains its reservation.
export function createAssessmentBudget(limits: RunLimits, now = Date.now) {
  const cap = { ...limits };
  if (Object.values(cap).some((value) => !Number.isSafeInteger(value) || value < 0)) {
    throw new Error("Invalid assessment budget.");
  }
  const started = now();
  let used = { calls: 0, tokens: 0, costMicrousd: 0 };
  return {
    reserve(input: { tokens: number; costMicrousd: number; timeoutMs: number }) {
      if (!Number.isSafeInteger(input.tokens) || input.tokens < 1
        || !Number.isSafeInteger(input.costMicrousd) || input.costMicrousd < 1
        || !Number.isSafeInteger(input.timeoutMs) || input.timeoutMs < 1) {
        throw new Error("An assessment call requires a bounded token, cost and time reservation.");
      }
      if (used.calls >= cap.calls || input.tokens > cap.tokens - used.tokens
        || input.costMicrousd > cap.costMicrousd - used.costMicrousd
        || input.timeoutMs > cap.durationMs - (now() - started)) {
        throw new Error("Assessment budget exhausted.");
      }
      used = {
        calls: used.calls + 1,
        tokens: used.tokens + input.tokens,
        costMicrousd: used.costMicrousd + input.costMicrousd,
      };
    },
    reserved() {
      return { ...used };
    },
  };
}
