import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { build } from 'esbuild';

const state={context:null,clientCount:0,queries:[]};
globalThis.w06OAuth=state;
const modules={
  '@/lib/auth/organization-context':
    "export async function resolveOrganizationContext(){return globalThis.w06OAuth.context;} export const isOrganizationEntitlementActive=(v)=>v==='active';",
  '@/lib/integrations/service-runner':
    "export function createExecutionServiceClient(){globalThis.w06OAuth.clientCount++;return{from(t){const q={filters:[],select(){return q;},eq(k,v){q.filters.push([k,v]);return q;},async maybeSingle(){globalThis.w06OAuth.queries.push({table:t,filters:q.filters});return {data:null,error:null};}};return q;}};}",
  '@/lib/integrations/connections/providers':
    'export function discoverGoogleResources(){} export function googleProfile(){}',
  '@/lib/integrations/connections/agent-oauth':
    "export const AGENT_OAUTH_COOKIE_NAMES=['rythm_agent_oauth_state'];export const agentOAuthCallbackPath=()=>'/api/integrations/google-analytics/callback';export const verifyAgentOAuthState=(_,v)=>v==='W06_VALID_STATE'?{userId:'owner-A',organizationId:'A',integrationId:'int-A',sessionId:'sess-A',providerKey:'google_analytics'}:null;",
  '@/lib/integrations/connection-setup-agent':
    'export function dispatchConnectionSetupSessions(){} export function signalConnectionAuthorizationCompleted(){}',
  '@/lib/integrations/connections/github-app':'export function prepareGitHubInstallationConnection(){}',
  '@/lib/integrations/connections/platform-oauth':
    'export function discoverPlatformOAuthResources(){} export function exchangePlatformOAuthCode(){} export const isPlatformOAuthProvider=()=>false;',
};
const built=await build({entryPoints:['lib/integrations/connections/agent-oauth-callback.ts'],
  bundle:true,write:false,platform:'node',format:'cjs',packages:'external',logLevel:'silent',
  plugins:[{name:'w06-synthetic-oauth',setup(b){
    b.onResolve({filter:/^server-only$/},()=>({path:'empty',namespace:'w06'}));
    b.onResolve({filter:/^@\//},args=>modules[args.path]?{path:args.path,namespace:'w06'}:null);
    b.onLoad({filter:/.*/,namespace:'w06'},args=>({contents:args.path==='empty'?'export {}':modules[args.path],loader:'js'}));
  }}]});
const mod={exports:{}};
new Function('require','module','exports',built.outputFiles[0].text)(
  createRequire(process.cwd()+'/package.json'),mod,mod.exports);
const cookies=[
  'rythm_agent_oauth_state=W06_VALID_STATE',
  'rythm_agent_oauth_session=sess-A',
  'rythm_agent_oauth_integration=int-A',
  'rythm_agent_oauth_user=owner-A',
  'rythm_agent_oauth_provider=google_analytics',
  'rythm_agent_oauth_pkce=W06_SYNTHETIC_VERIFIER',
].join('; ');
const request=()=>new Request(
  'https://rythm-os.com/api/integrations/google-analytics/callback?code=W06_FAKE&state=W06_VALID_STATE',
  {headers:{cookie:cookies}});
const good={user:{id:'owner-A'},organizationId:'A',role:'owner',entitlement:'active'};
try{
  const scenarios=[
    ['anonymous',null],['foreign-user',{...good,user:{id:'owner-B'}}],
    ['foreign-org',{...good,organizationId:'B'}],['non-owner',{...good,role:'member'}],
    ['inactive-entitlement',{...good,entitlement:'inactive'}],
  ];
  for(const [name,actor] of scenarios){
    state.context=actor;state.clientCount=0;state.queries=[];
    const result=await mod.exports.maybeHandleAgentOAuthCallback(request(),'google_analytics');
    assert.equal(result.status,400,name);
    assert.equal(state.clientCount,0,name+' must reject BEFORE elevated client');
    assert.equal(state.queries.length,0,name+' must not query any company');
  }
  // The provider controls its own error query value. Never reflect it in
  // the OAuth completion page or allow it to reach privileged persistence.
  state.context=good;state.clientCount=0;state.queries=[];
  const canaryRequest=new Request(
    'https://rythm-os.com/api/integrations/google-analytics/callback?state=W06_VALID_STATE&error=TENANT_B_PRIVATE_CUSTOMER_CONTENT',
    {headers:{cookie:cookies}});
  const deniedProvider=await mod.exports.maybeHandleAgentOAuthCallback(canaryRequest,'google_analytics');
  assert.equal(deniedProvider.status,400);
  assert.doesNotMatch(await deniedProvider.text(),/TENANT_B_PRIVATE_CUSTOMER_CONTENT/);
  assert.equal(state.clientCount,0,"provider error must fail before any service client");

  state.context=good;state.clientCount=0;state.queries=[];
  const valid=await mod.exports.maybeHandleAgentOAuthCallback(request(),'google_analytics');
  assert.equal(valid.status,400,'unknown synthetic session rejected after scoped check');
  assert.equal(state.clientCount,1,'authorized owner performs scoped lookup');
  assert.deepEqual(state.queries.map(q=>q.table),['integration_setup_sessions']);
  assert(state.queries[0].filters.some(([k,v])=>k==='organization_id'&&v==='A'));
  assert(state.queries[0].filters.some(([k,v])=>k==='connection_id'&&v==='int-A'));
  assert.doesNotMatch(await valid.text(),/TENANT_B_PRIVATE_CUSTOMER_CONTENT/);
  console.log('PASS W06 actual shared Agent OAuth callback: anonymous/B-owner/member/revoked denied before elevated client; own A scoped lookup; no provider/network I/O.');
}finally{delete globalThis.w06OAuth;}
