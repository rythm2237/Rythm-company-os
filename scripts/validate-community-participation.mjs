import fs from "node:fs";
import path from "node:path";

const root = process.cwd();
const targetsPath = path.join(root, "data/seo/community-targets.json");
const registerPath = path.join(root, "data/seo/community-participation.csv");

const fail = (message) => {
  console.error(`P2-12 validation failed: ${message}`);
  process.exit(1);
};

const targets = JSON.parse(fs.readFileSync(targetsPath, "utf8"));
if (!targets.version || !targets.reviewed_on || !Array.isArray(targets.targets)) {
  fail("community target register is missing required metadata");
}
if (targets.targets.length < 5) fail("expected at least five community targets");

const hn = targets.targets.find((target) => target.platform === "Hacker News");
if (!hn || hn.ai_generated_text_prohibited_for_final_submission !== true) {
  fail("Hacker News target must preserve the no-AI-generated-final-text guardrail");
}

for (const target of targets.targets) {
  if (!target.platform || !target.community || !target.priority || !target.mode) {
    fail("every target requires platform, community, priority and mode");
  }
  if (target.rules_check_required !== true) {
    fail(`rules_check_required must be true for ${target.platform}/${target.community}`);
  }
}

const lines = fs.readFileSync(registerPath, "utf8").trimEnd().split(/\r?\n/);
const expectedHeader = "platform,community,contribution_url,published_date,contribution_type,topic,rythm_mentioned,affiliation_disclosed,rythm_link_included,visible_engagement,evidence_note";
if (lines[0] !== expectedHeader) fail("community participation CSV header changed unexpectedly");

const allowedTypes = new Set(["comment", "post", "answer", "discussion"]);
const booleanValues = new Set(["true", "false"]);

for (const [index, line] of lines.slice(1).entries()) {
  if (!line.trim()) continue;
  const cells = line.split(",");
  if (cells.length !== 11) fail(`row ${index + 2} must contain exactly 11 comma-safe fields`);
  const [platform, community, url, date, type, topic, mentioned, disclosed, linkIncluded] = cells;
  if (!platform || !community || !topic) fail(`row ${index + 2} is missing required identity fields`);
  if (!/^https:\/\//.test(url)) fail(`row ${index + 2} requires a live public https URL`);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(date)) fail(`row ${index + 2} requires YYYY-MM-DD published_date`);
  if (!allowedTypes.has(type)) fail(`row ${index + 2} has unsupported contribution_type`);
  for (const [field, value] of [["rythm_mentioned", mentioned], ["affiliation_disclosed", disclosed], ["rythm_link_included", linkIncluded]]) {
    if (!booleanValues.has(value)) fail(`row ${index + 2} ${field} must be true or false`);
  }
  if (mentioned === "true" && disclosed !== "true") {
    fail(`row ${index + 2} mentions RYTHM without affiliation disclosure`);
  }
}

console.log(`P2-12 community participation evidence valid: ${Math.max(lines.length - 1, 0)} published contribution row(s).`);
