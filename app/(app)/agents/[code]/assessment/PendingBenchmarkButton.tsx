"use client";

import { useFormStatus } from "react-dom";

export default function PendingBenchmarkButton() {
  const { pending } = useFormStatus();

  return <div aria-live="polite">
    <button type="submit" disabled={pending} aria-disabled={pending} style={{opacity:pending?.72:1,cursor:pending?"wait":"pointer",width:"100%"}}>
      {pending ? "Benchmark running…" : "Run benchmark"}
    </button>
    {pending ? <div style={{marginTop:12}}>
      <div style={{height:7,borderRadius:999,background:"#e7ebf4",overflow:"hidden",position:"relative"}}>
        <div className="assessment-progress-bar" style={{position:"absolute",insetBlock:0,width:"42%",borderRadius:999,background:"#5f6ff2"}} />
      </div>
      <p className="security-note" style={{marginTop:8}}>Assessment is running. Keep this page open; duplicate submissions are disabled until the result returns.</p>
      <style jsx>{`
        .assessment-progress-bar { animation: assessment-progress 1.25s ease-in-out infinite alternate; }
        @keyframes assessment-progress { from { left: 0; } to { left: 58%; } }
        @media (prefers-reduced-motion: reduce) { .assessment-progress-bar { animation: none; left: 29%; } }
      `}</style>
    </div> : null}
  </div>;
}
