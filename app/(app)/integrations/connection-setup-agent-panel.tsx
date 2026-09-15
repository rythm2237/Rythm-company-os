import { IntegrationGuideButton } from "./integration-guide-button";
import { askCustomerConnectionAgent, controlCustomerConnectionAgent, startCustomerConnectionAgent } from "./connection-agent-actions";
import { ConnectionFlightDeck } from "./connection-flight-deck";
import type { ProviderSetupPlan } from "@/lib/integrations/connections/setup-plans";

type SessionView={id:string;session_status:string;current_step:number;control_mode:string;requires_user_action:boolean;user_action_type:string|null;human_takeover_reason?:string|null;started_at?:string|null;updated_at?:string|null;metadata?:Record<string,unknown>|null};
type EventView={id:string;event_type:string;safe_message:string|null;created_at:string};
type BrowserView={viewerUrl:string|null;currentUrl:string|null;state:string;controlMode:string;expiresAt:string|null}|null;

function statusLabel(session:SessionView,browser:BrowserView){
  if(session.session_status==="waiting_for_user")return "Waiting for you";
  if(session.session_status==="verifying")return "Verifying";
  if(session.session_status==="completed")return "Completed";
  if(session.session_status==="failed")return "Failed";
  if(session.session_status==="cancelled")return "Stopped";
  if(session.session_status==="expired")return "Expired";
  if(session.session_status==="paused")return "Paused";
  if(session.control_mode==="human")return "You have control";
  if(browser?.viewerUrl&&session.control_mode==="ai")return "Agent operating live";
  if(browser)return "Connecting live workspace";
  if(["queued","starting","retrying"].includes(session.session_status))return "Preparing secure workspace";
  return "Agent processing";
}

export function ConnectionSetupAgentPanel({integrationId,projectId,providerName,providerKey,plan,aiEnabled,rollout,session,events,browser,agentAnswer,openLive=false}:{integrationId:string;projectId?:string;providerName:string;providerKey:string;plan:ProviderSetupPlan|null;aiEnabled:boolean;rollout:string;session:SessionView|null;events:EventView[];browser:BrowserView;agentAnswer?:string;openLive?:boolean}){
  const step=plan&&session?plan.steps[session.current_step]??null:null;
  const terminal=session&&["completed","failed","cancelled","expired"].includes(session.session_status);
  const canStart=Boolean(plan&&aiEnabled&&rollout!=="off"&&(!session||terminal));
  const liveStatus=session?statusLabel(session,browser):aiEnabled?"Ready":"Not enabled";
  return <section className="panel" style={{maxWidth:860,marginTop:18}} data-connection-agent-panel>
    <div className="panel-heading"><div><p className="label">CONNECTION AGENT</p><h2>Do it with AI</h2><p className="subtitle" style={{marginTop:6}}>A governed RYTHM Agent can execute the same canonical setup plan, open a secure live workspace, and stop whenever identity, consent, authority, or an ambiguous choice belongs to you.</p></div><span className={session?.session_status==="completed"?"state-active":"state-paused"}>{liveStatus}</span></div>
    {!session||terminal?<div>
      <p>{plan?.intro??"AI-assisted setup is not available for this provider yet."}</p>
      {session&&terminal?<p className="integration-security-note">Previous Agent session: <strong>{statusLabel(session,browser)}</strong>. Start a new governed session if this connection still needs work.</p>:null}
      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:14}}><IntegrationGuideButton providerKey={providerKey} label="Guide me"/>{canStart?<form action={startCustomerConnectionAgent}><input type="hidden" name="integrationId" value={integrationId}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<button className="primary-button" type="submit">Do it with AI</button></form>:null}</div>
      {plan&&(!aiEnabled||rollout==="off")?<p className="integration-security-note">AI setup exists for this provider but is not enabled in the current rollout. Guide me remains available.</p>:null}
    </div>:<>
      <div className="security-note"><strong>{providerName}</strong><span>{step?`Step ${Math.min(session.current_step+1,plan?.steps.length??1)} of ${plan?.steps.length??1} · ${step.title}`:"Agent session active"}</span><span>{session.requires_user_action&&session.user_action_type?`${session.user_action_type}: ${session.human_takeover_reason??step?.description??"Your action is required."}`:step?.description??liveStatus}</span>{browser?.currentUrl?<span>Current domain: {(()=>{try{return new URL(browser.currentUrl!).hostname;}catch{return "Provider";}})()}</span>:null}</div>
      {session.requires_user_action?<div className="form-warning" style={{marginTop:12}}><strong>YOUR ACTION REQUIRED</strong><div>{session.human_takeover_reason??"Complete the provider-owned identity or consent step. RYTHM will not enter passwords, MFA codes, passkeys or CAPTCHA responses."}</div></div>:null}

      <ConnectionFlightDeck integrationId={integrationId} projectId={projectId} providerName={providerName} providerKey={providerKey} plan={plan} initialSession={session} initialEvents={events} initialBrowser={browser} openInitially={openLive}/>

      <div style={{display:"flex",gap:10,flexWrap:"wrap",marginTop:12}}>
        {!terminal&&session.session_status!=="paused"?<form action={controlCustomerConnectionAgent}><input type="hidden" name="integrationId" value={integrationId}/><input type="hidden" name="sessionId" value={session.id}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<input type="hidden" name="command" value="pause"/><button className="secondary-button" type="submit">Pause</button></form>:null}
        {!terminal&&session.session_status==="paused"?<form action={controlCustomerConnectionAgent}><input type="hidden" name="integrationId" value={integrationId}/><input type="hidden" name="sessionId" value={session.id}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<input type="hidden" name="command" value="resume"/><button className="primary-button" type="submit">Resume</button></form>:null}
        {!terminal?<form action={controlCustomerConnectionAgent}><input type="hidden" name="integrationId" value={integrationId}/><input type="hidden" name="sessionId" value={session.id}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<input type="hidden" name="command" value="stop"/><button className="secondary-button" type="submit">Stop</button></form>:null}
        <IntegrationGuideButton providerKey={providerKey} label="Continue manually with Guide"/>
      </div>
      <form action={askCustomerConnectionAgent} className="stacked-form" style={{marginTop:16}}><input type="hidden" name="integrationId" value={integrationId}/><input type="hidden" name="sessionId" value={session.id}/>{projectId?<input type="hidden" name="projectId" value={projectId}/>:null}<label>Ask Agent<input name="question" placeholder="Why do you need this permission?" maxLength={300}/></label><button className="secondary-button" type="submit">Ask Agent</button></form>
      {agentAnswer?<p className="security-note"><strong>Connection Agent</strong><span>{agentAnswer}</span></p>:null}
      {events.length?<div className="compact-list" style={{marginTop:16}}>{events.slice(0,6).map(event=><div key={event.id}><strong>{event.safe_message??event.event_type}</strong><span>{new Date(event.created_at).toLocaleString()}</span></div>)}</div>:null}
    </>}
    <p className="integration-security-note" style={{marginTop:14}}>{plan?.securityNote??"Guide me remains available when AI setup is unavailable."}</p>
  </section>;
}
