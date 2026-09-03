import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const promptsPath = path.join(root, "data/seo/answer-engine-prompts.json");
const logPath = path.join(root, "data/seo/answer-engine-benchmark.csv");

const requiredHeaders = [
  "wave_id",
  "run_id",
  "observed_at_utc",
  "engine",
  "surface",
  "model_label",
  "locale",
  "country",
  "session_state",
  "prompt_id",
  "prompt_text",
  "run_status",
  "rythm_mentioned",
  "mention_text",
  "mention_order",
  "citation_present",
  "citation_url",
  "citation_domain",
  "evidence_ref",
  "notes",
];

function parseCsvLine(line) {
  const cells = [];
  let value = "";
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (ch === '"') {
      if (quoted && line[i + 1] === '"') {
        value += '"';
        i += 1;
      } else {
        quoted = !quoted;
      }
    } else if (ch === "," && !quoted) {
      cells.push(value);
      value = "";
    } else {
      value += ch;
    }
  }
  if (quoted) throw new Error("Unterminated quoted CSV field");
  cells.push(value);
  return cells;
}

const promptConfig = JSON.parse(fs.readFileSync(promptsPath, "utf8"));
if (!promptConfig.benchmark_version || !Array.isArray(promptConfig.prompts) || promptConfig.prompts.length === 0) {
  throw new Error("Prompt config must contain benchmark_version and a non-empty prompts array");
}

const promptById = new Map();
for (const prompt of promptConfig.prompts) {
  if (!prompt.id || !prompt.text || promptById.has(prompt.id)) {
    throw new Error(`Invalid or duplicate prompt definition: ${prompt.id ?? "unknown"}`);
  }
  promptById.set(prompt.id, prompt.text);
}

const lines = fs.readFileSync(logPath, "utf8").split(/\r?\n/).filter((line, index) => index === 0 || line.trim() !== "");
if (!lines.length) throw new Error("Benchmark CSV is empty");
const headers = parseCsvLine(lines[0]);
if (headers.join("|") !== requiredHeaders.join("|")) {
  throw new Error(`Unexpected CSV headers. Expected: ${requiredHeaders.join(",")}`);
}

const allowedRunStatus = new Set(["completed", "blocked", "unavailable", "not_run"]);
const allowedMention = new Set(["yes", "no", "na"]);
const allowedCitation = new Set(["yes", "no", "na"]);
const allowedSessionState = new Set(["signed_out", "signed_in", "private", "unknown"]);
const runIds = new Set();

for (let index = 1; index < lines.length; index += 1) {
  const rowNumber = index + 1;
  const cells = parseCsvLine(lines[index]);
  if (cells.length !== headers.length) throw new Error(`Row ${rowNumber}: expected ${headers.length} fields, got ${cells.length}`);
  const row = Object.fromEntries(headers.map((header, i) => [header, cells[i].trim()]));

  for (const field of ["wave_id", "run_id", "engine", "model_label", "locale", "session_state", "prompt_id", "prompt_text", "run_status"]) {
    if (!row[field]) throw new Error(`Row ${rowNumber}: missing required field ${field}`);
  }
  if (runIds.has(row.run_id)) throw new Error(`Row ${rowNumber}: duplicate run_id ${row.run_id}`);
  runIds.add(row.run_id);

  if (!allowedRunStatus.has(row.run_status)) throw new Error(`Row ${rowNumber}: invalid run_status ${row.run_status}`);
  if (!allowedSessionState.has(row.session_state)) throw new Error(`Row ${rowNumber}: invalid session_state ${row.session_state}`);
  if (!allowedMention.has(row.rythm_mentioned)) throw new Error(`Row ${rowNumber}: invalid rythm_mentioned ${row.rythm_mentioned}`);
  if (!allowedCitation.has(row.citation_present)) throw new Error(`Row ${rowNumber}: invalid citation_present ${row.citation_present}`);

  const fixedPrompt = promptById.get(row.prompt_id);
  if (!fixedPrompt) throw new Error(`Row ${rowNumber}: unknown prompt_id ${row.prompt_id}`);
  if (row.prompt_text !== fixedPrompt) throw new Error(`Row ${rowNumber}: prompt_text does not match fixed prompt ${row.prompt_id}`);

  if (row.observed_at_utc && Number.isNaN(Date.parse(row.observed_at_utc))) {
    throw new Error(`Row ${rowNumber}: observed_at_utc is not a parseable timestamp`);
  }

  if (row.run_status === "completed") {
    if (!row.observed_at_utc) throw new Error(`Row ${rowNumber}: completed run requires observed_at_utc`);
    if (row.rythm_mentioned === "na" || row.citation_present === "na") {
      throw new Error(`Row ${rowNumber}: completed run requires yes/no mention and citation fields`);
    }
  } else if (row.rythm_mentioned !== "na" || row.citation_present !== "na") {
    throw new Error(`Row ${rowNumber}: non-completed run must use na for mention and citation`);
  }

  if (row.rythm_mentioned === "yes" && !row.evidence_ref) {
    throw new Error(`Row ${rowNumber}: positive RYTHM mention requires evidence_ref`);
  }
  if (row.citation_present === "yes") {
    if (!row.evidence_ref) throw new Error(`Row ${rowNumber}: positive citation requires evidence_ref`);
    if (!row.citation_url || !row.citation_domain) throw new Error(`Row ${rowNumber}: positive citation requires citation_url and citation_domain`);
    let citation;
    try {
      citation = new URL(row.citation_url);
    } catch {
      throw new Error(`Row ${rowNumber}: citation_url is invalid`);
    }
    if (citation.hostname.toLowerCase() !== row.citation_domain.toLowerCase()) {
      throw new Error(`Row ${rowNumber}: citation_domain does not match citation_url hostname`);
    }
  }
  if (row.citation_present === "no" && (row.citation_url || row.citation_domain)) {
    throw new Error(`Row ${rowNumber}: citation URL/domain must be blank when citation_present=no`);
  }
}

console.log(`Answer-engine benchmark validation passed: ${promptById.size} fixed prompts, ${lines.length - 1} logged runs.`);
