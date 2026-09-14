"use client";

import { FormEvent, MouseEvent, useCallback, useState } from "react";

type AgentInfo={id?:string;agent_code?:string;display_name?:string|null;name?:string;role_title?:string};
type DiscussionMessage={id:string;speaker_type:"ceo"|"agent"|"system";content:string;created_at:string;agents?:AgentInfo|AgentInfo[]|null};
type ApiPayload={ok?:boolean;error?:string;approvalStatus?:string;messages?:DiscussionMessage[];responder?:{id:string;code:string;name:string;role:string}};
type Advice={recommendation:string;confidence:string;summary:string;rationale:string;benefits:string[];risks:string[];missingInformation:string[];alternative:string|null;changeFactors:string[];suggestedAction:string};
type AdvicePayload={ok?:boolean;error?:string;advice?:Advice;correlationId?:string};

type Props={projectId:string;approvalId:string;disabled?:boolean};

function agentFrom(value:DiscussionMessage["agents"]){return Array.isArray(value)?value[0]??null:value??null;}
function time(value:string){try{return new Intl.DateTimeFormat(undefined,{hour:"2-digit",minute:"2-digit"}).format(new Date(value));}catch{return "";}}

export function ApprovalDecisionDiscussion({projectId,approvalId,disabled=false}:Props){
  const [open,setOpen]=useState(false);
  const [loaded,setLoaded]=useState(false);
  const [messages,setMessages]=useState<DiscussionMessage[]>([]);
  const [input,setInput]=useState("");
  const [busy,setBusy]=useState(false);
  const [error,setError]=useState("");
  const [detailsOpen,setDetailsOpen]=useState(false);
  const [adviceOpen,setAdviceOpen]=useState(false);
  const [advice,setAdvice]=useState<Advice|null>(null);
  const [adviceBusy,setAdviceBusy]=useState(false);
  const [adviceError,setAdviceError]=useState("");

  const load=useCallback(async()=>{
    setError("");
    const response=await fetch(`/api/projects/approval-discussion?projectId=${encodeURIComponent(projectId)}&approvalId=${encodeURIComponent(approvalId)}`,{cache:"no-store"});
    const payload=await response.json() as ApiPayload;
    if(!response.ok||!payload.ok)throw new Error(payload.error||"Decision discussion could not be loaded.");
    setMessages(payload.messages??[]);setLoaded(true);
  },[projectId,approvalId]);

  const toggle=async()=>{
    const next=!open;setOpen(next);setError("");
    if(next&&!loaded){try{await load();}catch(e){setError(e instanceof Error?e.message:"Decision discussion could not be loaded.");}}
  };

  const toggleDetails=(event:MouseEvent<HTMLButtonElement>)=>{
    const next=!detailsOpen;setDetailsOpen(next);
    event.currentTarget.closest(".approval")?.classList.toggle("compactExpanded",next);
  };

  const getAdvice=async()=>{
    const next=!adviceOpen;setAdviceOpen(next);setAdviceError("");
    if(!next||advice||adviceBusy)return;
    setAdviceBusy(true);
    try{
      const response=await fetch("/api/projects/approval-advice",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,approvalId})});
      const payload=await response.json() as AdvicePayload;
      if(!response.ok||!payload.ok||!payload.advice)throw new Error(payload.error||"AI advice is unavailable for this decision.");
      setAdvice(payload.advice);
    }catch(e){setAdviceError(e instanceof Error?e.message:"AI advice is unavailable for this decision.");}
    finally{setAdviceBusy(false);}
  };

  const send=async(event:FormEvent)=>{
    event.preventDefault();
    const message=input.trim();if(message.length<2)return;
    setBusy(true);setError("");
    try{
      const response=await fetch("/api/projects/approval-discussion",{method:"POST",headers:{"content-type":"application/json"},body:JSON.stringify({projectId,approvalId,message})});
      const payload=await response.json() as ApiPayload;
      if(!response.ok||!payload.ok)throw new Error(payload.error||"The project team could not answer this question.");
      setInput("");
      await load();
    }catch(e){setError(e instanceof Error?e.message:"The project team could not answer this question.");}
    finally{setBusy(false);}
  };

  return <div className="decisionDiscussion" data-approval-id={approvalId}>
    <style jsx global>{`
      .approval:not(.compactExpanded)>p,.approval:not(.compactExpanded)>.note{display:none!important}
      .approval:not(.compactExpanded){padding-bottom:13px!important}
    `}</style>
    <style jsx>{`
      .decisionDiscussion{margin:10px 0}.quickActions{display:grid;grid-template-columns:1fr 1fr 1fr;gap:7px}.toggle,.ai,.details{display:flex;align-items:center;justify-content:center;gap:7px;border-radius:10px;padding:9px 8px;font-weight:850;font-size:10px;cursor:pointer}.toggle{border:1px solid rgba(86,204,255,.2);background:rgba(39,126,174,.09);color:#a9eaff}.ai{border:1px solid rgba(146,116,255,.28);background:linear-gradient(135deg,rgba(92,70,255,.16),rgba(57,202,255,.09));color:#d8d0ff}.details{border:1px solid rgba(255,255,255,.1);background:rgba(255,255,255,.045);color:#aebdca}.toggle:hover:not(:disabled),.ai:hover:not(:disabled),.details:hover:not(:disabled){filter:brightness(1.15)}button:disabled{opacity:.45;cursor:not-allowed}.panel,.advicePanel{margin-top:9px;padding:11px;border:1px solid rgba(79,195,244,.16);background:rgba(2,9,20,.64);border-radius:13px}.advicePanel{border-color:rgba(141,111,255,.24);background:linear-gradient(145deg,rgba(25,17,54,.78),rgba(2,10,21,.76))}.adviceHead{display:flex;align-items:center;justify-content:space-between;gap:8px}.adviceHead strong{font-size:12px;color:#f0ebff}.recommendation{display:inline-flex;margin-top:9px;padding:6px 8px;border-radius:999px;background:rgba(97,237,190,.1);border:1px solid rgba(97,237,190,.2);font:850 9px ui-monospace,monospace;letter-spacing:.04em;color:#8ff4d2}.confidence{font:750 9px ui-monospace,monospace;color:#9ca9c9}.adviceSummary{margin:9px 0 0!important;color:#e1e9f7!important;font-size:11px!important;line-height:1.55!important}.why{margin-top:9px;padding-top:9px;border-top:1px solid rgba(255,255,255,.07)}.why b{font-size:10px;color:#bcaeff}.why p{margin:4px 0 0!important;font-size:10px!important;color:#8fa4bb!important;line-height:1.5!important}.miniList{margin:8px 0 0;padding-left:17px;color:#9bb0c5;font-size:10px;line-height:1.45}.suggested{margin-top:9px;padding:8px 9px;border-radius:9px;background:rgba(89,218,191,.07);border:1px solid rgba(89,218,191,.14);font-size:10px;color:#b9f5e5}.hint{margin:0 0 9px!important;color:#6f91a8!important;font-size:10px!important}.thread{display:flex;flex-direction:column;gap:8px;max-height:270px;overflow:auto;padding-right:2px}.bubble{padding:9px 10px;border-radius:11px;border:1px solid rgba(255,255,255,.07);background:rgba(255,255,255,.035)}.bubble.ceo{margin-left:26px;background:rgba(69,98,255,.12);border-color:rgba(95,119,255,.2)}.bubble.agent{margin-right:26px;background:rgba(41,198,174,.08);border-color:rgba(68,222,198,.15)}.meta{display:flex;justify-content:space-between;gap:8px;margin-bottom:4px;font:750 9px ui-monospace,SFMono-Regular,Menlo,monospace;letter-spacing:.04em;color:#74a7bd}.text{white-space:pre-wrap;font-size:11px;line-height:1.55;color:#d7eaf3}.composer{margin-top:9px}.composer textarea{box-sizing:border-box;width:100%;min-height:64px;padding:10px;border-radius:10px;background:rgba(0,6,14,.8);border:1px solid rgba(92,175,220,.16);color:#ecfbff;resize:vertical;outline:none}.composer textarea:focus{border-color:rgba(70,221,255,.45);box-shadow:0 0 0 3px rgba(46,194,255,.06)}.composer button{margin-top:7px;border:0;border-radius:9px;padding:8px 11px;background:linear-gradient(135deg,#5ba8ff,#6e65ff);color:white;font-weight:850;font-size:10px;cursor:pointer}.composer button:disabled{opacity:.45;cursor:progress}.error{margin:8px 0 0!important;padding:7px 8px;border-radius:8px;background:rgba(255,75,98,.08);border:1px solid rgba(255,75,98,.18);color:#ffc1cb!important;font-size:10px!important}.empty{padding:8px 0;color:#67869b;font:600 10px ui-monospace,monospace}@media(max-width:520px){.quickActions{grid-template-columns:1fr}}
    `}</style>
    <div className="quickActions"><button type="button" className="ai" onClick={()=>void getAdvice()} disabled={disabled||adviceBusy}>{adviceBusy?"AI reviewing…":adviceOpen?"Close AI advice":"✦ AI Advice"}</button><button type="button" className="toggle" onClick={()=>void toggle()} disabled={disabled}>{open?"Close discussion":"Ask / Discuss"}</button><button type="button" className="details" onClick={toggleDetails} disabled={disabled}>{detailsOpen?"Hide details":"Details"}</button></div>
    {adviceOpen?<div className="advicePanel">{adviceBusy?<div className="empty">Independent AI advisor is reviewing the project context, evidence, risk and alternatives…</div>:advice?<><div className="adviceHead"><strong>AI Decision Advisor</strong><span className="confidence">Confidence · {advice.confidence}</span></div><span className="recommendation">{advice.recommendation}</span><p className="adviceSummary">{advice.summary}</p><div className="why"><b>Why</b><p>{advice.rationale}</p></div>{advice.risks.length?<><div className="why"><b>Main risks</b></div><ul className="miniList">{advice.risks.slice(0,3).map((item,index)=><li key={index}>{item}</li>)}</ul></>:null}{advice.missingInformation.length?<><div className="why"><b>Missing information</b></div><ul className="miniList">{advice.missingInformation.slice(0,3).map((item,index)=><li key={index}>{item}</li>)}</ul></>:null}<div className="suggested"><b>Suggested CEO action:</b> {advice.suggestedAction}</div></>:null}{adviceError?<p className="error">{adviceError}</p>:null}</div>:null}
    {open?<div className="panel">
      <p className="hint">Ask the responsible project agent before deciding. This conversation does not approve or reject the request; the gate stays pending until you make an explicit decision.</p>
      <div className="thread">{messages.length?messages.map(message=>{const agent=agentFrom(message.agents);const speaker=message.speaker_type==="ceo"?"You · Human CEO":message.speaker_type==="agent"?`${agent?.display_name??agent?.name??agent?.agent_code??"Project agent"}${agent?.role_title?` · ${agent.role_title}`:""}`:"System";return <div className={`bubble ${message.speaker_type}`} key={message.id}><div className="meta"><span>{speaker}</span><span>{time(message.created_at)}</span></div><div className="text">{message.content}</div></div>}):loaded?<div className="empty">No discussion yet. Ask the first question about this decision.</div>:<div className="empty">Loading discussion…</div>}</div>
      <form className="composer" onSubmit={send}><textarea value={input} onChange={e=>setInput(e.target.value)} placeholder="Ask why this is needed, what the risk is, what happens if you reject it, or request an alternative…" maxLength={4000} disabled={busy||disabled}/><button disabled={busy||disabled||input.trim().length<2}>{busy?"Agent is responding…":"Send question"}</button></form>
      {error?<p className="error">{error}</p>:null}
    </div>:null}
  </div>;
}
