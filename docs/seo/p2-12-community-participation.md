# P2-12 — Expert / Community Participation

Checkpoint: 2026-09-03

## Status

`PARTIAL` — execution framework, target register, contribution topics, disclosure rules and evidence guard are implemented. No external community contribution is counted until a real public post/comment exists and is recorded with its public URL.

## Acceptance boundary

P2-12 becomes `DONE` only after RYTHM/founder has made multiple useful, non-spam, transparent contributions in relevant independent communities and those contributions are publicly verifiable.

The following do **not** close P2-12:

- drafts that were never published;
- RYTHM-owned website or GitHub content;
- automated posting;
- undisclosed promotion;
- purchased engagement, votes, comments or reactions;
- synthetic URLs or engagement metrics;
- duplicate cross-posting whose primary purpose is exposure.

## Community principles

1. Help first. A contribution must answer a real question, share a reproducible pattern, or explain a trade-off.
2. Disclose affiliation whenever RYTHM is mentioned: `I’m building RYTHM Company OS` or equivalent.
3. Do not claim customer ROI, market leadership, adoption, partnerships, compliance certifications, review scores or benchmark superiority without evidence.
4. Do not ask for upvotes, coordinated comments, backlinks or reciprocal promotion.
5. Do not automate posting or replies.
6. Follow the rules of the destination community at the time of posting.
7. Record only public, live contributions in `data/seo/community-participation.csv`.

## Initial target communities

The target register is maintained in `data/seo/community-targets.json`.

Priority topics already have active discussion demand around:

- runtime governance for AI agents;
- human approval boundaries;
- scoped permissions and tool access;
- audit trails and rollback;
- multi-agent governance and decision authority.

### Reddit

Priority communities:

- `r/AgentsOfAI`
- `r/AI_Agents`
- `r/aiagents`
- `r/AI_Governance`

Use comment-first participation where possible. Mention RYTHM only when directly relevant and always disclose the founder/builder relationship. Check each subreddit’s current rules before posting.

### Hacker News

Use only when there is genuinely technical/original material likely to interest the community, such as the reproducible governance benchmark or an implementation write-up.

HN’s current guidelines say not to use the site primarily for promotion and explicitly say not to post generated or AI-edited text in comments. Therefore RYTHM must not publish AI-written HN comments/posts as if they were founder-authored. The founder can use the evidence pack below, but must write the final HN text independently.

Official guideline: https://news.ycombinator.com/newsguidelines.html

## Contribution topics

### Topic A — What runtime governance changes in practice

Useful substance to contribute:

- separate planning from consequential execution;
- scope each agent’s permissions/tools/data access;
- deterministic allow/deny/approval policy before execution;
- explicit human approval for high-risk actions;
- execution ledger with correlation IDs and idempotency;
- rollback/compensating action where supported.

Evidence source:
- https://rythm-os.com/product-architecture
- https://rythm-os.com/product/integrations/evidence

### Topic B — Human-in-the-loop vs Human CEO authority

Useful substance to contribute:

- human review is not one binary switch;
- assign authority by action/risk class;
- deliberation can be multi-agent while final consequential authority remains human;
- approvals should be action-, target- and time-bound;
- audit the approval decision independently from the model output.

Evidence source:
- https://rythm-os.com/ai-transparency
- https://rythm-os.com/research/governed-ai-workforce-benchmark

### Topic C — A reproducible governance benchmark

Useful substance to contribute:

- use synthetic scenarios to avoid customer-data leakage;
- score strategic/execution quality separately from governance violations;
- make some governance failures deterministic hard-fails;
- publish limitations and avoid turning an internal benchmark into a superiority claim.

Evidence source:
- https://rythm-os.com/research/governed-ai-workforce-benchmark

## Safe affiliation disclosure

When RYTHM is relevant, use a plain disclosure such as:

`Disclosure: I’m building RYTHM Company OS, so this is informed by the governance architecture we’re implementing there.`

Do not hide the affiliation behind a generic “we built something similar” statement.

## Evidence required after each real contribution

Record:

- platform/community;
- public contribution URL;
- publication date;
- contribution type (`comment`, `post`, `answer`, `discussion`);
- topic;
- whether RYTHM was mentioned;
- whether affiliation was disclosed;
- whether a RYTHM link was included;
- observed engagement only when visible from the public page;
- evidence note.

## Current external evidence

As of this checkpoint, no external contribution has been published or claimed by this implementation. P2-12 therefore remains `PARTIAL` rather than `DONE`.
