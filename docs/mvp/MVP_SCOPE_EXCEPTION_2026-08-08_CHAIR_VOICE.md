# MVP Scope Exception — Chair-Controlled Meeting Closure

Date: 2026-08-08
Authority: Human CEO / Owner
Status: Approved for Batch 2.5 completion; browser voice UX deferred after Production validation

## Reason
Production testing showed that agent synthesis could complete the session before the Human CEO had finished asking questions or correcting the discussion. The Human CEO explicitly required the highest human authority present in a meeting to confirm meeting closure.

## Approved bounded extension
1. Agent synthesis does not close the meeting.
2. Meeting remains open in an `awaiting chair close` operating condition until Human CEO / Owner explicitly confirms closure.
3. Human CEO can add a contribution after synthesis; B-001 responds and the synthesis is regenerated before closure.
4. Legal relevance triage starts only after explicit chair closure.
5. CEO decision capture is unavailable until chair closure and legal governance gates are satisfied.
6. Boardroom text inputs and transcript surfaces must remain width-bounded and responsive.

## Voice decision after Production test
The initial browser-only speech recognition and browser speech synthesis experiment did not meet MVP quality expectations. Dictation failed to produce reliable editable text in the tested Production environment, and browser-generated agent voices sounded materially artificial.

Therefore voice input, agent voice playback, and auto-play controls are deferred from the MVP UI. A future voice implementation may be reconsidered with a higher-quality governed STT/TTS or realtime voice architecture, explicit cost controls, and stable per-agent voice identities.

## Non-goals for current MVP
- No realtime voice meeting runtime.
- No browser speech-recognition dependency in the active Boardroom UI.
- No browser speech-synthesis agent playback in the active Boardroom UI.
- No autonomous meeting closure.
- No external actions.
- No voice cloning or custom biometric voice identity.

## Governance
Human CEO retains final authority. Deferring voice does not change authorization, decision, legal, approval, audit, cost, or external-action controls.
