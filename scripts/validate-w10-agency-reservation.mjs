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

const admin = createClient(backend, process.env.W10_LOCAL_SERVICE_KEY, {
  auth: { persistSession: false, autoRefreshToken: false },
});

function result(response, label) {
  assert.ok(!response.error, label + ": " + (response.error?.code ?? response.error?.status ?? ""));
  return response.data;
}

async function login(page, email, password) {
  const next = "/setup/company" + selection;
  await page.goto(app + "/login?force=1&next=" + encodeURIComponent(next));
  await page.locator('[name="email"]').fill(email);
  await page.locator('[name="password"]').fill(password);
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.waitForURL(url => ["/setup/company", "/activation"].includes(url.pathname));
}

const browser = await chromium.launch();
try {
  for (const [profile, options] of [
    ["desktop", { viewport: { width: 1440, height: 900 } }],
    ["mobile", devices["Pixel 7"]],
  ]) {
    const id = randomUUID();
    const email = "w10-" + id + "@example.test";
    const name = "W10 Agency " + id;
    const password = randomUUID() + "Aa1!";
    const user = result(await admin.auth.admin.createUser({
      email, password, email_confirm: true,
    }), "Create confirmed synthetic user").user;
    const first = await browser.newContext(options);
    try {
      const page = await first.newPage();
      await login(page, email, password);
      await page.getByText("AI Advertising Agency", { exact: false }).first().waitFor();
      await page.getByLabel("Company name").fill(name);
      await page.getByRole("button", { name: "Continue to commercial activation" }).click();
      await page.waitForURL(url => url.pathname === "/activation" && url.searchParams.get("stage") === "payment_pending");
      await page.reload();
      assert.equal(new URL(page.url()).pathname, "/activation");
    } finally {
      await first.close();
    }

    const org = result(await admin.from("organizations").select("id,name").eq("owner_user_id", user.id).single(), "Read reserved organization");
    assert.equal(org.name, name);
    const entitlement = result(await admin.from("organization_entitlements")
      .select("status,product_code,selected_template_key").eq("organization_id", org.id).single(), "Read entitlement");
    assert.deepEqual(entitlement, { status: "pending", product_code: "ready_company", selected_template_key: template });
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
    } finally {
      await returning.close();
    }
    console.log(`PASS W10 Agency reservation (${profile}): pending entitlement and Owner persisted across a fresh login`);
  }
} finally {
  await browser.close();
}
