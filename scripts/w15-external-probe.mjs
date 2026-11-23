#!/usr/bin/env node
/**
 * W15 independent, read-only RYTHM public availability probe.
 * Designed for a GitHub-hosted runner, not any RYTHM/Vercel runtime.
 * Single observations are NOT a 30-day availability/SLA measurement.
 */
import { mkdir, writeFile } from "node:fs/promises";

export const TARGETS = Object.freeze([
  { path: "/", label: "homepage", expected: null },
  { path: "/api/status", label: "public_status", expected: "operational" },
  { path: "/api/health", label: "runtime_health", expected: "ok" },
]);

export async function probeTarget(target, opts = {}) {
  const fetcher = opts.fetcher ?? fetch;
  const origin = opts.origin ?? "https://rythm-os.com";
  // Restrict caller-supplied origins; do not allow credentials, internal hosts or non-HTTPS probes.
  if (origin !== "https://rythm-os.com") throw new Error("invalid_origin");
  const now = opts.now ?? (() => Date.now());
  const attempts = opts.attempts ?? 2;
  const pause = opts.pause ?? (ms => new Promise(resolve => setTimeout(resolve, ms)));
  let last = null;
  for (let i = 0; i < attempts; i++) {
    const start = now();
    let httpStatus = null;
    let outcome = "network_error";
    try {
      const response = await fetcher(origin + target.path, {
        method: "GET",
        headers: { Accept: target.expected ? "application/json" : "text/html,application/xhtml+xml" },
        redirect: "manual",
        cache: "no-store",
        signal: AbortSignal.timeout(10000),
      });
      httpStatus = response.status;
      if (response.status === 200) {
        if (!target.expected) {
          outcome = "pass";
        } else {
          try {
            const payload = await response.json();
            outcome = payload && typeof payload === "object" &&
              payload.status === target.expected ? "pass" : "unexpected_health_status";
          } catch {
            outcome = "invalid_json";
          }
        }
      } else {
        outcome = response.status >= 300 && response.status <= 399 ? "unexpected_redirect" : "http_status";
      }
    } catch {
      // Do not print exception messages: they can include URL tokens, headers or user paths.
      outcome = "network_error";
    }
    last = {
      name: target.label, path: target.path, outcome,
      httpStatus, durationMs: Math.max(0, Math.round(now() - start)),
      attempts: i + 1,
    };
    if (last.outcome === "pass") return last;
    if (i + 1 < attempts) await pause(1500);
  }
  return last;
}

export async function probeAll(opts = {}) {
  const results = [];
  for (const t of TARGETS) results.push(await probeTarget(t, opts));
  return {
    schema: "rythm_w15_external_probe_v1",
    checkedAt: new Date().toISOString(),
    origin: "https://rythm-os.com",
    source: "external_git_runner",
    overall: results.every(r => r.outcome === "pass") ? "pass" : "fail",
    results,
    limitations: "HTTP shell/status/configuration checks; no full database transaction, scheduler progress, 30-day denominator or contractual SLA.",
  };
}

if (process.argv[1] && import.meta.url === new URL("file://" + process.argv[1]).href) {
  const report = await probeAll();
  await mkdir("test-results", { recursive: true });
  await writeFile("test-results/w15-external-probe.json", JSON.stringify(report, null, 2) + "\n");
  console.log(JSON.stringify({ event: "rythm_w15_external_probe", checkedAt: report.checkedAt,
    overall: report.overall, results: report.results.map(r => ({ name: r.name, outcome: r.outcome, httpStatus: r.httpStatus, attempts: r.attempts })) }));
  if (report.overall !== "pass") process.exitCode = 1;
}
