"use client";

import React, { createContext, useContext, useMemo, useState, type ReactNode } from "react";

type Approval = { id: string; title: string; summary: string };
const ApprovalState = createContext<{ approvals: Approval[]; setApprovals: (approvals: Approval[]) => void } | null>(null);

export function ProjectApprovalProvider({ initialApprovals, children }: { initialApprovals: Approval[]; children: ReactNode }) {
  const [approvals, setApprovals] = useState(initialApprovals);
  const value = useMemo(() => ({ approvals, setApprovals }), [approvals]);
  return <ApprovalState.Provider value={value}>{children}</ApprovalState.Provider>;
}

export function useProjectApprovalState() { return useContext(ApprovalState); }

export function ProjectApprovalCount({ offset = 0, suffix = "" }: { offset?: number; suffix?: string }) {
  const state = useProjectApprovalState();
  return <>{(state?.approvals.length ?? 0) + offset}{suffix}</>;
}

export function ProjectAttentionHeading({ proposalCount }: { proposalCount: number }) {
  const state = useProjectApprovalState();
  const count = (state?.approvals.length ?? 0) + proposalCount;
  return <>{count ? `${count} decision${count === 1 ? "" : "s"} need attention` : "No executive decision pending"}</>;
}

export function ProjectApprovalList() {
  const state = useProjectApprovalState();
  return <div className="data-list">{state?.approvals.map(row => <div className="data-row" key={row.id}><div><strong>{row.title}</strong><span>{row.summary}</span></div><span className="pill">Approval required</span></div>)}{!state?.approvals.length ? <p className="empty-state">No pending decisions for this project.</p> : null}</div>;
}
