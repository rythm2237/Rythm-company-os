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
  await page.waitForURL(url => ["/setup/company", "/activation"].includes(url.pathname));
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
try {
  for (const [profile, options] of [
    ["desktop", { viewport: { width: 1440, height: 900 } }],
    ["mobile", devices["Pixel 7"]],
  ]) {
    const id = randomUUID();
    const email = "w10-" + id + "@example.com";
    const name = "W10 Agency " + id;
    const password = randomUUID() + "Aa1!";
    const first = await browser.newContext(options);
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

    const returning = await browser.newContext(options);
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
        const safeDetail = activation.error.message.match(/^(?:Platform administrator required|permission denied for (?:table|function|schema|relation) [a-z_][a-z_0-9]*)/i);
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
      console.log(`PASS W10 Agency provision (${profile}): recorded template installation`);
    } finally {
      await returning.close();
    }
  }
} finally {
  await browser.close();
}
