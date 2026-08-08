"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";

type TranscriptMessage = {
  id?: string;
  turnIndex: number;
  roundNo: number;
  messageType: string;
  content: string;
  speakerCode: string;
  speakerName: string;
  speakerRole?: string;
};

type LegalReview = {
  id?: string;
  status?: string;
  outcome?: string|null;
  executive_note?: string|null;
  risk_summary?: string|null;
  conditions?: unknown;
  jurisdictions?: unknown;
  licensed_counsel_required?: boolean;
  estimated_cost_usd?: number;
  error_message?: string|null;
};

type Props = {
  sessionId: string;
  meetingStatus: string;
  initialStatus: string;
  initialMessages: TranscriptMessage[];
  initialError?: string | null;
};

const delay = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function jsonPost(path:string,body:Record<string,unknown>){
  const response=await fetch(path,{method:"POST",headers:{"Content-Type":"application/json",Accept:"application/json"},credentials:"same-origin",cache:"no-store",body:JSON.stringify(body)});
  const raw=await response.text();
  let payload:Record<string,any>={};
  if(raw){try{payload=JSON.parse(raw) as Record<string,any>;}catch{throw new Error(`Meeting runtime returned HTTP ${response.status} with a non-JSON response.`);}}
  if(!response.ok||!payload.ok) throw new Error(String(payload.error??`Request failed with HTTP ${response.status}.`));
  return payload;
}

async function jsonGet(path:string){
  const response=await fetch(path,{method:"GET",headers:{Accept:"application/json"},credentials:"same-origin",cache:"no-store"});
  const raw=await response.text();
  let payload:Record<string,any>={};
  if(raw){try{payload=JSON.parse(raw) as Record<string,any>;}catch{throw new Error(`Meeting runtime returned HTTP ${response.status} with a non-JSON response.`);}}
  if(!response.ok||!payload.ok) throw new Error(String(payload.error??`Request failed with HTTP ${response.status}.`));
  return payload;
}

async function postMeetingTurn(sessionId: string) {
  let lastNetworkError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try { return await jsonPost("/api/meetings/deliberate",{sessionId}); }
    catch (cause) {
      lastNetworkError = cause;
      const isNetworkFailure = cause instanceof TypeError || (cause instanceof Error && cause.message === "Failed to fetch");
      if (!isNetworkFailure || attempt === 3) throw cause;
      await delay(900 * attempt);
    }
  }
  throw lastNetworkError instanceof Error ? lastNetworkError : new Error("Meeting runtime could not be reached.");
}

const voiceSeed=(code:string)=>[...code].reduce((sum,ch)=>sum+ch.charCodeAt(0),0);

export default function DeliberationConsole({ sessionId, meetingStatus, initialStatus, initialMessages, initialError }: Props) {
  const router = useRouter();
  const [meetingState,setMeetingState]=useState(meetingStatus);
  const [status, setStatus] = useState(initialStatus);
  const [messages, setMessages] = useState(initialMessages);
  const [running, setRunning] = useState(false);
  const [error, setError] = useState(initialError ?? "");
  const [progressText, setProgressText] = useState("");
  const [summary,setSummary]=useState("");
  const [summarizing,setSummarizing]=useState(false);
  const [showTranscript,setShowTranscript]=useState(true);
  const [summaryLanguageChoice,setSummaryLanguageChoice]=useState("__meeting__");
  const [customSummaryLanguage,setCustomSummaryLanguage]=useState("");
  const [summaryLanguageUsed,setSummaryLanguageUsed]=useState("");
  const [ceoOpen,setCeoOpen]=useState(false);
  const [ceoText,setCeoText]=useState("");
  const [ceoSending,setCeoSending]=useState(false);
  const [chairClosing,setChairClosing]=useState(false);
  const [dictating,setDictating]=useState(false);
  const [autoVoice,setAutoVoice]=useState(false);
  const recognitionRef=useRef<any>(null);
  const [legalTriage,setLegalTriage]=useState<"pending"|"recommended"|"not_indicated">("pending");
  const [legalTriageReason,setLegalTriageReason]=useState("");
  const [legalTriageRunning,setLegalTriageRunning]=useState(false);
  const [legalReview,setLegalReview]=useState<LegalReview|null>(null);
  const [legalReviewRunning,setLegalReviewRunning]=useState(false);

  const speakMessage=(message:TranscriptMessage)=>{
    if(typeof window==="undefined"||!("speechSynthesis" in window)||message.speakerCode==="CEO") return;
    window.speechSynthesis.cancel();
    const utterance=new SpeechSynthesisUtterance(message.content);
    const voices=window.speechSynthesis.getVoices().filter(v=>/^en/i.test(v.lang));
    if(voices.length) utterance.voice=voices[voiceSeed(message.speakerCode)%voices.length];
    utterance.rate=0.96+(voiceSeed(message.speakerCode)%5)*0.015;
    utterance.pitch=0.92+(voiceSeed(message.speakerCode)%7)*0.025;
    window.speechSynthesis.speak(utterance);
  };

  const startDictation=()=>{
    if(typeof window==="undefined") return;
    const Recognition=(window as any).SpeechRecognition||(window as any).webkitSpeechRecognition;
    if(!Recognition){setError("Voice dictation is not supported by this browser. Chrome/Edge desktop is recommended for the MVP voice input.");return;}
    if(dictating){recognitionRef.current?.stop();return;}
    const recognition=new Recognition();
    recognition.lang="en-US";
    recognition.continuous=true;
    recognition.interimResults=true;
    let finalText="";
    recognition.onstart=()=>setDictating(true);
    recognition.onresult=(event:any)=>{
      let interim="";
      for(let i=event.resultIndex;i<event.results.length;i+=1){
        const text=String(event.results[i][0]?.transcript??"");
        if(event.results[i].isFinal) finalText+=`${text} `; else interim+=text;
      }
      setCeoText(current=>`${current}${current&&!current.endsWith(" ")?" ":""}${finalText}${interim}`.slice(0,4000));
      finalText="";
    };
    recognition.onerror=(event:any)=>{setError(`Voice dictation error: ${String(event.error??"unknown error")}`);setDictating(false);};
    recognition.onend=()=>setDictating(false);
    recognitionRef.current=recognition;
    recognition.start();
  };

  useEffect(()=>{
    if(status!=="completed"||meetingState!=="completed") return;
    let cancelled=false;
    const load=async()=>{
      try{
        const triage=await jsonGet(`/api/meetings/legal-triage?sessionId=${encodeURIComponent(sessionId)}`);
        if(cancelled) return;
        setLegalTriage((triage.status??"pending") as "pending"|"recommended"|"not_indicated");
        setLegalTriageReason(String(triage.reason??""));
        if(triage.status==="pending"){
          setLegalTriageRunning(true);
          const completed=await jsonPost("/api/meetings/legal-triage",{sessionId});
          if(!cancelled){setLegalTriage((completed.status??"pending") as "pending"|"recommended"|"not_indicated");setLegalTriageReason(String(completed.reason??""));}
          setLegalTriageRunning(false);
        }
        const reviewPayload=await jsonGet(`/api/meetings/legal-review?sessionId=${encodeURIComponent(sessionId)}`);
        if(!cancelled) setLegalReview((reviewPayload.review??null) as LegalReview|null);
      }catch(cause){
        if(!cancelled){setLegalTriageRunning(false);setError(cause instanceof Error?cause.message:"Legal governance status could not be loaded.");}
      }
    };
    void load();
    return()=>{cancelled=true;};
  },[sessionId,status,meetingState]);

  const runMeeting = async () => {
    setRunning(true);setError("");setProgressText("Opening governed agent deliberation…");
    try {
      for (let step = 0; step < 40; step += 1) {
        const payload = await postMeetingTurn(sessionId);
        if (payload.content) {
          const nextMessage={turnIndex:Number(payload.turnIndex??messages.length+1),roundNo:Number(payload.roundNo??1),messageType:String(payload.phase??"position"),content:String(payload.content),speakerCode:String(payload.speaker?.code??"B-001"),speakerName:String(payload.speaker?.name??"Executive Orchestrator"),speakerRole:String(payload.speaker?.role??"Meeting synthesis")};
          setMessages(current=>[...current,nextMessage]);
          if(autoVoice) speakMessage(nextMessage);
        }
        setStatus(String(payload.status ?? "running"));
        if (payload.status === "completed") {
          setProgressText("Agent synthesis is complete. The meeting remains open for the Human CEO / Chair. Ask a follow-up or confirm meeting closure.");
          router.refresh();
          return;
        }
        const remaining = Number(payload.remainingTurns ?? 0);
        setProgressText(payload.phase==="chair_follow_up"?"B-001 responded to the Human CEO. Refreshing the executive synthesis next…":`${payload.speaker?.code ?? "Agent"} completed ${payload.phase ?? "turn"}. ${remaining} deliberation turns remain before synthesis.`);
        await delay(500);
      }
      throw new Error("Meeting exceeded the maximum client orchestration steps.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Meeting execution failed.";
      setError(message === "Failed to fetch" ? "The meeting runtime could not be reached after three attempts. Check the Production runtime configuration or serverless function logs." : message);
      setProgressText("");router.refresh();
    } finally { setRunning(false); }
  };

  const requestSummary=async()=>{
    const requestedLanguage=summaryLanguageChoice==="__meeting__"?"":summaryLanguageChoice==="__other__"?customSummaryLanguage.trim():summaryLanguageChoice;
    if(summaryLanguageChoice==="__other__"&&requestedLanguage.length<2){setError("Enter the language you want for the meeting summary.");return;}
    setSummarizing(true);setError("");
    try{const payload=await jsonPost("/api/meetings/summarize",{sessionId,summaryLanguage:requestedLanguage});setSummary(String(payload.summary??""));setSummaryLanguageUsed(String((payload.language??requestedLanguage)||"Meeting language"));setShowTranscript(false);}
    catch(cause){setError(cause instanceof Error?cause.message:"Meeting summary failed.");}
    finally{setSummarizing(false);}
  };

  const sendCeoContribution=async()=>{
    if(!ceoText.trim()) return;
    setCeoSending(true);setError("");
    try{
      const payload=await jsonPost("/api/meetings/ceo-contribute",{sessionId,content:ceoText});
      setMessages(current=>[...current,{turnIndex:Number(payload.turnIndex??current.length+1),roundNo:Number(payload.roundNo??1),messageType:"ceo_contribution",content:String(payload.content??ceoText),speakerCode:"CEO",speakerName:"Human CEO",speakerRole:"Meeting Chair"}]);
      setStatus(String(payload.sessionStatus??status));setCeoText("");setCeoOpen(false);setLegalTriage("pending");setLegalTriageReason("");
      setProgressText("Human CEO contribution added. Select Continue agent meeting so B-001 can answer and refresh the synthesis before closure.");
    }catch(cause){setError(cause instanceof Error?cause.message:"CEO contribution could not be added.");}
    finally{setCeoSending(false);}
  };

  const closeMeeting=async()=>{
    setChairClosing(true);setError("");
    try{await jsonPost("/api/meetings/close",{sessionId});setMeetingState("completed");setProgressText("Meeting closure confirmed by Human CEO / Chair. Legal relevance triage may now proceed.");router.refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:"Meeting could not be closed.");}
    finally{setChairClosing(false);}
  };

  const requestLegalReview=async()=>{
    setLegalReviewRunning(true);setError("");
    try{const payload=await jsonPost("/api/meetings/legal-review",{sessionId});setLegalReview((payload.review??null) as LegalReview|null);setProgressText("A-106 legal review completed and attached to the meeting decision package.");router.refresh();}
    catch(cause){setError(cause instanceof Error?cause.message:"AI legal review failed.");}
    finally{setLegalReviewRunning(false);}
  };

  const canRun = meetingState === "running" && ["ready", "running"].includes(status);
  const canCeoContribute=meetingState==="running"&&["ready","running","completed"].includes(status);
  const awaitingChairClose=meetingState==="running"&&status==="completed";
  const conditions=Array.isArray(legalReview?.conditions)?legalReview?.conditions.map(String):[];
  const jurisdictions=Array.isArray(legalReview?.jurisdictions)?legalReview?.jurisdictions.map(String):[];

  return <section style={{marginTop:20,maxWidth:"100%",minWidth:0,overflowX:"hidden"}}>
    <div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap",minWidth:0}}>
      <div style={{minWidth:0}}><p className="label">Live transcript</p><h2 style={{margin:0}}>Multi-Agent Deliberation</h2></div>
      <div className="row-meta"><span>Session: {status}</span><b className={status==="completed"?"state-active":"state-paused"}>{running?"Agents speaking…":status}</b></div>
    </div>

    <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"12px 0",alignItems:"end",minWidth:0}}>
      {messages.length>1?<div style={{display:"grid",gap:5,minWidth:0,width:180,maxWidth:"100%"}}><label htmlFor="summary-language" style={{fontSize:".78rem",color:"#5d687b",fontWeight:700}}>Summary language</label><select id="summary-language" value={summaryLanguageChoice} onChange={e=>setSummaryLanguageChoice(e.target.value)} disabled={summarizing} style={{padding:"9px 10px",border:"1px solid #cfd6e2",borderRadius:8,maxWidth:"100%"}}><option value="__meeting__">Meeting language</option><option value="Persian">فارسی — Persian</option><option value="English">English</option><option value="German">Deutsch — German</option><option value="Hungarian">Magyar — Hungarian</option><option value="__other__">Other…</option></select></div>:null}
      {messages.length>1&&summaryLanguageChoice==="__other__"?<div style={{display:"grid",gap:5,minWidth:0,width:180,maxWidth:"100%"}}><label htmlFor="summary-language-other" style={{fontSize:".78rem",color:"#5d687b",fontWeight:700}}>Other language</label><input id="summary-language-other" value={customSummaryLanguage} onChange={e=>setCustomSummaryLanguage(e.target.value)} maxLength={80} placeholder="e.g. French, Arabic" disabled={summarizing} style={{padding:"9px 10px",border:"1px solid #cfd6e2",borderRadius:8,maxWidth:"100%",boxSizing:"border-box"}}/></div>:null}
      {messages.length>1?<button type="button" className="secondary-button" onClick={requestSummary} disabled={summarizing}>{summarizing?"Summarizing…":summary?"Regenerate summary":"Summarize meeting"}</button>:null}
      {summary?<button type="button" className="secondary-button" onClick={()=>setShowTranscript(v=>!v)}>{showTranscript?"Hide full transcript":"Open full transcript"}</button>:null}
      {canCeoContribute?<button type="button" className="secondary-button" onClick={()=>setCeoOpen(v=>!v)} disabled={running}>{ceoOpen?"Close CEO contribution":"Join meeting as Human CEO"}</button>:null}
      <label style={{display:"flex",alignItems:"center",gap:7,fontSize:".85rem",color:"#596579"}}><input type="checkbox" checked={autoVoice} onChange={e=>setAutoVoice(e.target.checked)}/> Auto-play agent voice</label>
    </div>

    <p className="security-note">Human CEO is invited by default and is the meeting chair. Agent synthesis never closes the meeting. External actions remain disabled.</p>
    {ceoOpen?<div style={{border:"1px solid #dfe4ec",borderRadius:12,padding:14,marginBottom:14,maxWidth:"100%",minWidth:0,boxSizing:"border-box",overflow:"hidden"}}><p className="label">Human CEO contribution</p><textarea value={ceoText} onChange={e=>setCeoText(e.target.value)} maxLength={4000} rows={5} placeholder="Add a question, challenge, instruction, or viewpoint for the agents…" style={{display:"block",width:"100%",maxWidth:"100%",minWidth:0,boxSizing:"border-box",resize:"vertical",padding:12,border:"1px solid #cfd6e2",borderRadius:10,overflowWrap:"anywhere"}}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginTop:8,flexWrap:"wrap",minWidth:0}}><small>{ceoText.length}/4000</small><div style={{display:"flex",gap:8,flexWrap:"wrap"}}><button type="button" className="secondary-button" onClick={startDictation} disabled={ceoSending||running}>{dictating?"■ Stop voice":"🎙 Dictate"}</button><button type="button" onClick={sendCeoContribution} disabled={ceoSending||running||ceoText.trim().length<2}>{ceoSending?"Adding…":"Add to meeting transcript"}</button></div></div><p className="security-note" style={{marginBottom:0}}>Voice dictation uses the browser speech-recognition capability and remains editable before submission.</p></div>:null}

    {awaitingChairClose?<article style={{border:"1px solid #e4c86b",borderRadius:14,padding:18,background:"#fff9e8",margin:"14px 0 18px",maxWidth:"100%",boxSizing:"border-box"}}><div style={{display:"flex",justifyContent:"space-between",gap:12,alignItems:"center",flexWrap:"wrap"}}><div style={{minWidth:0}}><p className="label">Chair closure gate</p><h3 style={{margin:"0 0 6px"}}>Agent synthesis complete — meeting remains open</h3></div><span className="pill">AWAITING CHAIR CLOSE</span></div><p style={{color:"#596579",lineHeight:1.65}}>The Human CEO may ask another question or add a correction. If a contribution is added, continue the agent meeting so B-001 responds and refreshes the synthesis. Close the meeting only when the chair is satisfied.</p><div style={{display:"flex",gap:10,flexWrap:"wrap"}}><button type="button" className="secondary-button" onClick={()=>setCeoOpen(true)}>Add CEO contribution</button><button type="button" onClick={closeMeeting} disabled={chairClosing}>{chairClosing?"Closing…":"End meeting · Chair confirm"}</button></div></article>:null}

    {meetingState!=="running"&&["ready","running"].includes(status)?<p className="security-note">Start the governed meeting first. Agent deliberation cannot execute while the meeting is {meetingState}.</p>:null}
    {error?<p className="form-error" role="alert">{error}</p>:null}
    {progressText?<p className="form-success" role="status">{progressText}</p>:null}

    {summary?<article style={{border:"1px solid #cfd6e2",borderRadius:14,padding:18,background:"#f6f8fc",margin:"14px 0 18px",maxWidth:"100%",minWidth:0,boxSizing:"border-box"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div style={{minWidth:0}}><p className="label">Executive summary</p><h3 style={{marginTop:0}}>Decision-focused meeting brief</h3></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{summaryLanguageUsed?<span className="pill">{summaryLanguageUsed}</span>:null}<span className="pill">AI summary · advisory</span></div></div><p style={{whiteSpace:"pre-wrap",lineHeight:1.7,color:"#46536a",marginBottom:0,overflowWrap:"anywhere"}}>{summary}</p></article>:null}

    {status==="completed"&&meetingState==="completed"?<article style={{border:"1px solid #d9dee8",borderRadius:14,padding:18,background:legalTriage==="recommended"?"#fff8e8":"#f7f9fc",margin:"14px 0 18px",maxWidth:"100%",boxSizing:"border-box"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div><p className="label">Legal relevance check</p><h3 style={{margin:"0 0 6px"}}>B-001 Legal Review Trigger</h3></div><span className="pill">{legalTriageRunning?"Checking…":legalTriage==="recommended"?"Legal review recommended":legalTriage==="not_indicated"?"Not indicated":"Pending"}</span></div><p style={{color:"#596579",lineHeight:1.65,marginBottom:12}}>{legalTriageRunning?"B-001 is checking whether the chair-approved meeting package has plausible legal or regulatory implications.":legalTriageReason||"Legal relevance triage is pending."}</p><button type="button" className="secondary-button" onClick={requestLegalReview} disabled={legalReviewRunning||legalTriageRunning}>{legalReviewRunning?"A-106 reviewing…":legalReview?.status==="completed"?"Legal review completed":"Request AI Legal Review"}</button><p className="security-note" style={{marginBottom:0}}>AI legal review is advisory and is not a substitute for licensed jurisdiction-specific counsel.</p></article>:null}

    {legalReview?.status==="completed"?<article style={{border:"1px solid #cfd6e2",borderRadius:14,padding:18,background:"#f5f7fb",margin:"14px 0 18px",maxWidth:"100%",boxSizing:"border-box"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div><p className="label">A-106 · Legal & Regulatory Counsel</p><h3 style={{margin:"0 0 6px"}}>AI Legal Review</h3></div><span className="pill">{legalReview.outcome??"Review completed"}</span></div><p style={{whiteSpace:"pre-wrap",lineHeight:1.65,color:"#46536a",overflowWrap:"anywhere"}}>{legalReview.executive_note}</p>{legalReview.risk_summary?<><p className="label">Risk summary</p><p style={{color:"#596579",lineHeight:1.65,overflowWrap:"anywhere"}}>{legalReview.risk_summary}</p></>:null}{conditions.length?<><p className="label">Conditions</p><ul style={{color:"#596579",lineHeight:1.65}}>{conditions.map((item,index)=><li key={`${item}-${index}`}>{item}</li>)}</ul></>:null}{jurisdictions.length?<p className="security-note">Jurisdiction context: {jurisdictions.join(", ")}</p>:null}{legalReview.licensed_counsel_required?<p className="form-error">Licensed counsel review required before execution of the legally sensitive decision.</p>:null}<p className="security-note" style={{marginBottom:0}}>Advisory AI legal issue-spotting only. This does not constitute formal legal advice or legal approval.</p></article>:null}

    {canRun?<button type="button" onClick={runMeeting} disabled={running} style={{margin:"12px 0 18px"}}>{running?"Running governed deliberation…":status==="running"?"Continue agent meeting":"Start agent deliberation"}</button>:null}

    {showTranscript?<div style={{display:"grid",gap:12,maxHeight:720,overflowY:"auto",overflowX:"hidden",paddingRight:4,minWidth:0,maxWidth:"100%"}} aria-live="polite">{messages.length?messages.map((message,index)=><article key={`${message.turnIndex}-${index}`} style={{border:"1px solid #dfe4ec",borderRadius:14,padding:16,background:message.messageType==="synthesis"?"#f3f6fb":message.messageType.startsWith("ceo_")?"#fff9ea":"#fff",minWidth:0,maxWidth:"100%",boxSizing:"border-box",overflow:"hidden"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,flexWrap:"wrap",minWidth:0}}><div style={{minWidth:0}}><strong>{message.speakerCode} · {message.speakerName}</strong><span style={{display:"block",color:"#717b8e",fontSize:".82rem",marginTop:3}}>{message.speakerRole}</span></div><div style={{display:"flex",gap:8,alignItems:"center",flexWrap:"wrap"}}><span className="pill">{message.messageType} · round {message.roundNo}</span>{message.speakerCode!=="CEO"?<button type="button" className="secondary-button" onClick={()=>speakMessage(message)} style={{padding:"6px 10px"}}>▶ Listen</button>:null}</div></div><p style={{whiteSpace:"pre-wrap",lineHeight:1.65,color:"#46536a",marginBottom:0,overflowWrap:"anywhere",wordBreak:"break-word"}}>{message.content}</p></article>):<p className="empty-state">No agent has spoken yet.</p>}</div>:null}
  </section>;
}
