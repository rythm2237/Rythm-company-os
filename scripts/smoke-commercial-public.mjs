import assert from 'node:assert/strict';

const origin = (process.env.RYTHM_SMOKE_ORIGIN || 'https://rythm-os.com').replace(/\/$/, '');
const base = new URL(origin);
assert.ok(base.protocol === 'https:' || ['localhost', '127.0.0.1'].includes(base.hostname), 'Use HTTPS outside localhost');
async function get(path) {
  const response = await fetch(`${origin}${path}`, { redirect: 'manual', signal: AbortSignal.timeout(20000) });
  return { status: response.status, location: response.headers.get('location'), body: await response.text() };
}
const selection = 'product=company_studio&template=ready_software_company_v1';
const [health, templates, pricing, signup, selectedSignup, setup] = await Promise.all([
  get('/api/health'), get('/templates'), get('/pricing'), get('/signup'), get(`/signup?${selection}`), get(`/setup/company?${selection}`),
]);
assert.equal(health.status, 200);
assert.equal(JSON.parse(health.body).status, 'ok', 'Health must not be degraded');
assert.equal(templates.status, 200);
assert.match(templates.body, /ready_ai_advertising_agency_v1/);
assert.match(templates.body, /ready_software_company_v1/);
assert.match(templates.body, /249/);
assert.match(templates.body, /699/);
assert.equal(pricing.status, 200);
assert.match(pricing.body, /Contact Billing|Contact about availability/);
assert.ok([303, 307, 308].includes(signup.status));
assert.equal(new URL(signup.location, origin).pathname, '/pricing');
assert.equal(selectedSignup.status, 200);
assert.match(selectedSignup.body, /company_studio/);
assert.match(selectedSignup.body, /ready_software_company_v1/);
assert.ok([303, 307, 308].includes(setup.status));
const login = new URL(setup.location, origin);
assert.equal(login.pathname, '/login');
assert.ok(login.searchParams.get('next')?.includes(selection), 'Unauthenticated setup must preserve selection');
console.log(`PASS public commercial smoke on ${origin}: health, two templates, prices, assisted billing, signup and setup redirects.`);
console.log('This read-only smoke does not verify customer OAuth, invoice receipt, provisioning, or external execution.');
