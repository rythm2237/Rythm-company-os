import assert from "node:assert/strict";
import {readFileSync} from "node:fs";

const read=(path:string)=>readFileSync(path,"utf8");
const callback=read("app/api/integrations/google-business-profile/callback/route.ts");
const retry=read("app/(app)/integrations/customer-actions.ts");
const ui=read("app/(app)/integrations/[id]/setup/page.tsx");
const credentials=read("lib/integrations/connections/provider-credentials.ts");

const stored=callback.indexOf('store_organization_integration_secret_unverified_v1');
const discovered=callback.indexOf('discoverGoogleResources("google_business_profile"');
assert.ok(stored>=0&&discovered>stored,"Store Google OAuth securely before quota-limited discovery");
assert.equal(callback.split("const envelope =").length-1,1,"Only one OAuth envelope should be stored");
assert.ok(callback.includes("google_business_profile_quota_exhausted"),"Classify GBP 429 separately from expired OAuth");
assert.ok(callback.includes("RESOURCE_EXHAUSTED"),"Detect Google quota-exhausted response");
assert.ok(!callback.includes("quotaBlocked ? \"reauth_required\""),"Never label quota exhaustion as reauthorization failure");
assert.ok(retry.includes("recheckGoogleBusinessProfileAfterQuota"),"Provide safe recovery after quota approval");
assert.ok(retry.includes("get_organization_integration_secret_service_v1"),"Use existing Vault, not client-side token collection");
assert.ok(retry.includes("getTokenConnectionAdapter(\"google_business_profile\")"),"Recovery must verify real Google API access");
assert.ok(retry.includes('requireActiveOwnerOrganizationContext()'),"Manual recovery requires owner authorization");
assert.ok(retry.includes("verification.resources.length"),"Require confirmed provider resources");
assert.ok(retry.includes("last_error_code:quotaExceeded?"),"Persist quota-specific provider status");
assert.ok(ui.includes("Recheck API access after quota approval"),"Provide a user-controlled recovery action");
assert.ok(ui.includes("My Business Account Management API"),"Show the correct Google Cloud quota service");
assert.ok(ui.includes("Google Business Profile API quota requires attention"),"Show diagnosis for existing 429");
assert.ok(credentials.includes("google_business_profile"),"Backend token refresh must recognize GBP provider");
console.log("PASS Google Business Profile OAuth retention, zero-quota diagnosis, owner retry and safe provider verification");
