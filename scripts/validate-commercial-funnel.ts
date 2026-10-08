import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { commercialSetupPath, commercialSignupPath, selectedCommercialOffer } from "../lib/commercial/selection";

const agency = selectedCommercialOffer("company_studio", "ready_ai_advertising_agency_v1");
assert.deepEqual(agency, {
  productCode: "ready_company", templateKey: "ready_ai_advertising_agency_v1", offerCode: "ready_ai_company",
});
assert.equal(commercialSignupPath(agency), "/signup?product=ready_company&template=ready_ai_advertising_agency_v1");

const software = selectedCommercialOffer("ready_company", "ready_software_company_v1");
assert.deepEqual(software, {
  productCode: "company_studio", templateKey: "ready_software_company_v1", offerCode: "custom_ai_company",
});
assert.equal(commercialSetupPath(software), "/setup/company?product=company_studio&template=ready_software_company_v1");

const preview = selectedCommercialOffer("ready_company", "ready_saas_startup_v1");
assert.equal(preview.templateKey, "", "Preview templates cannot enter paid selection");
assert.equal(selectedCommercialOffer("ready_company", "").offerCode, "ready_ai_company");

const migration = readFileSync("supabase/migrations/20260929153000_commercial_template_offer_alignment.sql", "utf8");
assert.match(migration, /selected_template_key = v_template_key/);
assert.match(migration, /v_offer\.entitlement_product_code is distinct from v_product_code/);
assert.match(migration, /max_active_agents = case v_product_code when 'ready_company' then 12 else 50 end/);
assert.match(migration, /revoke execute on function public\.provision_customer_organization.*from authenticated/);


const middleware = readFileSync("middleware.ts", "utf8");
const loginAction = readFileSync("app/(auth)/login/actions.ts", "utf8");
const oauthCallback = readFileSync("app/(auth)/auth/callback/route.ts", "utf8");
const publicShell = readFileSync("app/(public)/_components/PublicShell.tsx", "utf8");

assert.ok(middleware.includes("forceLogin"));
assert.ok(middleware.includes('rpc("list_my_organizations")'));
assert.ok(!middleware.includes('memberships?.length ? "/home" : "/setup/company"'));
assert.ok(loginAction.includes('rpc("list_my_organizations")'));
assert.ok(oauthCallback.includes('flow === "oauth_signup"'));
assert.ok(oauthCallback.includes("noCompanyAccessUrl"));
assert.ok(publicShell.includes('href="/login?force=1"'));

console.log("Commercial funnel selection, provisioning, and sign-in separation contract passed.");

