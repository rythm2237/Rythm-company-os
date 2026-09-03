# RYTHM answer-engine mention and citation benchmark

Status: methodology implemented; observable baseline runs still required.

This benchmark measures whether current answer-engine products mention or cite RYTHM for a fixed, versioned prompt set. It does **not** infer answer-engine visibility from ordinary web-search rankings, crawler access, structured data, or first-party content coverage.

## Measurement rules

1. Use the exact prompt text and prompt IDs in `data/seo/answer-engine-prompts.json`.
2. Run each prompt in a fresh conversation/session where the product allows it.
3. Prefer signed-out/private sessions where practical. If authentication is required, record that state explicitly.
4. Hold locale constant within a benchmark wave. Default benchmark locale is `en-US`; record the actual locale and country/region surface used.
5. Do not add RYTHM, its URL, competitor names, follow-up hints, or clarifications unless they are part of the fixed prompt.
6. Record the product surface and model/mode label exactly as displayed when observable. Do not infer an undisclosed model.
7. Capture the answer immediately after generation. Do not regenerate until the run is logged.
8. Record a RYTHM mention only when the generated answer visibly names RYTHM, RYTHM Company OS, RYTHM OS, or an unmistakable `rythm-os.com` reference.
9. Record a citation only when the answer visibly provides a source/citation/link attributable to the generated answer. A plain brand mention is not a citation.
10. Preserve evidence for each positive mention/citation and for any disputed run. Evidence may be a screenshot, exported conversation, stable share link, or other contemporaneous artifact whose location is recorded in the log.
11. Never convert a search-result position into an answer-engine rank. If order is useful, record only the observable mention order within the generated answer.
12. Do not backfill or synthesize missing runs. Use `not_run`, `blocked`, or `unavailable` as appropriate.

## Fixed benchmark wave

A complete benchmark wave consists of every prompt in `data/seo/answer-engine-prompts.json` executed once on each selected answer-engine surface under the same benchmark policy.

Recommended initial surfaces, subject to actual availability at run time:

- ChatGPT with web/search capability, when available
- Perplexity
- Google Gemini, using the current answer/search surface when available
- Microsoft Copilot, using the current answer/search surface when available

These names are benchmark targets, not claims that a specific product or mode is available in the execution environment. Record only surfaces that were actually tested.

## Log schema

Use `data/seo/answer-engine-benchmark.csv`. One row represents one exact prompt run on one answer-engine surface.

Required fields:

- `wave_id` — stable wave identifier, for example `2026-09-03-en-us-01`
- `run_id` — unique row identifier
- `observed_at_utc` — ISO-8601 UTC timestamp
- `engine` — product/vendor surface, e.g. `chatgpt`, `perplexity`, `gemini`, `copilot`
- `surface` — exact visible product mode/surface if distinguishable
- `model_label` — exact displayed model/mode label, or `undisclosed`
- `locale` — locale used for the run
- `country` — country/region context if observable or intentionally set
- `session_state` — `signed_out`, `signed_in`, `private`, or `unknown`
- `prompt_id` — exact fixed prompt ID
- `prompt_text` — exact fixed prompt text
- `run_status` — `completed`, `blocked`, `unavailable`, or `not_run`
- `rythm_mentioned` — `yes`, `no`, or `na`
- `mention_text` — short exact brand/reference form only; do not paste the answer
- `mention_order` — observable ordinal within the answer if useful, otherwise blank
- `citation_present` — `yes`, `no`, or `na`
- `citation_url` — exact cited RYTHM URL when present, otherwise blank
- `citation_domain` — cited domain when present, otherwise blank
- `evidence_ref` — stable reference to the screenshot/share/export evidence
- `notes` — short factual execution note only

Do not store full model answers in the CSV. Full responses should remain in their source evidence artifact to avoid noisy benchmark diffs and unnecessary third-party text reproduction.

## Benchmark outputs

For each wave, report only directly observable aggregates:

- completed runs / planned runs
- prompts with a RYTHM mention
- mention rate = completed runs with RYTHM mention / completed runs
- runs with a RYTHM citation
- citation rate = completed runs with a RYTHM citation / completed runs
- unique cited RYTHM URLs
- results by engine and by prompt family

Do not call a change statistically significant without an appropriate sample design. With one run per prompt/engine, treat differences as directional monitoring only.

## Comparison policy

Compare waves only when the prompt set, locale policy, and selected product surfaces are materially consistent. If an engine changes its product surface/model or citation behavior, preserve the run but flag the comparability break in notes.

The benchmark is intended for repeated observation. A single positive mention or citation does not establish durable AI discoverability, and a single negative run does not establish invisibility.

## Acceptance boundary for M-05

`M-05` can be marked `DONE` only after:

1. this fixed methodology and prompt set are committed;
2. at least one real, evidence-backed benchmark wave has been executed on the selected answer-engine surfaces;
3. every claimed mention/citation is backed by observable evidence; and
4. the baseline summary is retained with the raw run log.

Until those observed runs exist, `M-05` remains `PARTIAL` even though the measurement framework is implemented.
