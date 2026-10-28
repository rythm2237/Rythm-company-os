# Recovered W01 replay sources

These three original migration payloads were recovered by read-only SELECT from
Production schema_migrations.statements on 2026-10-28. They were reviewed for
credentials, business records and external side effects before inclusion here.
They are original migration source, not the private Production schema dump.

The foundation includes a bootstrap INSERT for the public business-profile
defaults (business name and already-public Instagram URL); it contains no
customer/contact/appointment rows or credentials. Other INSERT statements are
function bodies, not populated customer data. The two follow-ups harden grants,
policy expressions and indexes. No scheduler, network, Vault or secret bootstrap
is invoked by these payloads.

Exact UTF-8 payload bytes are checked against independently queried Production
history MD5 values in prepare-w01-local-migrations.mjs. No newline normalization
or dummy dependency definitions are used. The source was not modified.

These are supplemental inputs to disposable offline replay ONLY. The historical
218-file repository inventory remains unchanged. No production migration
directory is changed, no production history is rewritten, and nothing is
automatically deployed to Production. The replay manifest separately records
original count 218, supplemental count 3, and effective count 221.

Passing source preparation does not attest complete historical replay or
catalog parity. The physical disposable replay and resulting catalog assertions
must pass independently; existing quarantined data-seed/order deviations remain
explicit. Adding these three sources alone is not full W01 acceptance.
