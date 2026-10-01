/** Synchronous locks protect the gap before React renders a pending state. */
export class ActionLock {
  private active = false;
  isActive() { return this.active; }
  acquire() { if (this.active) return false; this.active = true; return true; }
  release() { this.active = false; }
}

/** Invalidate reads begun before a mutation or a more recent read. */
export class ReadEpoch {
  private epoch = 0;
  begin() { return ++this.epoch; }
  invalidate() { ++this.epoch; }
  accepts(epoch: number) { return epoch === this.epoch; }
}

export function resolutionReplay(status: string, resolution: string) {
  return status === resolution ? "replay" : status === "pending" ? "resolve" : "conflict";
}
