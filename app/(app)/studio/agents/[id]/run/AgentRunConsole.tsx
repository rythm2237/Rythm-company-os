"use client";

import { Fragment, useMemo, useRef, useState, useTransition } from "react";
import { runAgentConsole, uploadAgentAttachment, type ChartSpec, type OutputPreference, type UploadedAttachment } from "./actions";

type Message = {
  id: string;
  role: "user" | "assistant";
  content: string;
  meta?: string;
  responseType?: "text" | "image" | "chart";
  imageDataUrl?: string;
  chartSpec?: ChartSpec;
  resolvedOutput?: string;
  attachments?: UploadedAttachment[];
};

type Props = {
  agentId: string;
  agentName: string;
  roleTitle: string;
  status: string;
  provider: string;
  model: string;
};

type OutputOption = { value: OutputPreference | "video"; label: string; hint: string; disabled?: boolean };

function id() { return `${Date.now()}-${Math.random().toString(36).slice(2)}`; }

function formatBytes(value: number) {
  if (value < 1024) return `${value} B`;
  if (value < 1024 * 1024) return `${(value / 1024).toFixed(1)} KB`;
  return `${(value / 1024 / 1024).toFixed(1)} MB`;
}

function outputOptions(roleTitle: string): OutputOption[] {
  const role = roleTitle.toLowerCase();
  const designer = /design|designer|creative|brand|ui|ux|art|طراح/.test(role);
  const analyst = /analyst|analytics|finance|cfo|data|business intelligence|تحلیل|آنالیز/.test(role);
  if (designer) return [
    { value: "auto", label: "Auto", hint: "RYTHM decides from your request" },
    { value: "text", label: "Discuss", hint: "Conversation, critique or advice" },
    { value: "image", label: "Image", hint: "Generate a finished visual" },
    { value: "mockup", label: "UI / Mockup", hint: "Generate a high-fidelity design" },
    { value: "video", label: "Video", hint: "Video generation is the next capability", disabled: true },
  ];
  if (analyst) return [
    { value: "auto", label: "Auto", hint: "RYTHM decides from your request" },
    { value: "text", label: "Analysis", hint: "Reasoning and recommendations" },
    { value: "line-chart", label: "Line chart", hint: "Best for trends over time" },
    { value: "bar-chart", label: "Bar chart", hint: "Best for comparisons" },
    { value: "report", label: "Report", hint: "Structured analytical report" },
  ];
  return [
    { value: "auto", label: "Auto", hint: "RYTHM decides from your request" },
    { value: "text", label: "Text", hint: "Conversation or written deliverable" },
    { value: "image", label: "Image", hint: "Generate a visual when useful" },
    { value: "report", label: "Report", hint: "Structured professional report" },
  ];
}

function RichText({ content }: { content: string }) {
  const lines = content.split("\n");
  return <div style={{ display: "grid", gap: ".42rem", lineHeight: 1.65 }}>
    {lines.map((raw, index) => {
      const line = raw.trimEnd();
      if (!line.trim()) return <div key={index} style={{ height: ".3rem" }} />;
      if (line.startsWith("### ")) return <h4 key={index} style={{ margin: ".5rem 0 0" }}>{line.slice(4)}</h4>;
      if (line.startsWith("## ")) return <h3 key={index} style={{ margin: ".65rem 0 0" }}>{line.slice(3)}</h3>;
      if (line.startsWith("# ")) return <h2 key={index} style={{ margin: ".75rem 0 0" }}>{line.slice(2)}</h2>;
      if (/^[-*]\s+/.test(line)) return <div key={index} style={{ paddingLeft: "1rem" }}>• {line.replace(/^[-*]\s+/, "")}</div>;
      if (/^\d+\.\s+/.test(line)) return <div key={index} style={{ paddingLeft: "1rem" }}>{line}</div>;
      if (line.startsWith("```")) return null;
      return <p key={index} style={{ margin: 0, whiteSpace: "pre-wrap" }}>{line}</p>;
    })}
  </div>;
}

function AttachmentChips({ files }: { files: UploadedAttachment[] }) {
  if (!files.length) return null;
  return <div style={{ display: "flex", flexWrap: "wrap", gap: ".45rem", marginTop: ".55rem" }}>
    {files.map((file) => <span key={file.id} style={{ border: "1px solid rgba(110,120,140,.25)", borderRadius: 999, padding: ".34rem .6rem", fontSize: ".78rem", background: "rgba(255,255,255,.56)" }}>📎 {file.filename} · {formatBytes(file.sizeBytes)}</span>)}
  </div>;
}

function ChartArtifact({ spec }: { spec: ChartSpec }) {
  const width = 820, height = 380, left = 64, right = 24, top = 30, bottom = 72;
  const values = spec.points.map((point) => point.value);
  const min = Math.min(0, ...values), max = Math.max(0, ...values), range = max - min || 1;
  const plotWidth = width - left - right, plotHeight = height - top - bottom;
  const y = (value: number) => top + plotHeight - ((value - min) / range) * plotHeight;
  const x = (index: number) => left + (spec.points.length === 1 ? plotWidth / 2 : (index / (spec.points.length - 1)) * plotWidth);
  const baseline = y(0), linePoints = spec.points.map((point, index) => `${x(index)},${y(point.value)}`).join(" ");
  const barSlot = plotWidth / spec.points.length, barWidth = Math.max(10, Math.min(52, barSlot * .58));
  return <div style={{ border: "1px solid rgba(110,120,140,.22)", borderRadius: 16, padding: "1rem", background: "rgba(255,255,255,.72)", overflowX: "auto" }}>
    <div style={{ minWidth: 640 }}>
      <h3 style={{ margin: "0 0 .25rem" }}>{spec.title}</h3>
      {spec.yLabel ? <p style={{ margin: "0 0 .75rem", opacity: .65, fontSize: ".84rem" }}>{spec.yLabel}</p> : null}
      <svg viewBox={`0 0 ${width} ${height}`} role="img" aria-label={spec.title} style={{ width: "100%", height: "auto", display: "block" }}>
        {[0, .25, .5, .75, 1].map((ratio) => { const value = min + range * ratio; const yy = y(value); return <Fragment key={ratio}><line x1={left} x2={width-right} y1={yy} y2={yy} stroke="currentColor" opacity="0.09"/><text x={left-10} y={yy+4} textAnchor="end" fontSize="12" fill="currentColor" opacity="0.6">{Number(value.toFixed(1)).toLocaleString()}</text></Fragment>; })}
        <line x1={left} x2={width-right} y1={baseline} y2={baseline} stroke="currentColor" opacity="0.22" />
        {spec.type === "line" ? <><polyline points={linePoints} fill="none" stroke="currentColor" strokeWidth="3" strokeLinejoin="round" strokeLinecap="round" />{spec.points.map((point,index)=><circle key={point.label} cx={x(index)} cy={y(point.value)} r="5" fill="currentColor" />)}</> : spec.points.map((point,index)=>{ const yy=y(Math.max(point.value,0)); const h=Math.abs(y(point.value)-baseline); return <rect key={point.label} x={left+index*barSlot+(barSlot-barWidth)/2} y={point.value>=0?yy:baseline} width={barWidth} height={Math.max(2,h)} rx="5" fill="currentColor" opacity="0.82"/>; })}
        {spec.points.map((point,index)=>{ const every=spec.points.length>12?2:1; if(index%every!==0&&index!==spec.points.length-1)return null; const xx=spec.type==="bar"?left+index*barSlot+barSlot/2:x(index); return <text key={`${point.label}-label`} x={xx} y={height-38} textAnchor="middle" fontSize="11" fill="currentColor" opacity="0.68">{point.label.slice(0,14)}</text>; })}
        {spec.xLabel ? <text x={left+plotWidth/2} y={height-10} textAnchor="middle" fontSize="12" fill="currentColor" opacity="0.6">{spec.xLabel}</text> : null}
      </svg>
      {spec.insight ? <p style={{ margin: ".65rem 0 0", fontWeight: 600 }}>Insight: {spec.insight}</p> : null}
    </div>
  </div>;
}

export default function AgentRunConsole({ agentId, agentName, roleTitle, status, provider, model }: Props) {
  const [messages, setMessages] = useState<Message[]>([]);
  const [prompt, setPrompt] = useState("");
  const [mode, setMode] = useState<"chat" | "task">("task");
  const [outputPreference, setOutputPreference] = useState<OutputPreference>("auto");
  const [attachments, setAttachments] = useState<UploadedAttachment[]>([]);
  const [uploading, setUploading] = useState(false);
  const [error, setError] = useState("");
  const [isPending, startTransition] = useTransition();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const transcript = useMemo(() => messages.map(({ role, content }) => ({ role, content })), [messages]);
  const options = useMemo(() => outputOptions(roleTitle), [roleTitle]);

  async function onFilesSelected(files: FileList | null) {
    if (!files?.length) return;
    const remaining = Math.max(0, 4 - attachments.length);
    const selected = Array.from(files).slice(0, remaining);
    if (!selected.length) { setError("You can attach up to 4 files to one message."); return; }
    setUploading(true); setError("");
    try {
      const uploaded: UploadedAttachment[] = [];
      for (const file of selected) {
        const formData = new FormData();
        formData.set("agentId", agentId);
        formData.set("file", file);
        const result = await uploadAgentAttachment(formData);
        if (!result.ok) { setError(result.error); continue; }
        uploaded.push(result.attachment);
      }
      if (uploaded.length) setAttachments((current) => [...current, ...uploaded].slice(0, 4));
    } finally {
      setUploading(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  }

  function submit() {
    const value = prompt.trim();
    if (!value || isPending || uploading) return;
    setError(""); setPrompt("");
    const usedAttachments = [...attachments];
    setMessages((current) => [...current, { id: id(), role: "user", content: value, attachments: usedAttachments }]);
    startTransition(async () => {
      const result = await runAgentConsole({ agentId, prompt: value, mode, outputPreference: mode === "chat" ? "text" : outputPreference, messages: transcript, attachmentIds: usedAttachments.map((file) => file.id) });
      if (!result.ok) { setError(result.error); return; }
      setAttachments([]);
      setMessages((current) => [...current, {
        id: id(), role: "assistant", content: result.response, responseType: result.responseType,
        imageDataUrl: "imageDataUrl" in result ? result.imageDataUrl : undefined,
        chartSpec: "chartSpec" in result ? result.chartSpec : undefined,
        resolvedOutput: result.resolvedOutput,
        meta: `${result.provider} · ${result.model} · ${(result.latencyMs / 1000).toFixed(1)}s · ${result.resolvedOutput} · external actions disabled`,
      }]);
    });
  }

  return <div style={{ display: "grid", gap: "1rem" }}>
    <section className="panel" style={{ margin: 0 }}>
      <p className="eyebrow">ADAPTIVE AGENT WORKSPACE</p>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "start", gap: "1rem", flexWrap: "wrap" }}>
        <div><h2 style={{ marginBottom: ".2rem" }}>{agentName}</h2><p style={{ margin: 0 }}>{roleTitle}</p></div>
        <div style={{ textAlign: "right", fontSize: ".88rem", opacity: .78 }}><div>Status: <strong>{status}</strong></div><div>Brain: <strong>{provider}</strong> · {model}</div></div>
      </div>
      <p style={{ marginBottom: 0 }}>Talk naturally, attach reference material when useful, and let RYTHM choose the output on <strong>Auto</strong>. Uploaded files are retained as part of this Agent&apos;s working memory.</p>
    </section>

    <section className="panel" style={{ margin: 0 }}>
      <div style={{ display: "flex", gap: ".65rem", flexWrap: "wrap", marginBottom: "1rem" }}>
        <button type="button" onClick={() => setMode("task")} aria-pressed={mode === "task"}>{mode === "task" ? "✓ " : ""}Task</button>
        <button type="button" onClick={() => setMode("chat")} aria-pressed={mode === "chat"}>{mode === "chat" ? "✓ " : ""}Chat</button>
        {messages.length > 0 ? <button type="button" onClick={() => { setMessages([]); setError(""); }}>Clear session</button> : null}
      </div>

      {messages.length === 0 ? <div style={{ padding: ".75rem 0 1.15rem" }}><h3>Work with {agentName}</h3><p>Ask a question, request advice, give a task, or attach a spreadsheet, document, image, or reference file. The Agent will inspect attached material before responding.</p></div> :
        <div aria-live="polite" style={{ display: "grid", gap: ".95rem", marginBottom: "1.25rem" }}>
          {messages.map((message) => <article key={message.id} className="kpi-card" style={{ maxWidth: "100%", overflow: "hidden" }}>
            <p className="eyebrow">{message.role === "user" ? "YOU" : agentName.toUpperCase()}</p>
            {message.responseType === "image" && message.imageDataUrl ? <div style={{ display: "grid", gap: ".75rem" }}><img src={message.imageDataUrl} alt={`${agentName} generated visual`} style={{ width: "100%", maxHeight: 720, objectFit: "contain", borderRadius: 14, background: "rgba(0,0,0,.035)" }} /><RichText content={message.content} /></div> :
              message.responseType === "chart" && message.chartSpec ? <div style={{ display: "grid", gap: ".75rem" }}><ChartArtifact spec={message.chartSpec} />{message.content && message.content !== message.chartSpec.insight ? <RichText content={message.content} /> : null}</div> : <RichText content={message.content} />}
            <AttachmentChips files={message.attachments ?? []} />
            {message.meta ? <p style={{ marginTop: ".8rem", opacity: .6, fontSize: ".8rem" }}>{message.meta}</p> : null}
          </article>)}
        </div>}

      <label style={{ display: "grid", gap: ".5rem" }}>
        {mode === "task" ? `Give ${agentName} a task` : `Message ${agentName}`}
        <textarea rows={6} value={prompt} onChange={(event) => setPrompt(event.target.value)} placeholder={mode === "task" ? "Describe the result you want. Attach supporting files if useful…" : "Ask a question, discuss an idea, or attach context…"} maxLength={12000} />
      </label>

      <div style={{ marginTop: ".75rem", padding: ".75rem", border: "1px dashed rgba(110,120,140,.34)", borderRadius: 14, background: "rgba(255,255,255,.32)" }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}>
          <div><strong style={{ fontSize: ".88rem" }}>References</strong><div style={{ opacity: .62, fontSize: ".78rem", marginTop: ".15rem" }}>Optional · up to 4 files · 12 MB each · files become part of Agent memory</div></div>
          <button type="button" onClick={() => fileInputRef.current?.click()} disabled={uploading || attachments.length >= 4}>{uploading ? "Uploading…" : "+ Attach files"}</button>
          <input ref={fileInputRef} type="file" multiple hidden onChange={(event) => onFilesSelected(event.target.files)} accept="image/*,.pdf,.csv,.txt,.md,.json,.xml,.xlsx,.xls,.xlsm,.doc,.docx,.ppt,.pptx" />
        </div>
        {attachments.length ? <div style={{ display: "grid", gap: ".45rem", marginTop: ".65rem" }}>{attachments.map((file) => <div key={file.id} style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: ".75rem", padding: ".5rem .6rem", borderRadius: 10, background: "rgba(110,120,140,.08)" }}><span style={{ overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>📎 {file.filename} <span style={{ opacity: .55 }}>· {formatBytes(file.sizeBytes)}</span></span><button type="button" onClick={() => setAttachments((current) => current.filter((item) => item.id !== file.id))} style={{ padding: ".28rem .5rem" }}>Remove</button></div>)}</div> : null}
      </div>

      {mode === "task" ? <div style={{ marginTop: ".85rem" }}>
        <div style={{ display: "flex", alignItems: "baseline", justifyContent: "space-between", gap: ".75rem", flexWrap: "wrap" }}><strong style={{ fontSize: ".88rem" }}>Output</strong><span style={{ opacity: .62, fontSize: ".78rem" }}>Optional — Auto is recommended</span></div>
        <div style={{ display: "flex", gap: ".55rem", flexWrap: "wrap", marginTop: ".5rem" }}>{options.map((option) => <button key={option.value} type="button" disabled={option.disabled} aria-pressed={outputPreference === option.value} title={option.hint} onClick={() => !option.disabled && setOutputPreference(option.value as OutputPreference)}>{outputPreference === option.value ? "✓ " : ""}{option.label}</button>)}</div>
      </div> : null}

      {error ? <p className="form-error" role="alert" style={{ marginTop: ".75rem" }}>{error}</p> : null}
      <div style={{ display: "flex", alignItems: "center", gap: ".75rem", flexWrap: "wrap", marginTop: ".9rem" }}>
        <button type="button" onClick={submit} disabled={!prompt.trim() || isPending || uploading}>{isPending ? "Agent is working…" : mode === "task" ? "Run Agent" : "Send message"}</button>
        <span style={{ opacity: .65, fontSize: ".8rem" }}>{attachments.length ? `${attachments.length} file(s) will be read with this message.` : "No files attached."}</span>
      </div>
    </section>
  </div>;
}
