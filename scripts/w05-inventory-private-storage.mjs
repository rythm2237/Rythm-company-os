// W05 inventory: source-level search for sensitive Storage operations.
// Review every match before disabling direct authenticated downloads.
import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

const ROOTS = ["app", "components", "lib", "scripts"];
const extensions = new Set([".ts", ".tsx", ".js", ".jsx", ".mjs"]);
const sensitive = /agent-artifacts|agent-attachments|company-knowledge|project-files|ai-workspace-private|(?:storage\s*\.\s*from\s*\()|storage\/v1\/object|createSignedUrls?/;
const call = /agent-artifacts|agent-attachments|company-knowledge|project-files|ai-workspace-private|storage\s*\.\s*from\s*\(|createSignedUrls?\s*\(|\.download\s*\(|storage\/v1\/object/;
const findings = [];
function walk(dir) {
  let names;
  try { names = readdirSync(dir, { withFileTypes: true }); } catch { return; }
  for (const entry of names) {
    if (entry.name === "node_modules" || entry.name === ".next" || entry.name === ".git") continue;
    const full = join(dir, entry.name);
    if (entry.isDirectory()) { walk(full); continue; }
    if (!entry.isFile() || !extensions.has(entry.name.slice(entry.name.lastIndexOf(".")))) continue;
    const source = readFileSync(full, "utf8");
    if (!sensitive.test(source)) continue;
    const lines = source.split(/\r?\n/);
    for (let i = 0; i < lines.length; i++) {
      if (!call.test(lines[i])) continue;
      findings.push({ file: relative(".", full).replaceAll("\\", "/"), line: i + 1, excerpt: lines[i].trim().slice(0, 200) });
    }
  }
}
for (const root of ROOTS) walk(root);
findings.sort((a, b) => a.file.localeCompare(b.file) || a.line - b.line);
console.log("W05 sensitive Storage source inventory (" + findings.length + " matches):");
for (const row of findings) console.log(JSON.stringify(row));
