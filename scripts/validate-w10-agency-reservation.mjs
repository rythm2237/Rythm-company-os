import assert from "node:assert/strict";
import { mkdirSync } from "node:fs";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";

mkdirSync("test-results", { recursive: true });
const app = "http://localhost:3000";
const backend = "http://127.0.0.1:54321";
const template = "ready_ai_advertising_agency_v1";
const selection = "?product=ready_company&template=" + template;
assert.equal(process.env.NEXT_PUBLIC_SUPABASE_URL, backend);
assert.ok(process.env.W10_LOCAL_SERVICE_KEY, "Disposable Auth service credential is required");

const publicKey = process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY;
assert.ok(publicKey, "Disposable Auth public credential is required");
const admin = createClient(backend, process.env.W10_LOCAL_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function result(response, label) {
  assert.ok(!response.error, label + ": " + (response.error?.code ?? response.error?.status ?? ""));
  return response.data;
}

const mail = "http://127.0.0.1:54324";
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function mailLink(email,type){
 for(let i=0;i<40;i++){
  const data=await (await fetch(mail+"/api/v1/messages")).json();
  for(const m of data.messages??[]){
   if(!(m.To??[]).some(a=>a.Address===email))continue;
   const item=await (await fetch(mail+"/api/v1/message/"+encodeURIComponent(m.ID))).json();
   for(const match of (item.HTML??"").matchAll(/href=["']([^"']+)["']/gi)){
    let u;try{u=new URL(match[1].replaceAll("&amp;","&"));}catch{continue;}
    if(u.pathname!=="/auth/v1/verify"||u.searchParams.get("type")!==type)continue;
    assert.ok(["localhost","127.0.0.1"].includes(u.hostname),"mail link must be local");
    assert.equal(u.port,"54321");
    const dest=new URL(u.searchParams.get("redirect_to"));
    assert.equal(dest.origin,app);
    return u.href;
   }
  }
  await delay(500);
 }
 throw Error("Missing local "+type+" message");
}

async function login(page, email, password) {
  const next = "/setup/company" + selection;
  await page.goto(app + "/login?force=1&next=" + encodeURIComponent(next));
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(url => ["/setup/company", "/activation", "/studio/templates"].includes(url.pathname));
}

const operatorEmail = "w10-billing-" + randomUUID() + "@example.com";
const operatorPassword = randomUUID() + "Aa1!";
const operator = result(await admin.auth.admin.createUser({
  email: operatorEmail, password: operatorPassword, email_confirm: true,
}), "Create disposable billing operator").user;
result(await admin.from("platform_admins").insert({ user_id: operator.id }), "Set disposable billing operator role");
const billing = createClient(backend, publicKey, {
  auth: { persistSession: false, autoRefreshToken: false },
});
result(await billing.auth.signInWithPassword({ email: operatorEmail, password: operatorPassword }), "Sign in as billing operator");
assert.equal(result(await billing.rpc("is_platform_admin"), "Read billing identity role"), true);

const isolatedOrganizations = [];
const browser = await chromium.launch();

async function localContext(options) {
  const context = await browser.newContext(options);
  await context.route("**/*", route => {
    const { origin } = new URL(route.request().url());
    return origin === app || origin === backend ? route.continue() : route.abort();
  });
  return context;
}
try {
  for (const [profile, options] of [
    ["desktop", { viewport: { width: 1440, height: 900 } }],
    ["mobile", devices["Pixel 7"]],
  ]) {
    const id = randomUUID();
    const email = "w10-" + id + "@example.com";
    const name = "W10 Agency " + id;
    const password = randomUUID() + "Aa1!";
    const first = await localContext(options);
    try {
      const page = await first.newPage();
      await page.goto(app + "/signup" + selection);
      await page.locator('[name="fullName"]').fill("W10 Synthetic Owner");
      await page.locator('[name="email"]').fill(email);
      await page.locator('[name="password"]').fill(password);
      await page.locator('[name="confirmPassword"]').fill(password);
      await page.getByRole("button", { name: "Create account", exact: true }).click();
      await page.waitForURL(url => url.pathname === "/signup/check-email");
      await page.goto(await mailLink(email, "signup"));
      await page.waitForURL(url => url.pathname === "/setup/company");
      await page.getByText("AI Advertising Agency", { exact: false }).first().waitFor();
      await page.getByLabel("Company name").fill(name);
      await page.getByRole("button", { name: "Continue to commercial activation" }).click();
      await page.waitForURL(url => url.pathname === "/activation" && url.searchParams.get("stage") === "payment_pending");
      await page.reload();
      assert.equal(new URL(page.url()).pathname, "/activation");
    } finally {
      await first.close();
    }

    const org = result(await admin.from("organizations").select("id,name,owner_user_id").eq("name", name).single(), "Read reserved organization");
    const user = result(await admin.auth.admin.getUserById(org.owner_user_id), "Read confirmed Owner").user;
    assert.equal(user.email, email);
    assert.ok(user.email_confirmed_at);
    assert.equal(org.name, name);
    const ownerClient = createClient(backend, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
    result(await ownerClient.auth.signInWithPassword({ email, password }), "Sign in synthetic Owner for authorization checks");
    for (const previous of isolatedOrganizations) {
      const records = result(await ownerClient.from("projects").select("id").eq("id", previous.projectId), "Cross-tenant project read");
      assert.deepEqual(records, []);
      const customerRecords = result(await ownerClient.from("crm_accounts").select("id").eq("id", previous.customerId), "Cross-tenant customer read");
      assert.deepEqual(customerRecords, []);
      for (const table of ["project_task_runs", "project_roadmaps", "meetings", "meeting_agent_sessions", "approval_requests", "project_readiness_assessments"]) {
        const hidden = result(await ownerClient.from(table).select("id").eq("project_id", previous.projectId), "Cross-tenant " + table);
        assert.deepEqual(hidden, [], "Another tenant must not see " + table);
      }
      const denied = await ownerClient.from("projects").update({ name: "W10 denied write" }).eq("id", previous.projectId).select("id");
      assert.ok(denied.error || denied.data?.length === 0, "Cross-tenant project mutation must fail");
    }
    const entitlement = result(await admin.from("organization_entitlements")
      .select("status,product_code,selected_template_key,base_price,currency").eq("organization_id", org.id).single(), "Read entitlement");
    assert.equal(entitlement.status, "pending");
    assert.equal(entitlement.product_code, "ready_company");
    assert.equal(entitlement.selected_template_key, template);
    const membership = result(await admin.from("organization_members")
      .select("role").eq("organization_id", org.id).eq("user_id", user.id).single(), "Read Owner membership");
    assert.equal(membership.role, "owner");

    const returning = await localContext(options);
    try {
      const page = await returning.newPage();
      await login(page, email, password);
      await page.goto(app + "/activation");
      assert.equal(new URL(page.url()).pathname, "/activation");
      await page.getByText(/assisted B2B activation/i).first().waitFor();
      console.log(`PASS W10 Agency reservation (${profile}): pending entitlement and Owner persisted across a fresh login`);

      const now = Date.now();
      const activation = await billing.rpc("platform_confirm_company_payment_v1", {
        p_organization_id: org.id,
        p_invoice_reference: "W10-SYNTHETIC-" + id,
        p_amount: entitlement.base_price,
        p_currency: entitlement.currency,
        p_period_start: new Date(now - 60000).toISOString(),
        p_period_end: new Date(now + 7 * 86400000).toISOString(),
      });
      if (activation.error?.code === "42501") {
        const safeDetail = activation.error.message.match(/^[A-Za-z0-9_ .()"-]{1,200}$/);
        console.log("W10 local activation authorization: " + (safeDetail?.[0] ?? "other authorization rejection"));
      }
      result(activation, "Record synthetic invoice in disposable database");
      const active = result(await admin.from("organization_entitlements")
        .select("status").eq("organization_id", org.id).single(), "Read activated entitlement");
      assert.equal(active.status, "active");
      console.log(`PASS W10 assisted activation (${profile}): active entitlement persisted`);

      await page.goto(app + "/studio/templates?template=" + template);
      await page.getByRole("button", { name: "Provision AI Advertising Agency", exact: true }).click();
      await page.waitForURL(url => url.pathname === "/company/launch");
      const installation = result(await admin.from("organization_template_installations")
        .select("template_key").eq("organization_id", org.id).single(), "Read installed Agency");
      assert.equal(installation.template_key, template);

      const customerName = "W10 Sample Client " + id;
      const brief = "Create an offline measurement plan for a synthetic cafe campaign.";
      const objective = brief + " The fictional cafe sells vegan lunches in Budapest to adults aged 25-45. Use only synthetic assumptions: 1000 impressions, 50 clicks, 10 purchases; no external data or integrations. Deliver a short KPI table with CTR and conversion formulas and explicitly labelled assumptions. Assign both available specialists to this project. Keep the roadmap to one phase with one draft task, requiring Human CEO approval before drafting. That task must request an internal review meeting with both specialists. The meeting reviews the draft, records minutes and recommends acceptance; it must not create extra work or request another meeting. No messages, campaign launch, purchases or other external actions. Completion means a reviewed internal document, never real marketing results.";
      const projectName = objective.slice(0, 120);
      await page.goto(app + "/crm");
      await page.locator("#add-customer > summary").click();
      const customerForm = page.locator("#add-customer form");
      await customerForm.locator('[name="name"]').fill(customerName);
      await customerForm.getByLabel("Notes").fill(brief);
      await customerForm.getByRole("button", { name: "Create customer" }).click();
      await page.waitForURL(url => /^\/crm\/[^/]+$/.test(url.pathname) && url.searchParams.get("saved") === "1");
      const customerPath = new URL(page.url()).pathname;
      const customerId = customerPath.split("/").at(-1);
      const customer = result(await admin.from("crm_accounts").select("organization_id,name,notes")
        .eq("id", customerId).single(), "Read customer and brief");
      assert.deepEqual(customer, { organization_id: org.id, name: customerName, notes: brief });

      for (const capability of ["contract.read", "contract.create", "contract.update"]) {
        await page.goto(app + "/crm/access");
        assert.equal(new URL(page.url()).pathname, "/crm/access");
        await page.getByRole("heading", { name: "Grant user access", exact: true }).waitFor();
        const accessForm = page.locator('form').filter({
          has: page.locator('input[name="principal_type"][value="user"]'),
        });
        await accessForm.locator('select[name="principal_id"]').selectOption(user.id);
        await accessForm.getByLabel("Capability").selectOption(capability);
        await accessForm.getByLabel("Scope").selectOption("customer");
        await accessForm.getByLabel("Resource ID").fill(customerId);
        await accessForm.getByRole("button", { name: "Grant explicit access" }).click();
        await page.waitForURL(url => url.pathname === "/crm/access" && url.searchParams.get("saved") === "1");
      }

      const contractNumber = "W10-" + id;
      await page.goto(app + customerPath + "?tab=contracts");
      await page.getByText("Add contract", { exact: true }).click();
      const contractForm = page.locator("form").filter({ has: page.getByLabel("Contract identifier") });
      await contractForm.getByLabel("Contract identifier").fill(contractNumber);
      await contractForm.getByLabel("Scope", { exact: true }).fill(brief);
      await contractForm.getByRole("button", { name: "Save contract" }).click();
      await page.waitForURL(url => url.pathname === customerPath && url.searchParams.get("saved") === "1");
      const contract = result(await admin.from("project_contracts").select("id,organization_id,customer_id")
        .eq("organization_id", org.id).eq("contract_number", contractNumber).single(), "Read linked contract");
      assert.equal(contract.customer_id, customerId);

      const params = new URLSearchParams({ customer: customerId, contract: contract.id });
      await page.goto(app + "/projects?" + params);
      const projectForm = page.locator("#create-project form");
      assert.equal(await projectForm.getByLabel("Project customer").inputValue(), customerId);
      assert.equal(await projectForm.getByLabel("Project contract").inputValue(), contract.id);
      await projectForm.getByLabel("Primary accountable manager").selectOption(user.id);
      await projectForm.getByLabel("Objective").fill(objective);
      await projectForm.getByRole("button", { name: "Create project", exact: true }).click();
      await page.waitForURL(url => url.pathname === "/projects/operating" && !!url.searchParams.get("project"));
      const projectId = new URL(page.url()).searchParams.get("project");
      const project = result(await admin.from("projects").select("organization_id,customer_id,primary_manager_user_id")
        .eq("id", projectId).single(), "Read linked project");
      assert.deepEqual(project, { organization_id: org.id, customer_id: customerId, primary_manager_user_id: user.id });
      await page.getByRole("heading", { name: projectName, exact: true }).first().waitFor();
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: projectName, exact: true }).first().waitFor();
      const actionTitle = "W10 Prepare internal report " + id;
      await page.goto(app + "/actions?project=" + projectId);
      await page.locator(".action-create-card > summary").click();
      const actionForm = page.locator(".action-create-card form");
      await actionForm.getByLabel("Title", { exact: true }).fill(actionTitle);
      await actionForm.getByLabel("Description", { exact: true }).fill(brief);
      await actionForm.getByRole("button", { name: "Create governed action" }).click();
      await page.waitForURL(url => url.pathname === "/actions" && !!url.searchParams.get("action"));
      const actionId = new URL(page.url()).searchParams.get("action");
      const updateForm = page.locator('form').filter({ has: page.locator('input[name="actionId"]') });
      await updateForm.locator('[name="nextStatus"]').selectOption("in_progress");
      await updateForm.getByLabel("Transition note").fill("Synthetic internal planning started.");
      await updateForm.getByRole("button", { name: "Update action item" }).click();
      await page.waitForURL(url => url.searchParams.get("status") === "in_progress");
      await page.reload({ waitUntil: "domcontentloaded" });
      await page.getByRole("heading", { name: actionTitle, exact: true }).waitFor();
      console.log(`PASS W10 action (${profile}): task creation and transition survive refresh`);

      const link = result(await admin.from("project_contract_links").select("contract_id,project_id")
        .eq("organization_id", org.id).eq("project_id", projectId).single(), "Read project contract link");
      assert.deepEqual(link, { contract_id: contract.id, project_id: projectId });
      const verification = await localContext(options);
      try {
        const reopened = await verification.newPage();
        await login(reopened, email, password);
        await reopened.goto(app + customerPath + "?tab=projects", { waitUntil: "commit" });
        await reopened.getByRole("link", { name: projectName, exact: true }).waitFor();
      } finally {
        await verification.close();
      }
      const memberEmail = "w10-member-" + id + "@example.com";
      const memberPassword = randomUUID() + "Aa1!";
      const member = result(await admin.auth.admin.createUser({
        email: memberEmail, password: memberPassword, email_confirm: true,
      }), "Create restricted synthetic member").user;
      result(await admin.from("organization_members").insert({
        organization_id: org.id, user_id: member.id, role: "viewer", membership_status: "active",
      }), "Add restricted member");
      const memberClient = createClient(backend, publicKey, { auth: { persistSession: false, autoRefreshToken: false } });
      result(await memberClient.auth.signInWithPassword({ email: memberEmail, password: memberPassword }), "Sign in restricted member");
      const visibleCustomer = result(await memberClient.from("crm_accounts").select("id").eq("id", customerId), "Member customer visibility");
      assert.equal(visibleCustomer.length, 1);
      const hiddenContracts = result(await memberClient.from("project_contracts").select("id").eq("id", contract.id), "Member contract boundary");
      assert.deepEqual(hiddenContracts, []);
      const deniedWrite = await memberClient.from("project_contracts")
        .insert({ organization_id: org.id, customer_id: customerId, contract_number: "DENIED-" + id }).select("id");
      assert.ok(deniedWrite.error, "Unpermitted member must not create a contract");
      console.log(`PASS W10 roles (${profile}): member sees customer and cannot read or create contract`);
      if (process.env.W10_LIVE_AI === "true") {
        const roster = result(await admin.from("agents").select("id,agent_code,enabled")
          .eq("organization_id", org.id).not("agent_code", "in", "(RYTHM-COMMS,T-001)").order("agent_code").limit(2), "Read Agency roster");
        for (const agent of roster) {
          await page.goto(app + "/agents/" + encodeURIComponent(agent.agent_code));
          if (!agent.enabled) await page.getByRole("button", { name: "Enable agent runtime", exact: true }).click();
          await page.getByRole("button", { name: "Pause agent runtime", exact: true }).waitFor();
        }
        await page.goto(app + "/projects/operating?project=" + projectId + "&view=advanced");
        const responsePromise = page.waitForResponse(response =>
          new URL(response.url()).pathname === "/api/projects/analyze" && response.request().method() === "POST",
          { timeout: 240000 });
        await page.getByRole("button", { name: "Run Project Analysis", exact: true }).click();
        const analysisResponse = await responsePromise;
        const analysisBody = await analysisResponse.json();
        assert.equal(analysisResponse.ok(), true, "Live project analysis HTTP " + analysisResponse.status() + " " + String(analysisBody.error ?? ""));
        const persistedAnalysis = result(await admin.from("project_readiness_assessments")
          .select("id").eq("organization_id", org.id).eq("project_id", projectId), "Read live project analysis");
        assert.ok(persistedAnalysis.length > 0);
        console.log(`PASS W10 live analysis (${profile}): actual provider output persisted`);
        const team = result(await admin.from("project_agents").select("agent_id")
          .eq("organization_id", org.id).eq("project_id", projectId), "Read assigned project specialists");
        assert.ok(team.length >= 2, "Analysis must assign the two requested specialists without fixture intervention");
        await page.reload();
        const runResponse = page.waitForResponse(r => new URL(r.url()).pathname === "/api/projects/run" && r.request().method() === "POST", { timeout: 240000 });
        await page.getByRole("button", { name: "Run Project", exact: true }).click();
        const run = await runResponse;
        assert.equal(run.ok(), true, "Roadmap generation HTTP " + run.status());
        const roadmap = result(await admin.from("project_roadmaps").select("id,status,approved_by_user_id")
          .eq("organization_id", org.id).eq("project_id", projectId).single(), "Read reviewable roadmap");
        assert.equal(roadmap.status, "in_review");
        assert.equal(roadmap.approved_by_user_id, null);
        assert.deepEqual(result(await admin.from("project_executions").select("id").eq("project_id", projectId), "Check human roadmap gate"), []);
        const approveResponse = page.waitForResponse(r => new URL(r.url()).pathname === "/api/projects/roadmap" && r.request().method() === "POST");
        await page.getByRole("button", { name: "Approve & Start", exact: true }).click();
        assert.equal((await approveResponse).ok(), true, "Owner roadmap approval must start the persisted execution");
        await page.goto(app + "/projects/operating?project=" + projectId + "&view=decisions");
        const pending = result(await admin.from("approval_requests").select("id,title,status")
          .eq("organization_id", org.id).eq("project_id", projectId).eq("status", "pending"), "Read task approval gate");
        assert.ok(pending.length, "Scoped task must await the requested Human CEO authorization");
        for (const approval of pending) {
          await page.getByLabel("Decision reason for " + approval.title, { exact: true }).fill("Approve only the synthetic internal measurement draft; no external actions.");
          const approvedResponse = page.waitForResponse(r => new URL(r.url()).pathname === "/api/projects/live" && r.request().method() === "POST");
          await page.getByRole("button", { name: "Approve & continue", exact: true }).first().click();
          assert.equal((await approvedResponse).ok(), true, "Owner task authorization must persist");
        }
        console.log(`PASS W10 Human CEO gates (${profile}): roadmap and scoped task authorized in browser`);
        assert.ok(process.env.CRON_SECRET, "Disposable scheduler credential required");
        let outputs = [], completedMeetings = [];
        for (let tick = 0; tick < 4; tick++) {
          const dispatched = await fetch(app + "/api/projects/dispatch", { headers: { Authorization: "Bearer " + process.env.CRON_SECRET }, signal: AbortSignal.timeout(290000) });
          assert.equal(dispatched.ok, true, "Normal authorized scheduler must respond");
          const state = await dispatched.json();
          assert.deepEqual(state.failedSteps, [], "Scheduler steps must not silently degrade");
          outputs = result(await admin.from("project_task_runs").select("id,title,status,safe_result,organization_id")
            .eq("project_id", projectId).eq("organization_id", org.id).eq("status", "completed"), "Read generated task outputs");
          completedMeetings = result(await admin.from("meetings").select("id,status,minutes,organization_id")
            .eq("project_id", projectId).eq("organization_id", org.id).eq("status", "completed"), "Read completed review meeting");
          if (outputs.some(t => Array.isArray(t.safe_result?.deliverables) && t.safe_result.deliverables.length) && completedMeetings.length) break;
        }
        const output = outputs.find(t => Array.isArray(t.safe_result?.deliverables) && t.safe_result.deliverables.length);
        assert.ok(output, "An actual generated deliverable must persist");
        assert.ok(completedMeetings.length, "An actual project review meeting must complete");
        assert.ok(completedMeetings[0].minutes?.executive_summary, "Meeting minutes must persist");
        const savedApproval = result(await admin.from("approval_requests").select("status,approver_user_id").eq("id", pending[0].id).single(), "Read recorded Human CEO decision");
        assert.equal(savedApproval.status, "approved");
        assert.equal(savedApproval.approver_user_id, user.id);
        await page.goto(app + "/projects/operating?project=" + projectId + "&view=results");
        await page.getByRole("heading", { name: "Generated work outputs", exact: true }).waitFor();
        await page.getByText(output.safe_result.summary, { exact: true }).waitFor();
        await page.reload();
        await page.getByText(output.safe_result.summary, { exact: true }).waitFor();
        await page.screenshot({ path: `test-results/w10-${profile}-results.png`, fullPage: true });
        const recheck = await localContext(options);
        try {
          const fresh = await recheck.newPage();
          await login(fresh, email, password);
          await fresh.goto(app + "/projects/operating?project=" + projectId + "&view=results");
          await fresh.getByText(output.safe_result.summary, { exact: true }).waitFor();
          await fresh.goto(app + "/meetings/room?project=" + projectId + "&meeting=" + completedMeetings[0].id);
          await fresh.getByText(completedMeetings[0].minutes.executive_summary, { exact: false }).first().waitFor();
          await fresh.screenshot({ path: `test-results/w10-${profile}-meeting.png`, fullPage: true });
        } finally { await recheck.close(); }
        const restrictedOutputs = result(await memberClient.from("project_task_runs").select("id").eq("project_id", projectId), "Viewer output visibility");
        assert.ok(restrictedOutputs.length, "Tenant viewer can read operational outputs under existing policy");
        const forbiddenApproval = await memberClient.from("approval_requests").update({ status: "rejected" }).eq("id", pending[0].id).select("id");
        assert.ok(forbiddenApproval.error || !forbiddenApproval.data?.length, "Viewer cannot change Human CEO decisions");
        console.log(`PASS W10 generated delivery (${profile}): persisted outputs, reviewed meeting, approvals, refresh and re-login`);
      }
      isolatedOrganizations.push({ projectId, customerId });
      console.log(`PASS W10 CRM and project (${profile}): persisted brief, customer, contract and accountable project`);
      console.log(`PASS W10 Agency provision (${profile}): recorded template installation`);
    } finally {
      await returning.close();
    }
  }
} finally {
  await browser.close();
}
