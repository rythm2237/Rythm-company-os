# Cloudflare Email Worker setup

RYTHM inbound mail uses Cloudflare Email Routing / Email Workers for addresses in the form `department.company@rythm-os.com`.

1. Create an Email Worker named `rythm-mail-inbound`.
2. Use the source in `docs/cloudflare-email-worker.js`.
3. Replace `REPLACE_WITH_THE_SAME_LONG_RANDOM_SECRET` with a long random secret.
4. Set the same value in the Vercel Production environment as `CLOUDFLARE_EMAIL_INGEST_SECRET`.
5. Deploy the Worker.
6. Route the Email Routing catch-all to the Worker. Explicit existing routing rules remain more specific and should continue forwarding to their current destinations.
7. Send a test message to a known managed mailbox, e.g. `support.rythm@rythm-os.com`.

The RYTHM endpoint rejects unknown mailboxes and messages larger than 3 MiB. Raw MIME is retained in `communication_messages.raw_mime` for lossless future reparsing.
