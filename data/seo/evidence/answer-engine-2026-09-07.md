# Answer-engine benchmark evidence — 2026-09-07

Source: manually supplied consumer-surface responses from the project owner on 2026-09-07.

This file records the classification outcome for the current M-05 post-change benchmark wave. Raw response text was supplied in the project conversation and is not duplicated here.

## Cohort

Engines:
- ChatGPT
- Gemini
- Perplexity
- Microsoft Copilot

Prompts:
- AE-01 through AE-06 from `data/seo/answer-engine-prompts.json`

## Observation summary

| Prompt | ChatGPT | Gemini | Perplexity | Microsoft Copilot |
|---|---|---|---|---|
| AE-01 | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation |
| AE-02 | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation |
| AE-03 | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | not run / no response supplied | completed — no RYTHM mention/citation |
| AE-04 | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation |
| AE-05 | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation |
| AE-06 | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation | completed — no RYTHM mention/citation |

## Notes

- `AE-03 / Perplexity` had no response in the supplied evidence and is intentionally recorded as `not_run`; it is not counted as a negative completed observation.
- Two ChatGPT response blocks were supplied around AE-02. The later response clearly matched the AI-workforce prompt and was treated as the canonical AE-02 ChatGPT observation. Both supplied blocks were negative for RYTHM, so this disambiguation does not change the binary mention/citation result.
- Citation status in this benchmark means a citation/link to RYTHM, not whether the engine cited unrelated third-party sources.
- No ranking, mention, or citation is inferred beyond the supplied consumer-surface evidence.

## Current measured result

- Completed observations: 23/24
- RYTHM mentions: 0/23 completed observations
- RYTHM citations: 0/23 completed observations
- Outstanding observation: AE-03 / Perplexity
