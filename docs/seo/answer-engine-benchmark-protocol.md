# RYTHM Answer-Engine Benchmark Protocol

## Purpose

Measure whether RYTHM Company OS is independently mentioned or cited by major consumer answer engines after SEO/GEO/AEO changes. This protocol does not treat ordinary web-search results, owned pages, or CI tests as answer-engine visibility evidence.

## Fixed comparison cohort

The historical pre-optimization baseline is stored in `data/seo/answer-engine-baseline.json` and must remain immutable.

Comparison cohort:

- Engines: ChatGPT, Gemini, Perplexity, Microsoft Copilot
- Prompts: AE-01 through AE-04
- Expected runs per wave: 16
- Historical baseline: 0 RYTHM mentions / 16 runs; 0 RYTHM citations / 16 runs

AE-05 and AE-06 were added later. They are an expansion cohort and must not be inserted into the historical 16-run denominator.

## Expansion cohort

Run AE-05 and AE-06 on the same four engines as an additional 8 observations. Report these separately from the 16-run comparison cohort until a future benchmark explicitly establishes a new baseline version.

## Run controls

For every observation:

1. Use the exact prompt text from `data/seo/answer-engine-prompts.json`; do not paraphrase.
2. Record the consumer surface, visible model label, locale, country, and session state.
3. Use a fresh conversation/session where the surface permits it and do not seed the engine with RYTHM context.
4. Record the UTC observation time.
5. Mark `rythm_mentioned=yes` only when the answer itself identifies RYTHM Company OS or rythm-os.com as a relevant product/platform.
6. Mark `citation_present=yes` only when the answer exposes a source/citation link attributable to the RYTHM mention and capture its exact URL/domain.
7. Store a durable evidence reference for every positive mention or citation, such as an exported response, screenshot reference, or other reviewable artifact.
8. If an engine cannot be accessed or a run cannot be completed, use `blocked` or `unavailable`; never infer a negative result.

## Post-change reporting

Each post-change wave must report at minimum:

- comparison mentions: X/16
- comparison citations: Y/16
- change versus fixed baseline: X minus 0 mentions; Y minus 0 citations
- expansion mentions: X/8
- expansion citations: Y/8
- per-engine results
- per-prompt results
- blocked/unavailable runs, if any

Do not merge incomplete or blocked runs into the denominator for completed-run rates. Also show the planned denominator so missing coverage remains visible.

## Evidence boundary

The benchmark is not complete merely because RYTHM pages rank in web search, are crawlable, or pass structured-data tests. Results must come from the named answer-engine consumer surfaces. No result may be fabricated from web search, model memory, API substitutes, or assumptions about indexing.
