"use client";

type Phase={id?:string;key:string;order:number;title:string;milestone?:string;weight:number;estimatedDuration?:string;status?:string;outcomeProgressPercent?:number|null};
type Roadmap={id:string;version:number;status:string;isBaseline:boolean;title:string;summary?:string;phases?:Phase[]};
type Progress={progressPercent:number;outcomeProgressPercent:number|null;hasApprovedRoadmap:boolean;roadmapVersion:number|null;currentPhase:string|null;nextMilestone:string|null};
type Props={roadmap:Roadmap|null;progress:Progress|null};

const phaseProgress=(phase:Phase)=>{const s=(phase.status??"not_started").toLowerCase();if(["completed","done","validated"].includes(s))return 100;if(["in_progress","running","active"].includes(s))return 52;if(["waiting_for_approval","blocked"].includes(s))return 30;return 0;};
const label=(value:string)=>value.replaceAll("_"," ");

export default function ProjectRoadmapVisual({roadmap,progress}:Props){
  if(!roadmap?.phases?.length)return <div className="roadmapEmpty">No roadmap yet. Run the project to generate a manager-reviewable execution roadmap.</div>;
  const overall=progress?.hasApprovedRoadmap?progress.progressPercent:0;
  return <section className="roadmapVisual" aria-label="Project roadmap">
    <style jsx>{`
      .roadmapVisual{margin-top:16px;border:1px solid #e6eaf0;border-radius:18px;background:linear-gradient(180deg,#fff,#fbfcfe);overflow:hidden}
      .head{display:flex;align-items:center;justify-content:space-between;gap:16px;padding:16px 18px 13px;border-bottom:1px solid #edf0f4}.headMain{min-width:0}.eyebrow{font-size:10px;font-weight:850;letter-spacing:.1em;text-transform:uppercase;color:#6b7280}.head h3{margin:3px 0 0;font-size:18px;line-height:1.25;color:#111827}.overall{flex:0 0 auto;text-align:right}.overall strong{font-size:24px;letter-spacing:-.04em;color:#111827}.overall span{display:block;font-size:10px;color:#6b7280;font-weight:700}
      .track{height:5px;background:#eef1f5}.track>span{display:block;height:100%;background:linear-gradient(90deg,#4f46e5,#2563eb,#06b6d4);transition:width .35s ease}
      .phases{display:grid;grid-auto-flow:column;grid-auto-columns:minmax(205px,1fr);gap:0;overflow-x:auto;scroll-snap-type:x proximity}.phase{position:relative;padding:17px 16px 16px;border-right:1px solid #edf0f4;scroll-snap-align:start;min-height:150px}.phase:last-child{border-right:0}.phaseTop{display:flex;align-items:center;gap:9px}.dot{width:26px;height:26px;border-radius:999px;display:grid;place-items:center;font-size:10px;font-weight:900;background:#f1f3f7;color:#64748b;border:1px solid #e3e7ed}.phase.active .dot{background:#eef2ff;color:#4338ca;border-color:#c7d2fe;box-shadow:0 0 0 4px rgba(79,70,229,.06)}.phase.done .dot{background:#ecfdf5;color:#047857;border-color:#a7f3d0}.phase h4{margin:11px 0 5px;font-size:13px;line-height:1.35;color:#172033}.meta{display:flex;gap:7px;flex-wrap:wrap;font-size:9px;color:#788397}.chip{padding:4px 6px;border-radius:999px;background:#f5f7fa;font-weight:750}.milestone{margin:10px 0 0;font-size:10px;line-height:1.45;color:#667085;min-height:30px}.mini{margin-top:12px;height:4px;background:#edf1f5;border-radius:99px;overflow:hidden}.mini span{display:block;height:100%;background:#5b66e8}.phase.done .mini span{background:#16a34a}.pct{margin-top:6px;display:flex;justify-content:space-between;font-size:9px;color:#8490a3;font-weight:750}.roadmapEmpty{margin-top:14px;border:1px dashed #d7dce5;border-radius:14px;padding:16px;color:#667085;font-size:12px;background:#fbfcfd}
      @media(max-width:760px){.head{padding:14px}.head h3{font-size:16px}.overall strong{font-size:20px}.phases{grid-auto-columns:minmax(185px,78vw)}}
    `}</style>
    <div className="head"><div className="headMain"><div className="eyebrow">Roadmap v{roadmap.version} · {roadmap.isBaseline?"approved baseline":label(roadmap.status)}</div><h3>{roadmap.title}</h3></div><div className="overall"><strong>{progress?.hasApprovedRoadmap?`${overall}%`:"—"}</strong><span>{progress?.hasApprovedRoadmap?"overall progress":"awaiting baseline"}</span></div></div>
    <div className="track"><span style={{width:`${overall}%`}}/></div>
    <div className="phases">{roadmap.phases.map((phase)=>{const p=phaseProgress(phase);const state=p===100?"done":p>0?"active":"";return <article className={`phase ${state}`} key={phase.id??phase.key}><div className="phaseTop"><span className="dot">{p===100?"✓":phase.order}</span><span className="chip">{Number(phase.weight).toFixed(Number(phase.weight)%1?1:0)}%</span><span className="chip">{label(phase.status??"not_started")}</span></div><h4>{phase.title}</h4><div className="meta">{phase.estimatedDuration?<span>{phase.estimatedDuration}</span>:null}</div><p className="milestone">{phase.milestone||"Milestone defined in project roadmap"}</p><div className="mini"><span style={{width:`${p}%`}}/></div><div className="pct"><span>Phase progress</span><strong>{p}%</strong></div></article>;})}</div>
  </section>;
}
