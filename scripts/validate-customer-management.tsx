/* Integration checks for server pages and shared account/lifecycle UI.
   Database authorization and transactions are exercised by the companion SQL suite. */
import assert from "node:assert/strict";
import Module from "node:module";
import React from "react";
import { renderToStaticMarkup } from "react-dom/server";

(globalThis as typeof globalThis & { React: typeof React }).React = React;
let allowed = true;
let reads = 0;
const inventory = { total: 1, items: [{ id: "11111111-1111-4111-8111-111111111111", name: "Acme <script>", status: "approved", owner_name: "Jane", owner_email: "jane@example.invalid", user_count: 2, agent_count: 3, active_agent_count: 1, integration_count: 0, created_at: "2026-09-26T00:00:00Z", last_activity: null }] };
const fakeContext = { supabase: { rpc: async () => { reads++; return { data: inventory, error: null }; } } };
// Confine auth/framework mocking to this standalone test process.
const loader = Module as unknown as { _load: (id: string, ...args: unknown[]) => unknown };
const original = loader._load;
loader._load = function(id, ...args) {
  if (id === "server-only") return {};
  if (id === "next/navigation") return { usePathname: () => "/admin/customers" };
  if (id.includes("/lib/admin/authorization")) return { getPlatformAdminContext: async () => allowed ? fakeContext : null, requirePlatformAdmin: async () => { if (!allowed) throw new Error("PLATFORM_ADMIN_REQUIRED"); return fakeContext; } };
  if (id.includes("organization-context/actions")) return { switchOrganization: async () => undefined };
  if (id.includes("app-shell/actions")) return { logout: async () => undefined };
  if (id.includes("studio/agents/actions")) return { setAgentStatus: async () => undefined };
  return original.call(this, id, ...args);
};
async function main() {
  const { default: Customers } = await import("../app/(app)/admin/customers/page");
  let html = renderToStaticMarkup(await Customers({ searchParams: Promise.resolve({}) }));
  assert.match(html, /Acme &lt;script&gt;/);
  assert.match(html, /2 active users/);
  assert.match(html, /3 agents/);
  assert.match(html, /Not recorded/);
  assert.match(html, /aria-label="Customer pages"/);
  const before = reads;
  allowed = false;
  assert.equal(await Customers({ searchParams: Promise.resolve({}) }), null);
  assert.equal(reads, before, "Unauthorized page must not query customer inventory");
  const { listCustomers } = await import("../lib/admin/customers");
  await assert.rejects(listCustomers({ search: "", status: "", sort: "name", page: 1 }), /PLATFORM_ADMIN_REQUIRED/);
  const { default: Nav } = await import("../components/product-nav/ProductNav");
  html = renderToStaticMarkup(<Nav access={{ active: true, agentStudio: true, templates: false, companyBuilder: false, companyLaunch: false, platformAdmin: false }} organization={{ activeOrganizationId: "org-a", activeOrganizationName: "Acme", activeRole: "owner", userName: "Jane Smith", organizations: [{ id: "org-a", name: "Acme", role: "owner" }, { id: "org-b", name: "Other Company", role: "viewer" }] }}/>);
  assert.match(html, /Jane Smith/); assert.match(html, /Acme/); assert.match(html, /Other Company/);
  assert.doesNotMatch(html, /href="\/admin\/customers"/);
  const { default: Lifecycle } = await import("../components/agents/AgentLifecycleActions");
  html = renderToStaticMarkup(<Lifecycle agentId="agent-a" name="Analyst" status="archived" canArchive organizationId="org-a"/>);
  assert.match(html, /Restore as Disabled/); assert.doesNotMatch(html, />Enable</); assert.match(html, /name="organizationId" value="org-a"/);
  html = renderToStaticMarkup(<Lifecycle agentId="agent-a" name="Analyst" status="enabled" canArchive organizationId="org-a"/>);
  assert.match(html, />Disable</); assert.match(html, />Archive</);
  console.log("PASS customer server authorization, real count rendering, escaped text, unknown data, account identity, company choices and lifecycle controls");
}
main().finally(() => { loader._load = original; }).catch(error => { console.error(error); process.exitCode = 1; });
