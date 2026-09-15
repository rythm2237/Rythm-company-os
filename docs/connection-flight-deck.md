# RYTHM Connection Flight Deck

The Connection Flight Deck is the universal live execution surface for governed customer integrations.

## Runtime contract

- A live-browser status is shown only when a real cloud browser session exists.
- OAuth providers launch their real provider authorization flow inside the Browserbase session.
- Token-based providers use the same Flight Deck and hand sensitive credential creation/value handling to the Human.
- Passwords, MFA, passkeys and CAPTCHA remain Human-only.
- Browser recording, Browserbase session logging and CAPTCHA solving remain disabled.
- The user may minimize the Flight Deck while the durable server-side setup session continues.
- A global Company OS dock reopens the active setup session from any workspace page.
- Connected/completed states require provider verification and any required project-resource binding evidence.

## Internal rollout providers

Google Search Console, Google Analytics 4, Google Workspace, Microsoft 365, GitHub, Vercel, Supabase and Cloudflare share this experience. The rollout remains `internal` and organization-allowlisted until provider E2E validation is complete.
