"use client";

import { useFormStatus } from "react-dom";

export default function PendingBenchmarkButton() {
  const { pending } = useFormStatus();

  return <div aria-live="polite">
    <button type="submit" disabled={pending} aria-disabled={pending} style={{opacity:pending?.72:1,cursor:pending?"wait":"pointer",width:"100%"}}>
      {pending ? "Benchmark running…" : "Run benchmark"}
    </button>
    {pending ? <div style={{marginTop:12}}>
      <div style={{height:7,borderRadius:999,background:"#e7ebf4",overflow:"hidden"}}>
        <div className="assessment-progress-bar" style={{height:"100%",width:"45%",borderRadius:999,background:"#5f6ff2"}} />
      </div>
      <p className="security-note" style={{marginTop:8}}>Assessment is running. Keep this page open; the button is disabled until the result returns.</p>
    </div> : null}
  </div>;
}
