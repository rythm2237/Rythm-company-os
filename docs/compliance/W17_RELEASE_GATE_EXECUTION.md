# W17 release gate execution record — 2026-11-24

Status: BLOCKED for Production. Owner approval for the internal retention proposal and release is recorded in PR #471. It does not replace the release sign-off requirements in W17_LEGAL_REVIEW.md. No real deletion or new paid provider plan is authorized by this record.

## Verified facts

- Operational archive drill and scoped synthetic memory reconciliation passed on the restored operational database; local named container and two temporary directory absence checks passed. See PR #471 comments 7133595918 and 7133864781. Not a second physical restore, complete account erasure or secure wipe.
- Private Drive inventory contains encrypted archive generations 2026-11-16 and 2026-11-24 with sidecars; new archive size 124624043 bytes matches local output. Remote archive bytes not independently hashed.
- Read-only Production aggregate on 2026-11-24: communication_messages has 2 cloudflare_email_worker rows, both have raw_mime older than 90 days, both also have a nonempty parsed text or HTML body, neither has a referencing reply_to_message_id. Two other rows have no raw_mime. No message contents or identities were returned; no data changed. Presence of parsed body is not proof of complete extraction of attachments/headers.
- The tested implementation candidate is 6eef3efef9ddf194d676a358895c31a7fc56dab0. CI and disposable Supabase runs 45351072836 and 45351072900 passed. Recheck integration against current main before any release.

## Provider evidence capture

| Gate | Evidence to collect | Acceptance / remaining action |
| --- | --- | --- |
| OpenAI Production project | In Platform project settings identify the project used by Production via the owner's key inventory (never copy key). Record project identifier, organization/project data retention controls, inheritance and residency; document DPA/transfer terms. | Standard retention is a possible reviewed policy; ZDR is not presumed or mandatory by this document. Store:false alone is insufficient. Record actual setting and review terms, endpoint exceptions and disclosed processing. |
| Cloudflare Worker | Workers & Pages > rythm-mail-inbound > Settings/Observability. Record logs enabled, sampling, actual plan, retention and any external export/Logpush/Tail destination; do not expose request payloads. | Confirm no unnecessary personal mail content in logs or downstream destinations. Provider docs describe plan-dependent retention, not account settings. |
| Receiving Gmail | Determine whether personal Gmail or managed Workspace/Vault, destination retention and any forwarding/backup rules; record review owner. | Trash expiry is not retention for messages in the inbox. Define scoped periodic review, preserve holds and case evidence. No blanket mail deletion. |
| Backup copies | Inventory original archive dates, local D and Drive copies, other copies including Docker disk backup, access and expiry. | Owner target 30 days; review original archive generations by 2026-12-16 and 2026-12-24. Ensure independently recoverable successor before deleting only usable copy. Keep disposition ledger for all restorable generations. |
| Supabase / Vercel | Earlier dashboard evidence: Free/no scheduled project backups, Hobby/no configured Drains. | Record these limitations rather than assuming automated backups, PITR or universal logging retention. |
| Qualified legal review | Use W17_LEGAL_REVIEW.md and data map; record reviewer, date, scope, decision, exceptions and applicable contract/public disclosure changes. | Remains an independent release sign-off. Owner approval already recorded. |

Sources: [OpenAI data controls](https://developers.openai.com/api/docs/guides/your-data), [Cloudflare Workers Logs](https://developers.cloudflare.com/workers/observability/logs/workers-logs/), [Gmail Trash](https://support.google.com/mail/answer/7401), [GDPR](https://eur-lex.europa.eu/eli/reg/2016/679/oj).

## Mail disposition proposal — not enforced

Separate raw MIME, parsed message (including attachment/third-party information), ingress audit and external mailbox copies. Propose raw MIME removal after verified successful extraction and a short documented operational review window, with a proposed 30-day maximum target unless scoped retention hold or customer instruction applies. Do not infer legal basis or complete extraction from age/body presence. Existing two old raw records are review candidates only. Before removal, prove attachment/header dependencies, retry behavior, preserved parsed record, audit integrity, no foreign tenant impact, and hold behavior using synthetic fixtures. Parsed messages follow the relevant customer instruction or purpose/contract/DSAR case retention; audit uses the approved 90-day ordinary-log target, subject to exceptions. Gmail copies need separate scope and evidence. No real purge until the proposed raw-MIME rule and exception handling have been reviewed and accepted.

## Gmail destination and mailbox operating policy — 2026-11-24

Owner confirms destination is a free personal Gmail account, not managed Workspace. No Vault retention or legal hold control is assumed. Google documents permanent deletion from Trash after 30 days; archiving is not erasure. This is mailbox behavior, not proof of backend copy expiry.

Proposed operating policy, subject to qualified review:
- Maintain a scoped RYTHM privacy correspondence register, with case ID, closure date, hold status, review due date and disposition; no full message body in the register. Use monthly manual/read-only review of privacy-alias messages and known replies; age alone cannot determine closure, scope, or lawful expiry.
- Open DSAR correspondence: preserve only what is necessary to resolve the request; delete unnecessary verification documents when no longer needed, subject to hold. Minimal closure receipt: 12 months after closure under the owner-approved target; do not apply this automatically to the complete case file. Ordinary support correspondence: proposed review 90 days after closure, not automatic deletion. Financial/contract evidence and holds use their separately documented basis and clock.
- Raw MIME in RYTHM: proposed 30-day maximum after receipt, only after verifying full extraction, dependencies and absence of retention exception. Existing old raw records remain review candidates. Parsed messages and Gmail copies have their own disposition.
- Before deleting an eligible message, verify case identity, sender/recipient scope, other participants, related replies and attachments, necessary evidence, legal holds, and copies in Sent/forwarded/archived/exported locations. Document disposition and Trash handling. Do not empty the entire personal mailbox Trash or apply blanket auto-delete filters. No real deletion authorized or performed by this update.
- Verify MFA, delegated access, forwarding rules and any external copies without collecting credentials or unrelated personal messages. Personal consumer Gmail does not establish business processor/DPA terms or transfer safeguards; review actual applicable terms and controller/processor role. If inadequate for handling customer data, migrate the privacy channel to a suitable business service before release; no purchase authorized.
- Cloudflare Production worker screenshot confirms Logs/Traces/Issues disabled and no displayed telemetry destinations, with sampling controls inactive (100% displayed). Separately, Cloudflare Email Service documents per-event routing activity including message metadata; the dashboard's 30-day filter range is not proof of physical retention. Review routing-specific logging/exports and applicable terms independently.

Sources: [Gmail deletion](https://support.google.com/mail/answer/7401), [Vault licensing](https://knowledge.workspace.google.com/admin/vault/assign-vault-licenses), [Cloudflare email activity logs](https://developers.cloudflare.com/email-service/observability/logs/), [routing analytics](https://developers.cloudflare.com/email-service/observability/metrics-analytics/).

## Release execution sequence

1. Complete provider evidence and legal sign-off above. Reconcile public notice, DPA and subprocessor register with actual settings and retention; no unsupported promises.
2. Review real account direct and indirect references, shared ownership, retained billing, files, queued work, provider records and all backup generations before real erasure. Keep scope/authority verification explicit. The current preview is not a complete account erasure engine.
3. Revalidate the exact integration candidate against current main, CI, isolated Supabase, and final preview. Review schema migration order and rollback plan preserving any erasure ledger.
4. Only when release gates are met: apply approved additive schema changes in correct order with a verified recovery point; deploy application and verify current version, health and scoped privacy endpoints. Do not exercise real account deletion as a smoke test. Record evidence and close W17 only when requirements are satisfied.
