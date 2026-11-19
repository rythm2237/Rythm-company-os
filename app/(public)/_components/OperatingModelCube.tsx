"use client";

import Link from "next/link";
import { useEffect, useRef, useState, type ReactNode } from "react";
import { PUBLIC_TEMPLATES, SOLUTION_PATHS } from "@/lib/public-experience/content";

type Model = { id: string; name: string; label: string; detail: string; roles: string[]; href: string; cta: string; preview?: boolean };
const solutions: Model[] = SOLUTION_PATHS.map((path, index) => ({
  id: path.id, name: ["Ready AI Company", "Custom AI Company", "Enterprise AI Workforce"][index],
  label: ["Ready", "Custom", "Enterprise"][index], detail: path.description,
  roles: [["Strategy", "Creative", "Operations"], ["Your roles", "Your teams", "Your workflow"], ["People", "AI teams", "Governance"]][index],
  href: path.href, cta: path.cta,
}));
const templateOrder = ["ai-advertising-agency", "software-company", "saas-startup", "custom-operating-company"];
const templates: Model[] = templateOrder.map((id, index) => {
  const template = PUBLIC_TEMPLATES.find((item) => item.id === id)!;
  return { id, name: template.name, label: ["AI Agency", "Software", "SaaS", "Custom"][index],
    detail: template.description, roles: [["Strategy", "Creative", "Analytics"], ["Product", "Engineering", "QA"], ["Discovery", "Product", "Growth"], ["Your roles", "Your teams", "Governance"]][index],
    href: `/demo?surface=${template.maturity === "preview" ? "templates" : "agents"}`,
    cta: "Explore in Demo", preview: template.maturity === "preview" };
});

function AgentComposition({ roles, governance = false }: { roles: string[]; governance?: boolean }) {
  return <svg className="model-cube-agents" viewBox="0 0 220 105" fill="none" aria-hidden="true">
    <path d="M110 19V40M110 40H35V58M110 40H185V58M110 40V58" stroke="currentColor" strokeOpacity=".28" strokeWidth="1.4" />
    <rect x="83" y="2" width="54" height="24" rx="7" fill="currentColor" fillOpacity=".08" />
    <text x="110" y="18" textAnchor="middle" fill="currentColor" fontSize="8" fontWeight="700">{governance ? "HUMAN CEO" : "SHARED CONTEXT"}</text>
    {roles.map((role, index) => <g key={role}>
      <rect x={16 + index * 75} y="54" width="38" height="31" rx="9" fill="currentColor" fillOpacity=".07" stroke="currentColor" strokeOpacity=".2" />
      <path d={`M${27 + index * 75} 64h16m-16 5h10m-10 5h14`} stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" />
      <circle cx={46 + index * 75} cy="57" r="3" fill="var(--cube-cyan)" />
      <text x={35 + index * 75} y="101" textAnchor="middle" fill="currentColor" fontSize="8">{role}</text>
    </g>)}
  </svg>;
}

/** A conceptual model explorer. Its faces are illustrations, never fake product controls. */
export default function OperatingModelCube({ variant, children }: { variant: "solutions" | "templates"; children?: ReactNode }) {
  const items = variant === "solutions" ? solutions : templates;
  const [selected, setSelected] = useState(0);
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(true);
  const [frozen, setFrozen] = useState<string>();
  const cube = useRef<HTMLDivElement>(null);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReduced(media.matches); if (media.matches) { setFrozen(undefined); setPlaying(false); } else setPlaying(true); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  function choose(index: number) { setSelected(index); setFrozen(undefined); setPlaying(false); }
  function toggleMotion() {
    if (playing && cube.current) setFrozen(getComputedStyle(cube.current).transform);
    setPlaying(!playing);
  }
  const model = items[selected];
  const faces = [...items];
  if (variant === "solutions") faces.push({ id: "authority", name: "Human authority", label: "Control", detail: "Consequential decisions stay with people.", roles: ["Review", "Approve", "Trace"], href: "/human-approval-ai-agents", cta: "Human approval" });
  return <div className={`operating-model-explorer is-${variant}`} data-cube-playing={playing}>
    <div className="model-cube-caption"><span className="model-cube-status" />{variant === "solutions" ? "ONE OS. THREE OPERATING MODELS." : "YOUR NEXT AI COMPANY."}</div>
    <div className="model-cube-stage" aria-hidden="true">
      <div className="model-cube-orbit model-cube-orbit-one" /><div className="model-cube-orbit model-cube-orbit-two" />
      <div className="model-cube-floor" />
      <div className={`model-cube${playing ? " is-rotating" : ""}`} ref={cube} style={{ transform: frozen ?? `rotateX(-18deg) rotateY(${-selected * 90 - 24}deg)`, transition: frozen ? "none" : undefined }}>
        {faces.map((face, index) => <div className={`model-cube-face model-cube-side-${index}`} key={face.id}>
          <div className="model-cube-face-top"><span>RYTHM / {variant === "solutions" ? "OPERATING MODEL" : "COMPANY TEMPLATE"}</span><span>0{index + 1}</span></div>
          <h3>{face.name}</h3>
          <AgentComposition roles={face.roles} governance={index === 3 || variant === "templates"} />
          <div className="model-cube-face-footer"><span>{face.preview ? "PREVIEW · NOT LAUNCH-READY" : index === 3 && variant === "solutions" ? "HUMAN CEO CONTROL" : "SPECIALIZED AI AGENTS"}</span><i /></div>
        </div>)}
        <div className="model-cube-face model-cube-top"><span>COMPANY OS</span><svg viewBox="0 0 120 120" fill="none"><path d="M60 24 92 60 60 96 28 60Z M60 24v72M28 60h64" stroke="currentColor" strokeWidth="2"/><circle cx="60" cy="60" r="9" fill="var(--cube-cyan)"/>{[[60,24],[92,60],[60,96],[28,60]].map(([x,y])=><circle key={`${x}-${y}`} cx={x} cy={y} r="5" fill="currentColor"/>)}</svg><small>CONTEXT · AGENTS · GOVERNANCE</small></div>
        <div className="model-cube-face model-cube-bottom"><span>TRACEABLE WORK</span></div>
      </div>
    </div>
    <div className="model-cube-controls">
      <span>Explore each face</span>
      <button type="button" className="model-cube-motion" disabled={reduced} title={reduced ? "Motion disabled by your system preference" : undefined} onClick={toggleMotion} aria-label={playing ? "Pause cube rotation" : "Play cube rotation"} aria-pressed={playing}><span aria-hidden="true">{playing ? "Ⅱ" : "▷"}</span>{reduced ? "Reduced motion" : playing ? "Pause motion" : "Rotate cube"}</button>
    </div>
    <div className="model-cube-options" role="group" aria-label={variant === "solutions" ? "Operating models" : "Company templates"}>
      {items.map((item, index) => <button type="button" key={item.id} aria-pressed={selected === index} onClick={() => choose(index)}><span>0{index + 1}</span>{item.label}</button>)}
    </div>
    <div className="model-cube-detail" aria-live="polite" aria-atomic="true">
      <h2>{model.name}{model.preview ? <small>Preview</small> : null}</h2>
      <p>{model.detail}</p>
      <Link href={model.href}>{model.cta}<span aria-hidden="true"> ↗</span></Link>
    </div>
    {children ? <div className="model-cube-page-note">{children}</div> : null}
  </div>;
}
