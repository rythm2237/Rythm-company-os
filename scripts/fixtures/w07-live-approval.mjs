import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { chromium } from "playwright";

export async function verifyW07Approval({ b, clients, cookies, admin, http, record, unwrap, api, canary }) {
  const [company, foreignCompany] = b.companies;
  const actor = company.key + "_owner";
  const foreign = foreignCompany.key + "_owner";
  const integrationId = randomUUID();
  const tool = "internal.validation";
  const capability = "validation.record.create";
  const browser = await chromium.launch();
  try {
    unwrap(await admin.from("organization_integrations").insert({
      id: integrationId, organization_id: company.id, provider_key: "internal",
      display_name: "W07 synthetic internal validation", status: "connected", enabled: true, granted_scopes: [],
    }), "W07 fixture integration");
    // The Next development process and the database's default claim environment
    // must both authorize this internal tool, solely for the disposable company.
    unwrap(await admin.from("execution_rollout_config").insert(["development", "production"].map((environment) => ({
      organization_id: company.id, integration_key: "internal", tool_id: tool, environment,
      execution_mode: "limited_enforced", kill_switch: false,
      updated_by_user_id: clients.get(actor).user.id, reason: "W07 synthetic approval verification",
    }))), "W07 fixture rollout");
    const created = await http(actor, "/api/executions", {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ integrationId, toolId: tool, capabilityKey: capability, input: { marker: "W07 synthetic record" } }),
    });
    record("w07-approval", "proposal-awaits-approval", actor, company.key, created.status === 202, "status-" + created.status);
    const proposal = await created.json();
    assert.ok(proposal.id && proposal.approval_request_id);
    const execute = (who) => http(who, "/api/executions/" + proposal.id, {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify({ action: "execute" }),
    });
    const attempt = async (who, expected, operation) => {
      const response = await execute(who);
      const body = await response.text();
      record("w07-approval", operation, who, company.key,
        response.status === expected && !body.includes(canary), "status-" + response.status);
      return JSON.parse(body);
    };
    await attempt(foreign, 404, "foreign-organization-denied");
    await attempt(actor, 409, "pending-approval-denied");

    const context = await browser.newContext();
    await context.addCookies(cookies.get(actor).split("; ").map((entry) => {
      const split = entry.indexOf("=");
      return { name: entry.slice(0, split), value: entry.slice(split + 1), url: api };
    }));
    const page = await context.newPage();
    await page.goto(api + "/approvals?approval=" + proposal.approval_request_id);
    await page.getByRole("textbox", { name: "CEO response note" }).fill(canary);
    await page.getByRole("button", { name: "Approve request", exact: true }).click();
    await page.getByRole("button", { name: "Approve request", exact: true }).waitFor({ state: "hidden" });
    const approval = unwrap(await admin.from("approval_requests").select("status,approver_user_id")
      .eq("organization_id", company.id).eq("id", proposal.approval_request_id).single(), "W07 approval result");
    record("w07-approval", "owner-approved-through-ui", actor, company.key,
      approval.status === "approved" && approval.approver_user_id === clients.get(actor).user.id);

    const result = await attempt(actor, 200, "approved-worker-executed");
    record("w07-approval", "internal-record-verified", actor, company.key,
      result.ok === true && result.verification?.status === "verified");
    await attempt(actor, 409, "approval-cannot-be-reused");
    const audit = unwrap(await admin.from("audit_events").select("payload")
      .eq("organization_id", company.id).eq("object_id", proposal.approval_request_id)
      .eq("event_type", "approval.approved"), "W07 approval audit");
    record("w07-approval", "approval-audit-excludes-note", actor, company.key,
      audit.length > 0 && !JSON.stringify(audit).includes(canary));
  } finally {
    await browser.close();
    const rolloutCleanup = await admin.from("execution_rollout_config").delete()
      .eq("organization_id", company.id).eq("tool_id", tool)
      .eq("reason", "W07 synthetic approval verification");
    const integrationCleanup = await admin.from("organization_integrations")
      .update({ enabled: false, status: "disconnected" })
      .eq("organization_id", company.id).eq("id", integrationId);
    assert.ok(!rolloutCleanup.error && !integrationCleanup.error, "W07 synthetic controls could not be quarantined");
  }
}
