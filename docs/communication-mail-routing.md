# RYTHM managed mail routing

Product-facing system mailbox format:

`department.company-slug@rythm-os.com`

Examples:
- `support.rythm@rythm-os.com`
- `sales.rythm@rythm-os.com`
- `finance.rythm@rythm-os.com`

Transport split for the MVP:

- Inbound: Cloudflare Email Routing / Email Worker on the root `rythm-os.com` MX records.
- Outbound: Resend using a verified `rythm-os.com` sending identity.
- System of record: RYTHM Communication Center / Supabase.
- Auto-send: disabled. Human approval remains required.

Do not replace the root Cloudflare MX records with Resend receiving MX records. Existing root-domain email routing must remain intact.
