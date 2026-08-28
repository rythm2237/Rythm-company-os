"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useEffect, useMemo, useState } from "react";

const STEPS = [
  { href: "/company/launch", title: "Company launch", copy: "See what is left before the company is ready to operate." },
  { href: "/company", title: "Company profile", copy: "Complete identity, mission, operating and legal profile information." },
  { href: "/company-library", title: "Company knowledge", copy: "Upload policies, brand, legal, service and operating files for the company workforce." },
  { href: "/integrations", title: "Connect business tools", copy: "Connect company-owned systems with least privilege and governed execution." },
  { href: "/agents", title: "Review and enable Agents", copy: "Inspect each Agent, add role-specific knowledge and enable only the Agents you are ready to use." },
  { href: "/projects", title: "Create the first project", copy: "Create client or internal work and assign governed actions." },
  { href: "/meetings", title: "Run the first meeting", copy: "Bring the right Agents into a governed company meeting and keep Human CEO authority." },
  { href: "/command-center", title: "Operate the company", copy: "Use Command as the Human CEO control plane for the running company." },
] as const;

function activeStep(pathname: string) {
  const exact = STEPS.findIndex((step) => pathname === step.href || pathname.startsWith(`${step.href}/`));
  return exact >= 0 ? exact : 0;
}

export default function ActiveWorkspaceGuide() {
  const pathname = usePathname();
  const [open, setOpen] = useState(false);
  const [enabled, setEnabled] = useState(false);
  useEffect(() => {
    const saved = window.localStorage.getItem("rythm-active-guide");
    const next = saved === "on" || pathname === "/company/launch";
    setEnabled(next);
    setOpen(next && pathname === "/company/launch");
  }, [pathname]);
  const index = useMemo(() => activeStep(pathname), [pathname]);
  const current = STEPS[index];
  const next = STEPS[Math.min(index + 1, STEPS.length - 1)];

  function toggleGuide() {
    const nextEnabled = !enabled;
    setEnabled(nextEnabled);
    setOpen(nextEnabled);
    window.localStorage.setItem("rythm-active-guide", nextEnabled ? "on" : "off");
  }

  if (pathname === "/integrations" || pathname.startsWith("/integrations/")) return null;
  if (!enabled) {
    return <button type="button" onClick={toggleGuide} style={{position:"fixed",right:20,bottom:20,zIndex:55,border:0,borderRadius:999,padding:"12px 16px",background:"#111827",color:"white",fontWeight:800,boxShadow:"0 16px 40px rgba(15,23,42,.24)"}}>Guide me</button>;
  }

  return <aside aria-label="Active company setup guide" style={{position:"fixed",right:20,bottom:20,zIndex:55,width:open?"min(380px,calc(100vw - 40px))":"auto",border:"1px solid #d9e0eb",borderRadius:18,background:"rgba(255,255,255,.98)",color:"#111827",boxShadow:"0 22px 55px rgba(15,23,42,.22)",padding:open?18:0}}>
    {open ? <>
      <div style={{display:"flex",justifyContent:"space-between",gap:14,alignItems:"start"}}>
        <div><p style={{margin:0,color:"#5367ef",fontWeight:900,fontSize:12,letterSpacing:1.2}}>ACTIVE GUIDE · {index+1}/{STEPS.length}</p><h3 style={{margin:"6px 0 8px"}}>{current.title}</h3></div>
        <button type="button" onClick={()=>setOpen(false)} aria-label="Minimize guide" style={{border:"1px solid #d9e0eb",background:"#f8fafc",borderRadius:10,padding:"8px 10px",color:"#111827"}}>Hide</button>
      </div>
      <div style={{height:7,borderRadius:999,background:"#e8ecf4",overflow:"hidden",margin:"8px 0 14px"}}><div style={{height:"100%",width:`${((index+1)/STEPS.length)*100}%`,background:"#5367ef"}} /></div>
      <p style={{margin:"0 0 14px",lineHeight:1.55,color:"#4b5563"}}>{current.copy}</p>
      <div style={{display:"flex",gap:8,flexWrap:"wrap"}}>
        <Link href={current.href} style={{textDecoration:"none",borderRadius:10,padding:"10px 12px",background:"#111827",color:"white",fontWeight:800}}>Do this now</Link>
        {next.href !== current.href ? <Link href={next.href} style={{textDecoration:"none",borderRadius:10,padding:"10px 12px",background:"#eef2ff",color:"#29378f",fontWeight:800}}>Next: {next.title}</Link> : null}
        <button type="button" onClick={toggleGuide} style={{border:"1px solid #d9e0eb",borderRadius:10,padding:"10px 12px",background:"white",color:"#4b5563",fontWeight:700}}>Turn guide off</button>
      </div>
    </> : <button type="button" onClick={()=>setOpen(true)} style={{border:0,borderRadius:999,padding:"12px 16px",background:"#111827",color:"white",fontWeight:800}}>Continue guide</button>}
  </aside>;
}
