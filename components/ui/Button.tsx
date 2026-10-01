"use client";

import React, { useRef, useState, type ButtonHTMLAttributes, type MouseEvent, type ReactNode } from "react";
import { useFormStatus } from "react-dom";
import { ActionLock } from "@/lib/ui/interaction-state";

type Props = Omit<ButtonHTMLAttributes<HTMLButtonElement>, "onClick"> & {
  variant?: "primary" | "secondary" | "tertiary" | "ghost" | "outline" | "destructive" | "success";
  loading?: boolean;
  loadingLabel?: ReactNode;
  iconOnly?: boolean;
  onClick?: (event: MouseEvent<HTMLButtonElement>) => unknown;
};

export function Button({ children, variant, loading = false, loadingLabel, iconOnly, className = "", disabled, onClick, type = "button", ...props }: Props) {
  const form = useFormStatus();
  const lock = useRef(new ActionLock());
  const [pending, setPending] = useState(false);
  const [error, setError] = useState("");
  const busy = loading || pending || (type === "submit" && form.pending);
  const click = async (event: MouseEvent<HTMLButtonElement>) => {
    if (busy || disabled || !lock.current.acquire()) { event.preventDefault(); return; }
    setError("");
    try {
      const result = onClick?.(event);
      if (result && typeof (result as PromiseLike<unknown>).then === "function") {
        setPending(true);
        await result;
      }
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "This action could not be completed. Try again.");
    } finally { lock.current.release(); setPending(false); }
  };
  return <>
    <button {...props} type={type} className={`ui-button ${variant ? `ui-button--${variant}` : ""} ${iconOnly ? "ui-button--icon" : ""} ${className}`} disabled={disabled || busy} aria-busy={busy || undefined} onClick={onClick ? click : undefined}>
      <span className="ui-button-content" style={{ visibility: busy && (loadingLabel || iconOnly) ? "hidden" : undefined }}>{children}</span>
      <span aria-hidden={!busy || undefined} className={`ui-button-progress ${busy && loadingLabel ? "with-label" : ""}`} style={{visibility:busy?"visible":"hidden"}}><span className="ui-spinner" aria-hidden="true" />{busy?loadingLabel:null}</span>
    </button>
    {error ? <span className="ui-action-error" role="alert">{error}</span> : null}
  </>;
}

export function SubmitButton(props: Omit<Props, "onClick">) { return <Button {...props} type="submit" />; }

export function ButtonGroup({ children, label, className = "" }: { children: ReactNode; label?: string; className?: string }) {
  return <div className={`ui-action-group ${className}`} role={label ? "group" : undefined} aria-label={label}>{children}</div>;
}
