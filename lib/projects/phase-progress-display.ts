/** A phase percentage is shown only when backed by a recorded outcome or completion. */
export function recordedPhaseProgress(status: string, outcomeProgress: unknown): number | null {
  if (["completed", "done", "validated"].includes(status)) return 100;
  if (outcomeProgress === null || outcomeProgress === undefined || outcomeProgress === "") return null;
  const value = Number(outcomeProgress);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : null;
}
