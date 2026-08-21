# Cloudflare Email Worker security boundary

The public inbound endpoint is `POST /api/communication/inbound/cloudflare`.

Security controls:
- shared secret required in `x-rythm-email-secret`
- constant-time comparison
- exact active mailbox lookup in Supabase
- tenant-scoped inserts via service role only after mailbox resolution
- duplicate suppression through provider message identifiers
- 3 MiB raw message limit
- raw MIME retained for audit/reparse
- unknown managed-mailbox aliases return 404 and should be rejected by the Email Worker

Do not commit the real shared secret. Keep it only in the Cloudflare Worker and Vercel Production environment.
