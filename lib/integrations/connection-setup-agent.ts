import "server-only";
import { createHash, randomUUID } from "node:crypto";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getCanonicalSetupPlan, type ConnectionHumanActionType, type ConnectionSetupStep } from "@/lib/integrations/connections/setup-plans";
import { getComputerUseRuntime } from "@/lib/integrations/computer-use/runtime";
import { issueConnectionResumeToken, verifyConnectionResumeToken } from "@/lib/integrations/connections/resume-token";

export const CONNECTION_SETUP_AGENT_KEY = "connection_setup_agent";
const ACTIVE = ["queued","starting","running","waiting_for_user","waiting_for_provider","verifying","paused","retrying"];

type Db = SupabaseClient;
type SetupSession = {
  id: string;
  organization_id: string;
  project_id: string | null;
  connection_id: string;
  provider_key: string;
  setup_plan: Record<string, unknown>;
  current_step: number;
  session_status: string;
  browser_session_id: string | null;
  control_mode: "ai" | "human" | "paused";
  requires_user_action: boolean;
  user_action_type: ConnectionHumanActionType | null;
  attempt_count: number;
  correlation_id: string;
  metadata: Record<string, unknown> | null;
};

function now() { return new Date().toISOString(); }
function hashToken(token: string) { return createHash("sha256").update(token).digest("hex"); }
function isKilled() { return process.env.RYTHM_CONNECTION_AGENT_KILL_SWITCH === "true"; }

function safeMetadata(value: Record<string, unknown> = {}) {
  const forbidden = /(password|passcode|otp|mfa.?code|access.?token|refresh.?token|client.?secret|private.?key|cookie|authorization)/i;
  return Object.fromEntries(Object.entries(value).filter(([key, item]) => !forbidden.test(key) && !forbidden.test(String(item ?? ""))));
}

async function event(service: Db, session: SetupSession, eventType: string, message: string, metadata: Record<string, unknown> = {}, actorType: "agent"|"user"|"system"|"provider" = "agent", actorUserId?: string) {
  const result = await service.from("connection_setup_session_events").insert({
    organization_id: session.organization_id,
    project_id: session.project_id,
    connection_id: session.connection_id,
    session_id: session.id,
    provider_key: session.provider_key,
    event_type: eventType,
    actor_type: actorType,
    actor_user_id: actorType === "user" ? actorUserId ?? null : null,
    step_key: String(metadata.stepKey ?? "") || null,
    status: session.session_status,
    safe_message: message.slice(0, 500),
    result_code: String(metadata.resultCode ?? "") || null,
    correlation_id: session.correlation_id,
    metadata: safeMetadata(metadata),
  });
  if (result.error) throw new Error(`Connection setup event could not be recorded: ${result.error.message}`);
}

async function audit(service: Db, session: SetupSession, eventType: string, payload: Record<string, unknown> = {}) {
  const result = await service.from("audit_events").insert({
    organization_id: session.organization_id,
    actor_type: "system",
    event_type: eventType,
    object_type: "connection_setup_session",
    object_id: session.id,
    risk_level: "low",
    payload: {
      agent_key: CONNECTION_SETUP_AGENT_KEY,
      project_id: session.project_id,
      connection_id: session.connection_id,
      provider_key: session.provider_key,
      correlation_id: session.correlation_id,
      ...safeMetadata(payload),
    },
  });
  if (result.error) throw new Error(`Connection setup audit could not be recorded: ${result.error.message}`);
}

function rolloutAllows(rollout: string, organizationId: string) {
  if (isKilled()) return false;
  if (rollout === "general") return true;
  const allowlist = new Set((process.env.RYTHM_CONNECTION_AGENT_ORG_ALLOWLIST ?? "").split(",").map(value => value.trim()).filter(Boolean));
  return ["internal","beta","limited"].includes(rollout) && allowlist.has(organizationId);
}

function sessionSelect() {
  return "id,organization_id,project_id,connection_id,provider_key,setup_plan,current_step,session_status,browser_session_id,control_mode,requires_user_action,user_action_type,attempt_count,correlation_id,metadata";
}

export async function startConnectionSetupAgent(client: Db, input: { organizationId: string; projectId?: string | null; connectionId: string; userId: string }) {
  if (isKilled()) throw new Error("AI connection setup is temporarily disabled by the platform kill switch.");
  const connectionResult = await client.from("organization_integrations").select("id,provider_key,status").eq("id", input.connectionId).eq("organization_id", input.organizationId).maybeSingle();
  if (!connectionResult.data) throw new Error("Connection not found.");

  const providerResult = await client.from("integration_providers").select("provider_key,ai_setup_enabled,ai_setup_rollout,browser_playbook_ready").eq("provider_key", connectionResult.data.provider_key).maybeSingle();
  const provider = providerResult.data;
  if (!provider?.ai_setup_enabled || !rolloutAllows(String(provider.ai_setup_rollout), input.organizationId)) throw new Error("AI setup is not enabled for this organization/provider rollout.");

  const plan = getCanonicalSetupPlan(connectionResult.data.provider_key);
  if (!plan || plan.aiSetupSupport === "unsupported") throw new Error("This provider does not have a validated AI setup playbook.");

  const existing = await client.from("integration_setup_sessions").select("id,session_status").eq("organization_id", input.organizationId).eq("connection_id", input.connectionId).eq("automation_mode", "ai").in("session_status", ACTIVE).order("created_at", { ascending: false }).limit(1).maybeSingle();
  if (existing.data?.id) {
    const issued = issueConnectionResumeToken({ sessionId: existing.data.id, organizationId: input.organizationId, userId: input.userId });
    await client.from("integration_setup_sessions").update({ resume_token_hash: hashToken(issued.token), updated_at: now() }).eq("id", existing.data.id).eq("organization_id", input.organizationId);
    return { sessionId: existing.data.id, resumed: true, resumeToken: issued.token };
  }

  const pendingId = randomUUID();
  const issued = issueConnectionResumeToken({ sessionId: pendingId, organizationId: input.organizationId, userId: input.userId });
  const created = await client.from("integration_setup_sessions").insert({
    id: pendingId,
    organization_id: input.organizationId,
    project_id: input.projectId || null,
    connection_id: input.connectionId,
    provider_key: plan.providerKey,
    setup_plan_id: plan.setupPlanId,
    setup_plan_version: plan.version,
    setup_plan: plan,
    current_step: 0,
    step_status: "in_progress",
    session_status: "queued",
    automation_mode: "ai",
    control_mode: "ai",
    agent_id: CONNECTION_SETUP_AGENT_KEY,
    started_by_user_id: input.userId,
    created_by_user_id: input.userId,
    started_at: now(),
    last_heartbeat_at: now(),
    expires_at: new Date(Date.now() + 2 * 60 * 60 * 1000).toISOString(),
    requires_user_action: false,
    user_action_required: false,
    resume_token_hash: hashToken(issued.token),
    provider_context: { ai_setup_support: plan.aiSetupSupport, browser_playbook_ready: Boolean(provider.browser_playbook_ready) },
    metadata: { resume_token_issued_at: now(), rollout: provider.ai_setup_rollout },
  }).select(sessionSelect()).single();
  if (created.error || !created.data) throw new Error(created.error?.message ?? "Connection Setup Agent session could not be created.");

  const session = created.data as unknown as SetupSession;
  await event(client, session, "connection.agent.started", "Connection Setup Agent queued.", { stepKey: plan.steps[0]?.stepKey ?? "start" });
  await audit(client, session, "connection.agent.started", { setup_plan_id: plan.setupPlanId, setup_plan_version: plan.version });
  return { sessionId: session.id, resumed: false, resumeToken: issued.token };
}

async function setWaitingForUser(service: Db, session: SetupSession, step: ConnectionSetupStep, actionType: ConnectionHumanActionType) {
  const timestamp = now();
  const updated = await service.from("integration_setup_sessions").update({
    session_status: "waiting_for_user",
    step_status: "waiting_for_user",
    requires_user_action: true,
    user_action_required: true,
    user_action_type: actionType,
    human_takeover_reason: step.description,
    last_heartbeat_at: timestamp,
    updated_at: timestamp,
  }).eq("id", session.id).eq("organization_id", session.organization_id);
  if (updated.error) throw new Error(updated.error.message);
  session.session_status = "waiting_for_user";
  session.requires_user_action = true;
  session.user_action_type = actionType;
  await event(service, session, "human.takeover.requested", step.description, { stepKey: step.stepKey, userActionType: actionType });
  await audit(service, session, "human.takeover.requested", { step_key: step.stepKey, user_action_type: actionType });
}

async function failSession(service: Db, session: SetupSession, reason: string, code = "agent_failed") {
  const timestamp = now();
  await service.from("integration_setup_sessions").update({ session_status: "failed", step_status: "failed", failed_at: timestamp, failure_reason: reason.slice(0, 500), requires_user_action: false, user_action_required: false, last_heartbeat_at: timestamp, updated_at: timestamp }).eq("id", session.id).eq("organization_id", session.organization_id);
  session.session_status = "failed";
  await event(service, session, "connection.agent.failed", reason, { resultCode: code });
  await audit(service, session, "connection.agent.failed", { result_code: code });
}

async function advance(service: Db, session: SetupSession, nextStep: number, status = "running") {
  const timestamp = now();
  const result = await service.from("integration_setup_sessions").update({ current_step: nextStep, session_status: status, step_status: status === "completed" ? "completed" : "in_progress", requires_user_action: false, user_action_required: false, user_action_type: null, human_takeover_reason: null, last_heartbeat_at: timestamp, next_attempt_at: null, updated_at: timestamp }).eq("id", session.id).eq("organization_id", session.organization_id);
  if (result.error) throw new Error(result.error.message);
  session.current_step = nextStep;
  session.session_status = status;
  session.requires_user_action = false;
  session.user_action_type = null;
}

async function processSession(service: Db, session: SetupSession) {
  if (isKilled()) return;
  const plan = getCanonicalSetupPlan(session.provider_key);
  if (!plan) return failSession(service, session, "Canonical provider setup plan is unavailable.", "missing_setup_plan");
  if (session.control_mode !== "ai" || session.session_status === "paused" || session.session_status === "waiting_for_user") return;
  const step = plan.steps[session.current_step];
  if (!step) return failSession(service, session, "Setup plan cursor is invalid.", "invalid_plan_cursor");

  if (step.userInteractionRequired || step.automationMode === "human_only") {
    return setWaitingForUser(service, session, step, step.humanActionType ?? "BUSINESS_DECISION_REQUIRED");
  }

  if (step.type === "NAVIGATE") {
    const runtime = getComputerUseRuntime();
    if (!runtime.available) return setWaitingForUser(service, session, { ...step, description: "Secure cloud browser is not configured. Continue manually with Guide; completed progress is preserved." }, "BUSINESS_DECISION_REQUIRED");
    try {
      let browserSessionId = session.browser_session_id;
      if (!browserSessionId) {
        const browser = await runtime.createSession({ sessionId: session.id, providerKey: plan.providerKey, allowedHosts: plan.allowedHosts, startUrl: step.expectedUrl ?? plan.entryUrl });
        browserSessionId = browser.id;
        const metadata = { ...safeMetadata(session.metadata ?? {}), browser_state: browser.state };
        await service.from("integration_setup_sessions").update({ browser_session_id: browser.id, metadata, last_heartbeat_at: now(), updated_at: now() }).eq("id", session.id).eq("organization_id", session.organization_id);
        session.browser_session_id = browser.id;
        session.metadata = metadata;
        await event(service, session, "browser.session.started", "Secure cloud browser session started.", { stepKey: step.stepKey });
        await audit(service, session, "browser.session.started");
      } else {
        await runtime.execute(browserSessionId, { kind: "navigate", url: step.expectedUrl ?? plan.entryUrl, confidence: 1 }, plan);
      }
      await event(service, session, "provider.navigation", `Opened allowlisted ${plan.title} setup domain.`, { stepKey: step.stepKey });
      return advance(service, session, session.current_step + 1);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Computer Use navigation failed.";
      if (session.attempt_count < 3) {
        const delay = Math.min(60, 5 * Math.max(1, session.attempt_count));
        await service.from("integration_setup_sessions").update({ session_status: "retrying", next_attempt_at: new Date(Date.now() + delay * 1000).toISOString(), failure_reason: message.slice(0, 500), last_heartbeat_at: now(), updated_at: now() }).eq("id", session.id).eq("organization_id", session.organization_id);
        return event(service, session, "browser.session.retrying", "Cloud browser action will retry safely.", { resultCode: "browser_retry" });
      }
      return failSession(service, session, message, "browser_failure");
    }
  }

  if (step.type === "OAUTH_START") {
    await event(service, session, "provider.authorization.ready", `${plan.title} secure authorization is ready for Human identity verification.`, { stepKey: step.stepKey });
    return advance(service, session, session.current_step + 1);
  }

  if (step.type === "RESOURCE_DISCOVERY") {
    const connection = await service.from("organization_integrations").select("status,last_verified_at").eq("id", session.connection_id).eq("organization_id", session.organization_id).maybeSingle();
    if (connection.data?.status !== "connected" || !connection.data.last_verified_at) return setWaitingForUser(service, session, { ...step, description: "Provider authorization or verification is still required before resource discovery can continue." }, "LOGIN_REQUIRED");
    const resources = await service.from("integration_resources").select("id,resource_id,resource_name,resource_type").eq("organization_id", session.organization_id).eq("integration_id", session.connection_id).eq("available", true).order("resource_name");
    const rows = resources.data ?? [];
    await event(service, session, "resource.discovered", `Discovered ${rows.length} verified provider resource(s).`, { stepKey: step.stepKey, resourceCount: rows.length });
    if (!rows.length && plan.requiredResourceType) return setWaitingForUser(service, session, { ...step, description: "No matching provider resource is accessible to this account. Check the account/permissions or continue manually." }, "RESOURCE_CHOICE_REQUIRED");
    const metadata = { ...safeMetadata(session.metadata ?? {}), discovered_resource_count: rows.length, recommended_resource_id: rows.length === 1 ? rows[0].id : null, recommended_resource_name: rows.length === 1 ? rows[0].resource_name : null };
    await service.from("integration_setup_sessions").update({ metadata, last_heartbeat_at: now(), updated_at: now() }).eq("id", session.id).eq("organization_id", session.organization_id);
    session.metadata = metadata;
    return advance(service, session, session.current_step + 1);
  }

  if (step.type === "RESOURCE_SELECTION") {
    const resources = await service.from("integration_resources").select("id,resource_name").eq("organization_id", session.organization_id).eq("integration_id", session.connection_id).eq("available", true).order("resource_name");
    const count = resources.data?.length ?? 0;
    if (session.project_id && count > 0) {
      const description = count === 1 ? `Recommended resource: ${resources.data?.[0]?.resource_name}. Confirm or override before binding.` : `${count} plausible resources were found. Choose the exact project resource.`;
      return setWaitingForUser(service, session, { ...step, description }, "RESOURCE_CHOICE_REQUIRED");
    }
    return advance(service, session, session.current_step + 1);
  }

  if (step.type === "RESOURCE_BINDING") {
    if (!session.project_id) return advance(service, session, session.current_step + 1);
    const binding = await service.from("project_connection_bindings").select("id,binding_status,verified_at").eq("organization_id", session.organization_id).eq("project_id", session.project_id).eq("integration_id", session.connection_id).eq("binding_status", "verified").limit(1).maybeSingle();
    if (!binding.data?.verified_at) return setWaitingForUser(service, session, { ...step, description: "Confirm the exact verified provider resource and capabilities before binding it to this project." }, "RESOURCE_CHOICE_REQUIRED");
    await event(service, session, "project.binding.created", "Verified project resource binding detected.", { stepKey: step.stepKey });
    return advance(service, session, session.current_step + 1);
  }

  if (step.type === "CONNECTION_VERIFY") {
    const connection = await service.from("organization_integrations").select("status,last_verified_at").eq("id", session.connection_id).eq("organization_id", session.organization_id).maybeSingle();
    if (connection.data?.status !== "connected" || !connection.data.last_verified_at) return setWaitingForUser(service, session, { ...step, description: "The provider connection is not verified. Reauthorize or continue manually." }, "CONSENT_REQUIRED");
    if (session.project_id) {
      const binding = await service.from("project_connection_bindings").select("id").eq("organization_id", session.organization_id).eq("project_id", session.project_id).eq("integration_id", session.connection_id).eq("binding_status", "verified").limit(1).maybeSingle();
      if (!binding.data) return setWaitingForUser(service, session, { ...step, description: "Provider access is verified, but the required project resource is not bound yet." }, "RESOURCE_CHOICE_REQUIRED");
    }
    await event(service, session, "connection.verified", "Provider access and required project binding are verified.", { stepKey: step.stepKey });
    await audit(service, session, "connection.verified");
    return advance(service, session, session.current_step + 1, "verifying");
  }

  if (step.type === "COMPLETE") {
    const timestamp = now();
    await service.from("integration_setup_sessions").update({ session_status: "completed", step_status: "completed", completed_at: timestamp, requires_user_action: false, user_action_required: false, user_action_type: null, last_heartbeat_at: timestamp, updated_at: timestamp }).eq("id", session.id).eq("organization_id", session.organization_id);
    session.session_status = "completed";
    await event(service, session, "connection.agent.completed", `${plan.title} connection setup completed with verification evidence.`, { stepKey: step.stepKey });
    await audit(service, session, "connection.agent.completed");
    return;
  }

  return advance(service, session, session.current_step + 1);
}

export async function dispatchConnectionSetupSessions(service: Db, input: { limit?: number } = {}) {
  if (isKilled()) return [];
  const limit = Math.max(1, Math.min(4, input.limit ?? 2));
  await service.rpc("expire_stale_connection_setup_sessions_v1");
  const results: Array<{ sessionId: string; status: string }> = [];
  for (let index = 0; index < limit; index += 1) {
    const claimed = await service.rpc("claim_connection_setup_session_v1");
    if (claimed.error) throw new Error(claimed.error.message);
    const row = Array.isArray(claimed.data) ? claimed.data[0] : claimed.data;
    if (!row?.id) break;
    const session = row as unknown as SetupSession;
    await processSession(service, session);
    const latest = await service.from("integration_setup_sessions").select("session_status").eq("id", session.id).maybeSingle();
    results.push({ sessionId: session.id, status: String(latest.data?.session_status ?? session.session_status) });
  }
  return results;
}

export async function signalConnectionAuthorizationCompleted(client: Db, input: { organizationId: string; connectionId: string; providerKey: string }) {
  const sessions = await client.from("integration_setup_sessions").select(sessionSelect()).eq("organization_id", input.organizationId).eq("connection_id", input.connectionId).eq("automation_mode", "ai").in("session_status", ["waiting_for_user","waiting_for_provider","running","verifying"]).order("created_at", { ascending: false }).limit(1);
  const session = sessions.data?.[0] as unknown as SetupSession | undefined;
  if (!session) return;
  const plan = getCanonicalSetupPlan(input.providerKey);
  if (!plan) return;
  const discoveryIndex = plan.steps.findIndex(step => step.type === "RESOURCE_DISCOVERY");
  const targetStep = discoveryIndex >= 0 ? discoveryIndex : session.current_step + 1;
  await client.from("integration_setup_sessions").update({ current_step: targetStep, session_status: "running", step_status: "in_progress", control_mode: "ai", requires_user_action: false, user_action_required: false, user_action_type: null, human_takeover_reason: null, last_heartbeat_at: now(), updated_at: now() }).eq("id", session.id).eq("organization_id", input.organizationId);
  session.session_status = "running";
  session.current_step = targetStep;
  await event(client, session, "oauth.completed", "Provider authorization completed; AI setup can resume.", {}, "provider");
  await audit(client, session, "oauth.completed");
}

export async function controlConnectionSetupSession(client: Db, input: { organizationId: string; userId: string; sessionId: string; resumeToken?: string; command: "take_control"|"return_control"|"pause"|"resume"|"stop" }) {
  const result = await client.from("integration_setup_sessions").select(sessionSelect()).eq("id", input.sessionId).eq("organization_id", input.organizationId).maybeSingle();
  if (!result.data) throw new Error("Connection setup session not found.");
  const session = result.data as unknown as SetupSession;
  if (["completed","failed","cancelled","expired"].includes(session.session_status)) throw new Error("This setup session is already terminal.");
  if ((input.command === "take_control" || input.command === "return_control") && input.resumeToken) verifyConnectionResumeToken(input.resumeToken, { sessionId: session.id, organizationId: input.organizationId, userId: input.userId });
  if ((input.command === "take_control" || input.command === "return_control") && !input.resumeToken) throw new Error("A valid short-lived resume token is required for browser control transfer.");

  const runtime = getComputerUseRuntime();
  let updates: Record<string, unknown> = { updated_at: now(), last_heartbeat_at: now() };
  let eventType = "connection.agent.resumed";
  let message = "Connection Setup Agent resumed.";

  if (input.command === "take_control") {
    if (!session.browser_session_id || !runtime.available) throw new Error("No secure cloud browser session is available for takeover.");
    await runtime.setControl(session.browser_session_id, "human");
    updates = { ...updates, control_mode: "human", session_status: "waiting_for_user" };
    eventType = "human.control.started";
    message = "Human took control of the secure cloud browser.";
  } else if (input.command === "return_control") {
    if (session.browser_session_id && runtime.available) await runtime.setControl(session.browser_session_id, "ai");
    updates = { ...updates, control_mode: "ai", session_status: "running", requires_user_action: false, user_action_required: false, user_action_type: null, human_takeover_reason: null };
    eventType = "human.control.returned";
    message = "Browser control returned to AI.";
  } else if (input.command === "pause") {
    if (session.browser_session_id && runtime.available) await runtime.setControl(session.browser_session_id, "paused");
    updates = { ...updates, control_mode: "paused", session_status: "paused", paused_at: now() };
    eventType = "connection.agent.paused";
    message = "Connection Setup Agent paused.";
  } else if (input.command === "resume") {
    if (session.browser_session_id && runtime.available) await runtime.setControl(session.browser_session_id, "ai");
    updates = { ...updates, control_mode: "ai", session_status: "running", paused_at: null };
  } else if (input.command === "stop") {
    if (session.browser_session_id && runtime.available) await runtime.closeSession(session.browser_session_id).catch(() => undefined);
    updates = { ...updates, control_mode: "paused", session_status: "cancelled", requires_user_action: false, user_action_required: false, failure_reason: "Stopped by user." };
    eventType = "connection.agent.cancelled";
    message = "Connection setup stopped by the user.";
  }

  const update = await client.from("integration_setup_sessions").update(updates).eq("id", session.id).eq("organization_id", input.organizationId);
  if (update.error) throw new Error(update.error.message);
  await event(client, session, eventType, message, { command: input.command }, "user", input.userId);
  const auditResult = await client.from("audit_events").insert({ organization_id: input.organizationId, actor_type: "user", actor_user_id: input.userId, event_type: eventType, object_type: "connection_setup_session", object_id: session.id, risk_level: "low", payload: { agent_key: CONNECTION_SETUP_AGENT_KEY, connection_id: session.connection_id, provider_key: session.provider_key, project_id: session.project_id, correlation_id: session.correlation_id } });
  if (auditResult.error) throw new Error(auditResult.error.message);
}

export async function getConnectionSetupBrowserView(client: Db, input: { organizationId: string; sessionId: string }) {
  const result = await client.from("integration_setup_sessions").select("browser_session_id").eq("id", input.sessionId).eq("organization_id", input.organizationId).maybeSingle();
  if (!result.data?.browser_session_id) return null;
  const runtime = getComputerUseRuntime();
  if (!runtime.available) return null;
  const browser = await runtime.getSession(result.data.browser_session_id);
  return { viewerUrl: browser.viewerUrl, currentUrl: browser.currentUrl, state: browser.state, controlMode: browser.controlMode, expiresAt: browser.expiresAt };
}

export function explainConnectionSetupQuestion(input: { question: string; providerKey: string; currentStep?: ConnectionSetupStep | null; projectReason?: string | null }) {
  const plan = getCanonicalSetupPlan(input.providerKey);
  if (!plan) return "This provider does not have a canonical setup plan yet.";
  const q = input.question.toLowerCase();
  if (/permission|scope|access/.test(q)) return `RYTHM requests only the capabilities required by this setup plan. ${plan.securityNote}`;
  if (/password|mfa|passkey|captcha|login|sign in/.test(q)) return "Passwords, passkeys, MFA codes and CAPTCHA are Human-only. Enter them only on the provider page; RYTHM does not read or store them.";
  if (/which account|account should/.test(q)) return input.projectReason ? `Use the account that owns the project resource required for: ${input.projectReason}` : "Use the account that owns the exact business resource this project needs. If multiple resources match, RYTHM will stop for your choice.";
  if (/skip|later/.test(q)) return "You can pause or continue manually with Guide. A required connection remains incomplete until provider verification and any required project resource binding both succeed.";
  if (/what are you doing|what.*doing|current/.test(q)) return input.currentStep ? `Current step: ${input.currentStep.title}. ${input.currentStep.description}` : "The agent is waiting for the next canonical setup-plan step.";
  if (/reject|deny|decline/.test(q)) return "If you reject provider consent, RYTHM keeps the connection incomplete and does not fabricate a Connected state. You can retry or continue manually later.";
  return `This setup uses the shared ${plan.title} plan. The agent automates only safe steps and stops for identity, consent, authority or ambiguous business choices.`;
}
