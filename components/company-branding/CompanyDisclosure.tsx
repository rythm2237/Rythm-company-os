"use client";

import { useRef, useState, type ReactNode } from "react";

export default function CompanyDisclosure({ id, number, title, description, meta, initiallyOpen = false, children }: {
  id: string; number: string; title: string; description: string; meta: string; initiallyOpen?: boolean; children: ReactNode;
}) {
  const [open, setOpen] = useState(initiallyOpen);
  const section = useRef<HTMLElement>(null);
  const panelId = `${id}-panel`;
  const toggle = () => {
    setOpen(value => !value);
    if (!open) requestAnimationFrame(() => section.current?.scrollIntoView({ block: "nearest", behavior: window.matchMedia("(prefers-reduced-motion: reduce)").matches ? "auto" : "smooth" }));
  };
  return <section ref={section} className="company-disclosure" id={id} data-open={open}>
    <h2 className="company-disclosure-heading"><button type="button" className="company-disclosure-trigger" aria-expanded={open} aria-controls={panelId} onClick={toggle}>
      <span className="company-section-index" aria-hidden="true">{number}</span>
      <span className="company-section-label"><strong>{title}</strong><small>{description}</small></span>
      <span className="company-section-meta">{meta}</span>
      <span className="company-section-action" aria-hidden="true"><svg viewBox="0 0 24 24" width="18" height="18" fill="none"><path d="m6 9 6 6 6-6" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"/></svg></span>
    </button></h2>
    <div id={panelId} className="company-disclosure-panel" aria-hidden={!open} inert={!open}>
      <div className="company-disclosure-clip"><div className="company-disclosure-body">{children}</div></div>
    </div>
  </section>;
}
