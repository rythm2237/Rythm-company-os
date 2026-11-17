import assert from "node:assert/strict";
import { chromium, devices } from "playwright";

const origin = "http://127.0.0.1:3000";
const template = "ready_ai_advertising_agency_v1";
const browser = await chromium.launch();

try {
  for (const [profile, options] of [
    ["desktop", { viewport: { width: 1440, height: 900 } }],
    ["mobile", devices["Pixel 7"]],
  ]) {
    const context = await browser.newContext(options);
    try {
      const page = await context.newPage();
      await page.route("**/*", route => {
        return new URL(route.request().url()).origin === origin
          ? route.continue()
          : route.abort();
      });
      const response = await page.goto(origin + "/templates");
      assert.equal(response?.status(), 200);
      const agency = page.locator("article").filter({
        has: page.getByRole("heading", { name: "AI Advertising Agency", exact: true }),
      });
      await agency.getByRole("link").click();
      await page.getByRole("heading", { name: "Create your Human CEO account" }).waitFor();
      const signup = new URL(page.url());
      assert.equal(signup.pathname, "/signup");
      assert.equal(signup.searchParams.get("product"), "ready_company");
      assert.equal(signup.searchParams.get("template"), template);
      await page.reload();
      const form = page.locator("form").filter({ has: page.getByLabel("Work email") });
      assert.equal(await form.locator('[name="templateKey"]').inputValue(), template);
      assert.equal(await form.locator('[name="productCode"]').inputValue(), "ready_company");
      console.log(`PASS W10 public agency entry (${profile}): template selection survives reload`);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}
