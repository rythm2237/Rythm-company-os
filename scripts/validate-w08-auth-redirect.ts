import assert from "node:assert/strict";
import { safeAuthPath, authCallbackOrigin } from "../lib/auth/redirect";

for (const path of [null, undefined, "", "https://evil.invalid", "//evil.invalid", "/\\evil.invalid", "/%5cevil.invalid", "/%2fevil.invalid", "/%252fevil.invalid", "/a/..//evil.invalid", "/\t/evil.invalid", "/%00evil.invalid", "/%zz"]) {
  assert.equal(safeAuthPath(path), "/home", String(path));
}
for (const path of ["/home", "/projects/123?tab=files", "/setup/company?product=ready_company&template=ready_ai_advertising_agency_v1", "/projects?q=hello%20world", "/reset-password"]) {
  assert.equal(safeAuthPath(path), path);
}
assert.equal(authCallbackOrigin({}), "https://rythm-os.com");
assert.equal(authCallbackOrigin({}, "www.rythm-os.com"), "https://www.rythm-os.com");
assert.equal(authCallbackOrigin({}, "company.rythm-os.com"), "https://company.rythm-os.com");
assert.equal(authCallbackOrigin({}, "evil.vercel.app"), "https://rythm-os.com");
assert.equal(authCallbackOrigin({VERCEL_ENV:"preview", VERCEL_URL:"staging-fixture.vercel.app"}), "https://staging-fixture.vercel.app");
assert.equal(authCallbackOrigin({AUTH_SITE_ORIGIN:"https://staging.example"}), "https://staging.example");
assert.equal(authCallbackOrigin({AUTH_SITE_ORIGIN:"http://localhost:3001"}), "http://localhost:3001");
for (const origin of ["http://example.com", "https://user:pass@example.com", "https://example.com/path", "https://example.com/?query=1", "javascript:alert(1)"]) {
  assert.throws(() => authCallbackOrigin({AUTH_SITE_ORIGIN:origin}));
}
console.log("W08 redirect contract passed: malicious and valid paths, production aliases, staging/local origins, invalid origin rejection.");
