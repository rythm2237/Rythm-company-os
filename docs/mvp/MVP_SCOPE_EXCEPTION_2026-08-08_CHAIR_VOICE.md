# MVP Scope Exception — Chair-Controlled Meeting Closure & Voice

Date: 2026-08-08
Authority: Human CEO / Owner
Status: Approved for Batch 2.5 completion

## Reason
Production testing showed that agent synthesis could complete the session before the Human CEO had finished asking questions or correcting the discussion. The Human CEO explicitly required the highest human authority present in a meeting to confirm meeting closure.

## Approved bounded extension
1. Agent synthesis does not close the meeting.
2. Meeting remains open in an `awaiting chair close` operating condition until Human CEO / Owner explicitly confirms closure.
3. Human CEO can add a contribution after synthesis; B-001 responds and the synthesis is regenerated before closure.
4. Legal relevance triage starts only after explicit chair closure.
5. CEO decision capture is unavailable until chair closure and legal governance gates are satisfied.
6. MVP voice input uses browser speech recognition and remains editable before submission.
7. MVP agent voice playback uses browser speech synthesis with deterministic per-agent voice profiles where the browser exposes stable voices; auto-play is optional and off by default.
8. Boardroom text inputs and transcript surfaces must remain width-bounded and responsive.

## Non-goals
- No realtime voice meeting runtime.
- No autonomous meeting closure.
- No external actions.
- No voice cloning or custom biometric voice identity.
- No paid TTS/STT provider dependency in this bounded MVP extension.

## Governance
Human CEO retains final authority. Browser voice capabilities are convenience interfaces only and do not change authorization, decision, legal, approval, audit, or external-action controls.
