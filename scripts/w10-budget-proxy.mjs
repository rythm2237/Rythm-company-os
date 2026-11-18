import { createServer } from "node:http";
import { writeFileSync, mkdirSync } from "node:fs";
const key = process.env.W10_PROVIDER_KEY;
if (!key?.startsWith("sk-")) throw Error("W10 provider credential unavailable");
const ceiling = 0.25;
let reserved = 0, actual = 0, calls = 0;
const outcomes = [];
mkdirSync("test-results", { recursive: true });
function evidence() {
  writeFileSync("test-results/w10-budget.json", JSON.stringify({ ceiling, reserved, actual, calls, outcomes, model: "gpt-4.1-mini" }, null, 2));
}
evidence();
const server = createServer(async (req, res) => {
  try {
    if (req.url === "/health") { res.end("ready"); return; }
    if (req.method !== "POST" || !["/v1/responses", "/v1/chat/completions"].includes(req.url)) throw Error("Unsupported provider operation");
    let raw = "";
    for await (const chunk of req) {
      raw += chunk;
      if (Buffer.byteLength(raw) > 120000) throw Error("Input limit");
    }
    const input = JSON.parse(raw);
    if (input.model !== "gpt-4.1-mini" || input.stream || input.tools?.length || (input.n ?? 1) !== 1) throw Error("Model or operation outside budget contract");
    const messages = input.input ?? input.messages;
    const textContent = content => typeof content === "string" || (Array.isArray(content) && content.every(part => ["text", "input_text", "output_text"].includes(part?.type) && typeof part.text === "string"));
    if (!(typeof messages === "string" || (Array.isArray(messages) && messages.every(message => ["system", "developer", "user", "assistant"].includes(message?.role) && textContent(message.content))))) throw Error("Only text requests are budgeted");
    const output = Number(input.max_output_tokens ?? input.max_completion_tokens ?? input.max_tokens);
    if (!Number.isInteger(output) || output < 1 || output > 16000) throw Error("Missing output bound");
    // Text-only requests have at most one token per UTF-8 byte. Include a
    // framing allowance and reserve the entire maximum output before dispatch.
    const bound = (Buffer.byteLength(raw) + 4096) * 0.40 / 1e6 + output * 1.60 / 1e6;
    if (reserved + bound > ceiling) throw Error("W10 approved test budget exhausted");
    reserved += bound;
    calls++;
    evidence();
    console.log("W10 reserved USD " + reserved.toFixed(6) + ", request " + calls);
    const response = await fetch("https://api.openai.com" + req.url, {
      method: "POST",
      headers: { Authorization: "Bearer " + key, "Content-Type": "application/json" },
      body: raw,
      signal: AbortSignal.timeout(120000),
    });
    const body = await response.text();
    let parsed = {};
    try { parsed = JSON.parse(body); } catch {}
    const safeCode = value => typeof value === "string" && /^[a-z_]{1,64}$/.test(value) ? value : null;
    const outcome = { status: response.status, code: safeCode(parsed.error?.code), type: safeCode(parsed.error?.type), parameter: safeCode(parsed.error?.param) };
    outcomes.push(outcome);
    console.log("W10 provider response " + JSON.stringify(outcome));
    if (response.ok) {
      const usage = parsed.usage ?? {};
      actual += Number(usage.input_tokens ?? usage.prompt_tokens ?? 0) * 0.40 / 1e6
        + Number(usage.output_tokens ?? usage.completion_tokens ?? 0) * 1.60 / 1e6;
    }
    evidence();
    res.writeHead(response.status, { "Content-Type": "application/json" });
    res.end(body);
  } catch {
    res.writeHead(429, { "Content-Type": "application/json" });
    res.end(JSON.stringify({ error: { message: "W10 provider operation rejected or unavailable" } }));
  }
});
server.listen(3199, "127.0.0.1", () => console.log("W10 budget proxy ready"));
