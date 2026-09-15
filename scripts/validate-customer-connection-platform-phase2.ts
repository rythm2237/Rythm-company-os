import { readFileSync } from "node:fs";
const read=(path:string)=>readFileSync(path,"utf8");
const expect=(body:string,value:string,label:string)=>{if(!body.includes(value))throw new Error(`${label}: missing ${value}`);};
const reject=(body:string,value:string,label:string)=>{if(body.includes(value))throw new Error(`${label}: forbidden ${value}`);};

const plans=read("lib/integrations/connections/setup-plans.ts");
for(const provider of ["google_search_console","google_analytics","google_workspace","microsoft_365","github","vercel","supabase","cloudflare"])expect(plans,`${provider}:`,`${provider} canonical playbook`);
for(const action of ["USER_LOGIN","USER_MFA","USER_CONSENT","RESOURCE_DISCOVERY","RESOURCE_SELECTION","RESOURCE_BINDING","CONNECTION_VERIFY"])expect(plans,action,"canonical step contract");
for(const action of ["LOGIN_REQUIRED","MFA_REQUIRED","CAPTCHA_REQUIRED","CONSENT_REQUIRED","ADMIN_CONSENT_REQUIRED","RESOURCE_CHOICE_REQUIRED","BUSINESS_DECISION_REQUIRED","PAYMENT_REQUIRED","LEGAL_ACCEPTANCE_REQUIRED"])expect(plans,action,"Human-action taxonomy");

const runtime=read("lib/integrations/computer-use/runtime.ts");
for(const value of ["https:","localhost","isPrivateIpv4","allowedHosts","redirect: \"error\"","credentialCapture: false","screenshotRedaction: \"sensitive-fields\"","privateNetworkAccess: false"])expect(runtime,value,"browser security boundary");
for(const value of ["password","passcode","otp","mfa","passkey","captcha","private key"])expect(runtime,value,"credential input blocklist");
expect(runtime,"< 0.8","action confidence threshold");
for(const value of ["BROWSERBASE_API_KEY","BrowserbaseComputerUseRuntime","eu-central-1","solveCaptchas: false","recordSession: false","logSession: false","REQUEST_RELEASE","debuggerFullscreenUrl","Target.attachToTarget"])expect(runtime,value,"direct secure cloud-browser runtime");
reject(runtime,"recordSession: true","credential-safe browser recording policy");

const resume=read("lib/integrations/connections/resume-token.ts");
for(const value of ["createHmac","timingSafeEqual","expiresAt","organizationId","userId","sessionId","RYTHM_CONNECTION_AGENT_RESUME_V1","SUPABASE_SERVICE_ROLE_KEY"])expect(resume,value,"signed scoped resume token");
reject(resume,"localStorage","resume token client storage");

const agent=read("lib/integrations/connection-setup-agent.ts");
for(const value of ["connection_setup_agent","RYTHM_CONNECTION_AGENT_KILL_SWITCH","RYTHM_CONNECTION_AGENT_ORG_ALLOWLIST","waiting_for_user","project_connection_bindings","last_verified_at","browser.session.started","human.takeover.requested","connection.agent.completed","verifyConnectionResumeToken"])expect(agent,value,"Connection Setup Agent invariant");
expect(agent,'actor_type: "system"',"auditable system agent identity");
reject(agent,'actor_agent_id: CONNECTION_SETUP_AGENT_KEY',"fake UUID agent identity");

const migration=read("supabase/migrations/20260915121500_customer_connection_platform_phase2.sql");
for(const state of ["queued","starting","running","waiting_for_user","waiting_for_provider","verifying","paused","retrying","completed","failed","cancelled","expired"])expect(migration,`'${state}'`,"durable setup session lifecycle");
for(const rollout of ["off","internal","beta","limited","general"])expect(migration,`'${rollout}'`,"rollout lifecycle");
for(const value of ["claim_connection_setup_session_v1","for update skip locked","expire_stale_connection_setup_sessions_v1","connection_setup_session_events","reject_connection_setup_secret_metadata_v1"])expect(migration,value,"durability/security migration");
const resumeMigration=read("supabase/migrations/20260915121600_connection_agent_auto_resume.sql");
for(const value of ["RESOURCE_DISCOVERY","CONNECTION_VERIFY","automation_mode='ai'","binding_status='verified'"])expect(resumeMigration,value,"provider callback/binding auto-resume");
const hardeningMigration=read("supabase/migrations/20260915121700_connection_agent_phase2_hardening.sql");
for(const value of ["drop policy if exists connection_setup_session_events_owner_write","for insert to authenticated","for update to authenticated","for delete to authenticated","connection_setup_session_events_connection_idx","connection_setup_session_events_provider_idx","integration_setup_sessions_connection_idx","integration_setup_sessions_provider_idx","integration_setup_sessions_started_by_idx"])expect(hardeningMigration,value,"Phase 2 RLS/index hardening");

const actions=read("app/(app)/integrations/connection-agent-actions.ts");
for(const value of ["httpOnly:true","sameSite:\"strict\"","startConnectionSetupAgent","controlConnectionSetupSession","dispatchConnectionSetupSessions","explainConnectionSetupQuestion","resume_token_hash","secureEqual(expected,presented)"])expect(actions,value,"secure server actions");
reject(actions,"localStorage","resume token browser storage");
const page=read("app/(app)/integrations/[id]/setup/page.tsx");
for(const value of ["ConnectionSetupAgentPanel","Guide me","MANUAL · GUIDE ME","getCanonicalSetupPlan"])expect(page,value,"dual setup UX");
const guide=read("app/(app)/integrations/integration-setup-guide.tsx");expect(guide,"getIntegrationGuideDefinition","Guide consumes canonical plan");
const dispatcher=read("app/api/projects/dispatch/route.ts");expect(dispatcher,"dispatchConnectionSetupSessions","durable background dispatcher");
const roadmap=read("app/api/projects/roadmap/route.ts");expect(roadmap,'completion_requires:\"verified_provider_and_bound_resource\"',"truthful Roadmap completion");

console.log("Customer Connection Platform Phase 2 architecture/security validation passed.");
