import assert from "node:assert/strict";
import { readFileSync } from "node:fs";

// Cover all privileged OAuth callback entrypoints and their server-action
// companions. Raw provider, token exchange or database exceptions must NEVER
// be reflected in redirect URLs or persisted as last_error_message.
const callbacks = [
  "bing-webmaster", "google-ads", "google-analytics",
  "google-business-profile", "google-drive", "google-search-console",
  "google-workspace", "linkedin-marketing", "microsoft-365", "youtube",
];
const actions = [
  "app/(app)/integrations/actions.ts",
  "app/(app)/integrations/connection-agent-actions.ts",
  "app/(app)/integrations/customer-actions.ts",
];
const files = callbacks.map(name => `app/api/integrations/${name}/callback/route.ts`).concat(actions);
for (const path of files) {
  const source = readFileSync(path, "utf8");
  assert.doesNotMatch(source, /\$\{providerError(?:Description)?\}/, path + " must not reflect OAuth provider error params");
  assert.doesNotMatch(source, /\$\{providerErrorDescription\s*\|\|\s*providerError\}/, path + " must not reflect error_description");
  assert.doesNotMatch(source, /\$\{[\w.]*error\.message\}/i, path + " must not interpolate SQL errors");
  assert.doesNotMatch(source, /\b(?:error|update|updated|vaultError|stored|secretError|scopeError)\??\.message\b/, path + " raw error in output/DB");
  assert.doesNotMatch(source, /\b\w+\s+instanceof\s+Error\s*\?\s*\w+\.message/, path + " must classify errors into fixed labels");
  assert.doesNotMatch(source, /last_error_message:\s*(?:diagnostic|error\.message)\b/, path + " must not persist uncontrolled diagnostic");
}
const integrationActions = readFileSync("app/(app)/integrations/actions.ts", "utf8");
assert.doesNotMatch(integrationActions, /fail\((?:error|scopeError|secretError)\??\.message\)/);
const connectionActions = readFileSync("app/(app)/integrations/connection-agent-actions.ts", "utf8");
assert.doesNotMatch(connectionActions, /setupUrl\([^;]*\.message/);
const customerActions = readFileSync("app/(app)/integrations/customer-actions.ts", "utf8");
assert.match(customerActions,/last_error_code:"verification_failed"/);
assert.match(customerActions,/last_error_message:message/);
assert.match(customerActions,/const message="Provider verification failed\."/);
console.log(`PASS W06 OAuth error redaction: ${callbacks.length} provider callbacks + ${actions.length} server action modules, zero raw exception reflection/persistence patterns.`);
