"use client";

import Link from "next/link";
import dynamic from "next/dynamic";
const StudioCubeScene = dynamic(() => import("./StudioCubeScene"), { ssr: false });
import { useEffect, useState, type ReactNode } from "react";
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

/** A conceptual model explorer. Its faces are illustrations, never fake product controls. */
export default function OperatingModelCube({ variant, children }: { variant: "solutions" | "templates"; children?: ReactNode }) {
  const items = variant === "solutions" ? solutions : templates;
  const [selected, setSelected] = useState(0);
  const [engine, setEngine] = useState<"loading" | "webgl" | "fallback">("loading");
  const [playing, setPlaying] = useState(false);
  const [reduced, setReduced] = useState(true);
  useEffect(() => {
    const media = window.matchMedia("(prefers-reduced-motion: reduce)");
    const update = () => { setReduced(media.matches); setPlaying(!media.matches); };
    update(); media.addEventListener("change", update);
    return () => media.removeEventListener("change", update);
  }, []);
  function choose(index: number) { setSelected(index); setPlaying(false); }
  const model = items[selected];
  const faces = [...items];
  if (variant === "solutions") faces.push({ id: "authority", name: "Human authority", label: "Control", detail: "Consequential decisions stay with people.", roles: ["Review", "Approve", "Trace"], href: "/human-approval-ai-agents", cta: "Human approval" });
  return <div className={`operating-model-explorer is-${variant}`} data-cube-playing={playing} data-cube-engine={engine}>
    <div className="model-cube-caption"><span className="model-cube-status" />{variant === "solutions" ? "ONE OS. THREE OPERATING MODELS." : "YOUR NEXT AI COMPANY."}</div>
    <div className="model-cube-stage" hidden={engine === "fallback"} aria-hidden="true">
      <StudioCubeScene key={variant} variant={variant} faces={faces} selected={selected} playing={playing} reduced={reduced} onEngineChange={setEngine} />
    </div>
    <div className="model-cube-controls">
      <span>Explore each {engine === "fallback" ? "option" : "face"}</span>
      {engine !== "fallback" && <button type="button" className="model-cube-motion" disabled={reduced || engine === "loading"} title={reduced ? "Motion disabled by your system preference" : undefined} onClick={() => setPlaying(!playing)} aria-label={playing ? "Pause cube rotation" : "Play cube rotation"} aria-pressed={playing}><span aria-hidden="true">{playing ? "Ⅱ" : "▷"}</span>{reduced ? "Reduced motion" : playing ? "Pause motion" : "Rotate cube"}</button>}
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
