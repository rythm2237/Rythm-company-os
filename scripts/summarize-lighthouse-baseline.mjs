import fs from "node:fs";
import path from "node:path";

const REPORT_DIR = path.resolve(process.argv[2] ?? "reports/lighthouse");
const STRATEGIES = ["mobile", "desktop"];

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function metric(report, id) {
  const value = report?.audits?.[id]?.numericValue;
  return Number.isFinite(value) ? value : null;
}

function score(report) {
  const value = report?.categories?.performance?.score;
  return Number.isFinite(value) ? value * 100 : null;
}

function round(value, digits = 0) {
  if (value == null) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

const summary = {
  generatedAt: new Date().toISOString(),
  source: "Lighthouse CLI on GitHub Actions against https://rythm-os.com",
  runsPerStrategy: 3,
  strategies: {},
};

for (const strategy of STRATEGIES) {
  const files = fs
    .readdirSync(REPORT_DIR)
    .filter((name) => name.startsWith(`${strategy}-`) && name.endsWith(".json"))
    .sort();

  if (files.length !== 3) {
    throw new Error(`Expected 3 ${strategy} reports, found ${files.length}`);
  }

  const reports = files.map((name) => JSON.parse(fs.readFileSync(path.join(REPORT_DIR, name), "utf8")));
  const scores = reports.map(score);
  const fcp = reports.map((report) => metric(report, "first-contentful-paint"));
  const lcp = reports.map((report) => metric(report, "largest-contentful-paint"));
  const si = reports.map((report) => metric(report, "speed-index"));
  const tbt = reports.map((report) => metric(report, "total-blocking-time"));
  const cls = reports.map((report) => metric(report, "cumulative-layout-shift"));

  const vectors = { scores, fcp, lcp, si, tbt, cls };
  for (const [name, values] of Object.entries(vectors)) {
    if (values.some((value) => value == null)) {
      throw new Error(`Missing ${name} metric in ${strategy} Lighthouse output`);
    }
  }

  summary.strategies[strategy] = {
    performanceScore: round(median(scores)),
    fcpMs: round(median(fcp)),
    lcpMs: round(median(lcp)),
    speedIndexMs: round(median(si)),
    tbtMs: round(median(tbt)),
    cls: round(median(cls), 3),
    rawPerformanceScores: scores.map((value) => round(value)),
  };
}

const outputPath = path.join(REPORT_DIR, "baseline-summary.json");
fs.writeFileSync(outputPath, `${JSON.stringify(summary, null, 2)}\n`);

console.log("RYTHM Production Lighthouse baseline");
console.log(JSON.stringify(summary, null, 2));
