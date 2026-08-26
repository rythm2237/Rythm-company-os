"use client";

import { useEffect, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";

export default function BoardroomFocusBridge() {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const router = useRouter();
  const inBoardroomRoute = pathname.startsWith("/meetings/room");
  const meetingId = searchParams.get("meeting") ?? "";
  const inActiveBoardroom = inBoardroomRoute && Boolean(meetingId);
  const [meetingStatus, setMeetingStatus] = useState<string | null>(null);
  const [leaving, setLeaving] = useState(false);
  const [leaveError, setLeaveError] = useState("");

  useEffect(() => {
    if (!inActiveBoardroom) {
      document.documentElement.classList.remove("rythm-boardroom-focus");
      return;
    }
    document.documentElement.classList.add("rythm-boardroom-focus");
    return () => document.documentElement.classList.remove("rythm-boardroom-focus");
  }, [inActiveBoardroom]);

  useEffect(() => {
    if (!inActiveBoardroom || !meetingId) return;
    let cancelled = false;
    const refresh = async () => {
      try {
        const response = await fetch(`/api/meetings/continue-detached?meeting=${encodeURIComponent(meetingId)}`, { credentials: "same-origin", cache: "no-store" });
        const payload = await response.json();
        if (!cancelled && response.ok && payload.ok) setMeetingStatus(String(payload.meetingStatus ?? ""));
      } catch {}
    };
    void refresh();
    const timer = window.setInterval(refresh, 8000);
    return () => { cancelled = true; window.clearInterval(timer); };
  }, [inActiveBoardroom, meetingId]);

  if (!inActiveBoardroom) return null;

  const openPanel = (tab: "Live" | "Summary" | "Governance") => {
    const buttons = Array.from(document.querySelectorAll<HTMLButtonElement>("button"));
    const panelToggle = buttons.find((button) => {
      const label = (button.textContent ?? "").trim();
      return label === "Notes" || label === "Close panel";
    });
    if (panelToggle && (panelToggle.textContent ?? "").trim() === "Notes") panelToggle.click();
    window.setTimeout(() => {
      const tabButton = Array.from(document.querySelectorAll<HTMLButtonElement>("button")).find(
        (button) => (button.textContent ?? "").trim() === tab,
      );
      tabButton?.click();
    }, 40);
  };

  const leaveRoom = async () => {
    if (leaving) return;
    setLeaving(true);
    setLeaveError("");
    try {
      const response = await fetch("/api/meetings/continue-detached", {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        credentials: "same-origin",
        keepalive: true,
        body: JSON.stringify({ meetingId }),
      });
      if (!response.ok) {
        const payload = await response.json().catch(() => ({}));
        throw new Error(String(payload.error ?? "The meeting could not be handed to background continuation."));
      }
      router.push("/meetings");
    } catch (cause) {
      setLeaveError(cause instanceof Error ? cause.message : "Could not leave the room safely.");
      setLeaving(false);
    }
  };

  return <>
    <style jsx global>{`
      html.rythm-boardroom-focus, html.rythm-boardroom-focus body { overflow: hidden !important; }
      html.rythm-boardroom-focus .app-navigation,
      html.rythm-boardroom-focus .workspace-footer,
      html.rythm-boardroom-focus .project-pulse,
      html.rythm-boardroom-focus .communication-delivery-dock { display: none !important; }
      html.rythm-boardroom-focus .app-workspace { display: block !important; min-height: 100dvh !important; }
      html.rythm-boardroom-focus .app-stage { margin: 0 !important; width: 100% !important; max-width: none !important; min-height: 100dvh !important; overflow: hidden !important; }
      html.rythm-boardroom-focus .app-page-transition { width: 100% !important; min-height: 100dvh !important; }

      html.rythm-boardroom-focus section[aria-label="RYTHM executive presentation room"] > header > div:first-child > div:nth-child(2) {
        margin-left: 112px !important;
        min-width: 0 !important;
      }
      html.rythm-boardroom-focus section[aria-label="RYTHM executive presentation room"] > header > div:first-child > div:nth-child(2) h2,
      html.rythm-boardroom-focus section[aria-label="RYTHM executive presentation room"] > header > div:first-child > div:nth-child(2) span {
        max-width: min(38vw, 560px) !important;
      }
      html.rythm-boardroom-focus section[aria-label="RYTHM executive presentation room"] > header > div:last-child > span:first-child { display: none !important; }

      .boardroom-leave-room { position: fixed; z-index: 2147483605; top: 13px; left: 64px; height: 36px; min-width: 96px; padding: 0 13px; border: 1px solid rgba(255,255,255,.16); border-radius: 11px; background: rgba(17,21,29,.92); color: #edf2fb; font: 700 12px/1 system-ui,sans-serif; backdrop-filter: blur(14px); box-shadow: 0 10px 30px rgba(0,0,0,.28); cursor: pointer; }
      .boardroom-leave-room:hover { background: rgba(30,37,50,.98); }
      .boardroom-leave-room:disabled { opacity: .55; cursor: wait; }
      .boardroom-leave-error { position: fixed; z-index: 2147483606; top: 56px; left: 64px; max-width: 360px; padding: 9px 11px; border: 1px solid rgba(255,113,132,.34); border-radius: 10px; background: rgba(56,17,24,.96); color: #ffc4cc; font: 600 11px/1.4 system-ui,sans-serif; }

      .boardroom-post-actions { position: fixed; z-index: 2147483607; left: 50%; bottom: 22px; transform: translateX(-50%); width: min(720px, calc(100vw - 36px)); display: grid; grid-template-columns: minmax(0,1fr) auto; gap: 14px 20px; align-items: center; padding: 14px 16px; border: 1px solid rgba(255,255,255,.14); border-radius: 16px; background: rgba(12,17,27,.95); color: #edf3ff; box-shadow: 0 18px 54px rgba(0,0,0,.38); backdrop-filter: blur(18px); }
      .boardroom-post-copy strong { display: block; font: 800 13px/1.25 system-ui,sans-serif; }
      .boardroom-post-copy span { display: block; margin-top: 4px; color: #9ca9bd; font: 600 11px/1.35 system-ui,sans-serif; }
      .boardroom-post-buttons { display: flex; gap: 8px; flex-wrap: wrap; justify-content: flex-end; }
      .boardroom-post-buttons button { min-height: 38px; padding: 0 13px; border: 1px solid rgba(255,255,255,.15); border-radius: 10px; background: rgba(255,255,255,.07); color: #f5f7fb; font: 750 11px/1 system-ui,sans-serif; cursor: pointer; }
      .boardroom-post-buttons button:hover { background: rgba(255,255,255,.13); }
      .boardroom-post-buttons button:nth-child(2) { background: #5d72ea; border-color: #7f90f2; }

      @media (max-width: 1100px) {
        html.rythm-boardroom-focus section[aria-label="RYTHM executive presentation room"] > header > div:first-child > div:nth-child(2) { margin-left: 100px !important; }
        html.rythm-boardroom-focus section[aria-label="RYTHM executive presentation room"] > header > div:first-child > div:nth-child(2) h2,
        html.rythm-boardroom-focus section[aria-label="RYTHM executive presentation room"] > header > div:first-child > div:nth-child(2) span { max-width: 28vw !important; }
      }

      @media (max-width: 760px) {
        .boardroom-leave-room { left: 52px; top: 10px; height: 34px; min-width: 82px; padding: 0 9px; font-size: 10px; }
        .boardroom-leave-error { left: 8px; right: 8px; top: 48px; max-width: none; }
        html.rythm-boardroom-focus section[aria-label="RYTHM executive presentation room"] > header > div:first-child > div:nth-child(2) { margin-left: 82px !important; }
        html.rythm-boardroom-focus section[aria-label="RYTHM executive presentation room"] > header > div:first-child > div:nth-child(2) h2 { max-width: 34vw !important; }
        html.rythm-boardroom-focus section[aria-label="RYTHM executive presentation room"] > header > div:first-child > div:nth-child(2) span { display: none !important; }
        .boardroom-post-actions { bottom: 10px; width: calc(100vw - 20px); grid-template-columns: 1fr; gap: 10px; padding: 12px; }
        .boardroom-post-buttons { display: grid; grid-template-columns: repeat(3, minmax(0,1fr)); width: 100%; }
        .boardroom-post-buttons button { padding: 0 8px; }
      }
    `}</style>
    {meetingStatus === "completed" ? <div className="boardroom-post-actions" role="region" aria-label="Post-meeting actions">
      <div className="boardroom-post-copy"><strong>Meeting ended</strong><span>Review notes, generate the meeting summary, or complete governance without starting another meeting.</span></div>
      <div className="boardroom-post-buttons">
        <button type="button" onClick={() => openPanel("Live")}>Notes</button>
        <button type="button" onClick={() => openPanel("Summary")}>Summary</button>
        <button type="button" onClick={() => openPanel("Governance")}>Governance</button>
      </div>
    </div> : <button className="boardroom-leave-room" type="button" onClick={() => void leaveRoom()} disabled={leaving} title="Leave this room while the governed session continues">{leaving ? "Leaving…" : "Leave room"}</button>}
    {leaveError ? <div className="boardroom-leave-error" role="alert">{leaveError}</div> : null}
  </>;
}
