"use client";

import { useState } from "react";
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

async function postMeetingTurn(sessionId: string) {
  let lastNetworkError: unknown = null;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      return await jsonPost("/api/meetings/deliberate",{sessionId});
    } catch (cause) {
      lastNetworkError = cause;
      const isNetworkFailure = cause instanceof TypeError || (cause instanceof Error && cause.message === "Failed to fetch");
      if (!isNetworkFailure || attempt === 3) throw cause;
      await delay(900 * attempt);
    }
  }
  throw lastNetworkError instanceof Error ? lastNetworkError : new Error("Meeting runtime could not be reached.");
}

export default function DeliberationConsole({ sessionId, meetingStatus, initialStatus, initialMessages, initialError }: Props) {
  const router = useRouter();
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

  const runMeeting = async () => {
    setRunning(true);
    setError("");
    setProgressText("Opening governed agent deliberation…");
    try {
      for (let step = 0; step < 40; step += 1) {
        const payload = await postMeetingTurn(sessionId);
        if (payload.content) {
          setMessages((current) => [...current, {
            turnIndex: Number(payload.turnIndex ?? current.length + 1), roundNo: Number(payload.roundNo ?? 1), messageType: String(payload.phase ?? "position"), content: String(payload.content), speakerCode: String(payload.speaker?.code ?? "B-001"), speakerName: String(payload.speaker?.name ?? "Executive Orchestrator"), speakerRole: String(payload.speaker?.role ?? "Meeting synthesis"),
          }]);
        }
        setStatus(String(payload.status ?? "running"));
        if (payload.status === "completed") {
          setProgressText("Deliberation complete. Human CEO decision is now required.");
          router.refresh();
          return;
        }
        const remaining = Number(payload.remainingTurns ?? 0);
        setProgressText(`${payload.speaker?.code ?? "Agent"} completed ${payload.phase ?? "turn"}. ${remaining} deliberation turns remain before synthesis.`);
        await delay(500);
      }
      throw new Error("Meeting exceeded the maximum client orchestration steps.");
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Meeting execution failed.";
      setError(message === "Failed to fetch" ? "The meeting runtime could not be reached after three attempts. Check the Production runtime configuration or serverless function logs." : message);
      setProgressText("");
      router.refresh();
    } finally { setRunning(false); }
  };

  const requestSummary=async()=>{
    const requestedLanguage=summaryLanguageChoice==="__meeting__"?"":summaryLanguageChoice==="__other__"?customSummaryLanguage.trim():summaryLanguageChoice;
    if(summaryLanguageChoice==="__other__"&&requestedLanguage.length<2){
      setError("Enter the language you want for the meeting summary.");
      return;
    }
    setSummarizing(true);setError("");
    try{
      const payload=await jsonPost("/api/meetings/summarize",{sessionId,summaryLanguage:requestedLanguage});
      setSummary(String(payload.summary??""));
      setSummaryLanguageUsed(String(payload.language??requestedLanguage||"Meeting language"));
      setShowTranscript(false);
    }catch(cause){setError(cause instanceof Error?cause.message:"Meeting summary failed.");}
    finally{setSummarizing(false);}
  };

  const sendCeoContribution=async()=>{
    if(!ceoText.trim()) return;
    setCeoSending(true);setError("");
    try{
      const payload=await jsonPost("/api/meetings/ceo-contribute",{sessionId,content:ceoText});
      setMessages(current=>[...current,{turnIndex:Number(payload.turnIndex??current.length+1),roundNo:Number(payload.roundNo??1),messageType:"ceo_contribution",content:String(payload.content??ceoText),speakerCode:"CEO",speakerName:"Human CEO",speakerRole:"Meeting Chair"}]);
      setCeoText("");setCeoOpen(false);setProgressText("Human CEO contribution added. Subsequent agents will receive it in the meeting context.");
    }catch(cause){setError(cause instanceof Error?cause.message:"CEO contribution could not be added.");}
    finally{setCeoSending(false);}
  };

  const canRun = meetingStatus === "running" && ["ready", "running"].includes(status);
  const canCeoContribute=meetingStatus==="running"&&["ready","running"].includes(status);

  return <section style={{ marginTop: 20 }}>
    <div style={{ display: "flex", justifyContent: "space-between", gap: 12, alignItems: "center", flexWrap: "wrap" }}>
      <div><p className="label">Live transcript</p><h2 style={{ margin: 0 }}>Multi-Agent Deliberation</h2></div>
      <div className="row-meta"><span>Session: {status}</span><b className={status === "completed" ? "state-active" : "state-paused"}>{running ? "Agents speaking…" : status}</b></div>
    </div>

    <div style={{display:"flex",gap:10,flexWrap:"wrap",margin:"12px 0",alignItems:"end"}}>
      {messages.length>1?<div style={{display:"grid",gap:5,minWidth:180}}><label htmlFor="summary-language" style={{fontSize:".78rem",color:"#5d687b",fontWeight:700}}>Summary language</label><select id="summary-language" value={summaryLanguageChoice} onChange={e=>setSummaryLanguageChoice(e.target.value)} disabled={summarizing} style={{padding:"9px 10px",border:"1px solid #cfd6e2",borderRadius:8}}><option value="__meeting__">Meeting language</option><option value="Persian">فارسی — Persian</option><option value="English">English</option><option value="German">Deutsch — German</option><option value="Hungarian">Magyar — Hungarian</option><option value="__other__">Other…</option></select></div>:null}
      {messages.length>1&&summaryLanguageChoice==="__other__"?<div style={{display:"grid",gap:5,minWidth:180}}><label htmlFor="summary-language-other" style={{fontSize:".78rem",color:"#5d687b",fontWeight:700}}>Other language</label><input id="summary-language-other" value={customSummaryLanguage} onChange={e=>setCustomSummaryLanguage(e.target.value)} maxLength={80} placeholder="e.g. French, Arabic" disabled={summarizing} style={{padding:"9px 10px",border:"1px solid #cfd6e2",borderRadius:8}}/></div>:null}
      {messages.length>1?<button type="button" className="secondary-button" onClick={requestSummary} disabled={summarizing}>{summarizing?"Summarizing…":summary?"Regenerate summary":"Summarize meeting"}</button>:null}
      {summary?<button type="button" className="secondary-button" onClick={()=>setShowTranscript(v=>!v)}>{showTranscript?"Hide full transcript":"Open full transcript"}</button>:null}
      {canCeoContribute?<button type="button" className="secondary-button" onClick={()=>setCeoOpen(v=>!v)} disabled={running}>{ceoOpen?"Close CEO contribution":"Join meeting as Human CEO"}</button>:null}
    </div>

    <p className="security-note">Human CEO is invited by default. Participation is optional; final decision authority remains with the Human CEO. External actions remain disabled.</p>
    {ceoOpen?<div style={{border:"1px solid #dfe4ec",borderRadius:12,padding:14,marginBottom:14}}><p className="label">Human CEO contribution</p><textarea value={ceoText} onChange={e=>setCeoText(e.target.value)} maxLength={4000} rows={5} placeholder="Add a question, challenge, instruction, or viewpoint for the agents…" style={{width:"100%",resize:"vertical",padding:12,border:"1px solid #cfd6e2",borderRadius:10}}/><div style={{display:"flex",justifyContent:"space-between",alignItems:"center",gap:10,marginTop:8}}><small>{ceoText.length}/4000</small><button type="button" onClick={sendCeoContribution} disabled={ceoSending||running||ceoText.trim().length<2}>{ceoSending?"Adding…":"Add to meeting transcript"}</button></div></div>:null}

    {meetingStatus !== "running" && ["ready", "running"].includes(status) ? <p className="security-note">Start the governed meeting first. Agent deliberation cannot execute while the meeting is {meetingStatus}.</p> : null}
    {error ? <p className="form-error" role="alert">{error}</p> : null}
    {progressText ? <p className="form-success" role="status">{progressText}</p> : null}

    {summary?<article style={{border:"1px solid #cfd6e2",borderRadius:14,padding:18,background:"#f6f8fc",margin:"14px 0 18px"}}><div style={{display:"flex",justifyContent:"space-between",gap:10,alignItems:"center",flexWrap:"wrap"}}><div><p className="label">Executive summary</p><h3 style={{marginTop:0}}>Decision-focused meeting brief</h3></div><div style={{display:"flex",gap:8,flexWrap:"wrap"}}>{summaryLanguageUsed?<span className="pill">{summaryLanguageUsed}</span>:null}<span className="pill">AI summary · advisory</span></div></div><p style={{whiteSpace:"pre-wrap",lineHeight:1.7,color:"#46536a",marginBottom:0}}>{summary}</p></article>:null}

    {canRun ? <button type="button" onClick={runMeeting} disabled={running} style={{ margin: "12px 0 18px" }}>{running ? "Running governed deliberation…" : status === "running" ? "Continue agent meeting" : "Start agent deliberation"}</button> : null}

    {showTranscript?<div style={{ display: "grid", gap: 12, maxHeight: 720, overflowY: "auto", paddingRight: 4 }} aria-live="polite">
      {messages.length ? messages.map((message, index) => <article key={`${message.turnIndex}-${index}`} style={{ border: "1px solid #dfe4ec", borderRadius: 14, padding: 16, background: message.messageType === "synthesis" ? "#f3f6fb" : message.messageType.startsWith("ceo_")?"#fff9ea":"#fff" }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 10, flexWrap: "wrap" }}><div><strong>{message.speakerCode} · {message.speakerName}</strong><span style={{ display: "block", color: "#717b8e", fontSize: ".82rem", marginTop: 3 }}>{message.speakerRole}</span></div><span className="pill">{message.messageType} · round {message.roundNo}</span></div>
        <p style={{ whiteSpace: "pre-wrap", lineHeight: 1.65, color: "#46536a", marginBottom: 0 }}>{message.content}</p>
      </article>) : <p className="empty-state">No agent has spoken yet.</p>}
    </div>:null}
  </section>;
}
