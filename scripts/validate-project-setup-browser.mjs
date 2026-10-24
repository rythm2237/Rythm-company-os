import assert from "node:assert/strict";
import { createServer } from "node:http";
import { readFileSync, mkdirSync } from "node:fs";
import { build } from "esbuild";
import { chromium } from "playwright";
const bundle = await build({ entryPoints: ["scripts/fixtures/project-setup-browser.tsx"], bundle: true, write: false, format: "iife", jsx: "automatic", define: { "process.env.NODE_ENV": '"production"' } });
const css = readFileSync("app/globals.css", "utf8");
const submissions = [];
const server = createServer(async (request, response) => {
  if (request.url === "/bundle.js") { response.setHeader("Content-Type", "application/javascript"); response.end(bundle.outputFiles[0].text); return; }
  if (request.url === "/api/projects/intake") { response.writeHead(503, { "Content-Type": "application/json" }); response.end('{"error":"Provider unavailable"}'); return; }
  if (request.url.startsWith("/api/projects/assignment")) { response.setHeader("Content-Type", "application/json"); response.end(JSON.stringify({ candidates: [{ agentId: "lead", name: "UX Specialist", role: "Experience design", skills: ["user experience", "research"], specializations: ["software"], eligible: true, blockers: [], score: 80, reason: "Relevant listed skills and schedulable capacity.", capacity: { availablePercent: 75, runningTasks: 0, queuedTasks: 1 }, evidence: { skills: "declared" } }, { agentId: "busy", name: "Busy Specialist", role: "Architecture", skills: ["engineering"], specializations: [], eligible: false, blockers: ["Capacity exhausted"], score: null, reason: "Capacity exhausted", capacity: { availablePercent: 0, runningTasks: 2, queuedTasks: 3 }, evidence: { skills: "declared" } }] })); return; }
  if (request.url === "/create") { let body = ""; for await (const chunk of request) body += chunk; submissions.push(JSON.parse(body)); response.end("{}"); return; }
  response.setHeader("Content-Type", "text/html"); response.end(`<!doctype html><html lang="en"><head><meta name="viewport" content="width=device-width, initial-scale=1"><title>Project setup component QA</title><style>${css}</style></head><body><div id="root"></div><script src="/bundle.js"></script></body></html>`);
});
await new Promise(resolve => server.listen(0, "127.0.0.1", resolve));
const origin = `http://127.0.0.1:${server.address().port}`;
let browser;
let page;
const errors = [];
try {
  browser = await chromium.launch({ headless: true, executablePath: process.env.RYTHM_BROWSER_EXECUTABLE || undefined, args: ["--no-sandbox", "--disable-dev-shm-usage", "--disable-gpu"], channel: process.env.CRM_BROWSER_CHANNEL || undefined });
  page = await browser.newPage(); page.on("pageerror", error => errors.push(error.message));
  mkdirSync("test-results/project-setup", { recursive: true });
  for (const [name, width, height] of [["desktop", 1440, 1000], ["tablet", 768, 1024], ["mobile", 390, 844]]) {
    await page.setViewportSize({ width, height }); await page.goto(origin + "?reset=" + name);
    await page.getByRole("button", { name: "Next", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "at least 3" }).waitFor();
    await page.getByLabel("Problem, goal or desired outcome").fill("Review the website UI for every page and provide new designing recommendation for them.");
    await page.getByRole("button", { name: "Next", exact: true }).click();
    assert.equal(await page.getByLabel("Project name", { exact: true }).inputValue(), "Website UI/UX Audit & Redesign Recommendations");
    await page.getByText("A website URL is needed before pages can be reviewed.", { exact: false }).waitFor();
    await page.getByLabel("Customer", { exact: true }).selectOption("customer");
    assert.equal(await page.getByLabel("Website · needed for page review", { exact: true }).inputValue(), "https://restaurant.example");
    await page.getByLabel("Project name", { exact: true }).fill("Application UX Review"); await page.reload();
    assert.equal(await page.getByLabel("Project name", { exact: true }).inputValue(), "Application UX Review");
    await page.getByRole("button", { name: "Next", exact: true }).click(); await page.getByText("UX Specialist", { exact: true }).waitFor();
    await page.getByLabel("AI project lead", { exact: true }).selectOption("manual");
    assert.equal(await page.locator('input[value="busy"]').isDisabled(), true);
    await page.getByRole("button", { name: "Next", exact: true }).click(); await page.getByRole("alert").filter({ hasText: "eligible specialist" }).waitFor();
    await page.locator('input[value="lead"]').check(); await page.getByRole("button", { name: "Next", exact: true }).click();
    await page.getByRole("heading", { name: "Review & begin", exact: true }).waitFor();
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1), true, `${name}: no horizontal overflow`);
    await page.screenshot({ path: `test-results/project-setup/${name}.png`, fullPage: true });
    await page.getByRole("button", { name: "Create & open discovery", exact: true }).click(); await page.waitForFunction(() => document.body.dataset.created === "true");
    const latest = submissions.at(-1); assert.equal(latest.name, "Application UX Review"); assert.equal(latest.customerId, "customer"); assert.equal(latest.assignmentMode, "manual"); assert.equal(latest.leadAgentId, "lead"); assert.equal(latest.primaryManager, "11111111-1111-4111-8111-111111111111"); assert.equal(latest.website, "https://restaurant.example");
  }
  assert.deepEqual(errors, []);
  console.log("Project setup browser component QA passed: desktop/tablet/mobile, provider fallback, validation, CRM resource reuse, draft reload, manual eligibility and final submission. These are component fixtures, not production/API end-to-end verification.");
} catch(error) {console.error("Browser page errors:", errors);if(page)await page.screenshot({path:"test-results/project-setup/failure.png",fullPage:true});throw error;} finally { if (browser) await browser.close(); await new Promise(resolve => server.close(resolve)); }
