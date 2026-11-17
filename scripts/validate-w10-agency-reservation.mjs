import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { createClient } from "@supabase/supabase-js";
import { chromium, devices } from "playwright";

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
      const brief = "Design an internal campaign measurement plan for a synthetic customer.";
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
      await projectForm.getByLabel("Objective").fill(brief);
      await projectForm.getByRole("button", { name: "Create project", exact: true }).click();
      await page.waitForURL(url => url.pathname === "/projects/operating" && !!url.searchParams.get("project"));
      const projectId = new URL(page.url()).searchParams.get("project");
      const project = result(await admin.from("projects").select("organization_id,customer_id,primary_manager_user_id")
        .eq("id", projectId).single(), "Read linked project");
      assert.deepEqual(project, { organization_id: org.id, customer_id: customerId, primary_manager_user_id: user.id });
      const link = result(await admin.from("project_contract_links").select("contract_id,project_id")
        .eq("organization_id", org.id).eq("project_id", projectId).single(), "Read project contract link");
      assert.deepEqual(link, { contract_id: contract.id, project_id: projectId });
      const verification = await localContext(options);
      try {
        const reopened = await verification.newPage();
        await login(reopened, email, password);
        await reopened.goto(app + customerPath + "?tab=projects", { waitUntil: "commit" });
        await reopened.getByRole("link", { name: brief, exact: true }).waitFor();
      } finally {
        await verification.close();
      }
      console.log(`PASS W10 CRM and project (${profile}): persisted brief, customer, contract and accountable project`);
      console.log(`PASS W10 Agency provision (${profile}): recorded template installation`);
    } finally {
      await returning.close();
    }
  }
} finally {
  await browser.close();
}
