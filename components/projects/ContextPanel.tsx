"use client";
import { useEffect, useId, useRef, type ReactNode } from "react";

/** Native modal dialog supplies focus trapping, inert background, Escape and focus restoration. */
export function ContextPanel({ title, children, onClose }: { title:string; children:ReactNode; onClose:()=>void }) {
 const dialog=useRef<HTMLDialogElement>(null);const titleId=useId();
 useEffect(()=>{const element=dialog.current;const previous=document.activeElement as HTMLElement|null;
  element?.showModal();const old=document.body.style.overflow;document.body.style.overflow="hidden";
  return()=>{element?.close();document.body.style.overflow=old;previous?.focus();};
 },[]);
 return <dialog ref={dialog} className="project-context-panel" aria-labelledby={titleId} onCancel={event=>{event.preventDefault();onClose();}}>
  <header><h2 id={titleId}>{title}</h2><button type="button" onClick={onClose} aria-label="Close details" autoFocus>Close</button></header>
  <div className="project-context-content">{children}</div>
 </dialog>;
}
