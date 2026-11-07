# W04 owner decision — seven anonymous booking/contact RPC exceptions

**Decision date:** 2026-11-07 (Europe/Budapest).

**Authority:** The project owner explicitly responded **«تأیید می‌کنم»** in the current RYTHM W04 conversation, directly to the question:

> آیا موافقی هفت تابع عمومی رزرو و تماس `nail_2nya_*` با همین کنترل‌های امنیتی آزمایش‌شده، همچنان برای کاربران بدون ورود به حساب قابل‌دسترسی بمانند؟

**Interpretation:** APPROVED, limited strictly to preservation of unauthenticated `EXECUTE` for the seven listed public functions in the already-tested implementation:

| Function signature | Intended public scope |
|---|---|
| `public.nail_2nya_available_dates(uuid,date,integer)` | Available dates and counts |
| `public.nail_2nya_available_slots(date,uuid)` | Available appointment slots |
| `public.nail_2nya_create_booking(uuid,timestamptz,text,text,text,text,text)` | Customer booking with validation |
| `public.nail_2nya_get_booking(uuid,text)` | Token-authorized booking lookup |
| `public.nail_2nya_cancel_booking(uuid,text)` | Token-authorized cancellation |
| `public.nail_2nya_subscribe_customer_push(uuid,text,text,text,text)` | Token- and expiry-authorized push subscription |
| `public.nail_2nya_create_contact_message(text,text,text,text)` | Validated public contact form |

**Required security constraints stay in force:** uphold W04 token expiry checks, rate-limit controls where implemented, transaction-level tenant protection, existing input validation and signed-off exact privileges. This decision is **not** approval for any other anonymous RPC or for changing any public service's broader privacy/rate-limit posture.

**Evidence considered:** `docs/security/w04-rpc-runtime-coverage-2026-11-06.md` and `docs/security/w04-staging-evidence-2026-11-06.md`; all seven paths underwent staging end-to-end positive/negative tests using synthetic data and `ROLLBACK`. Security Advisor retains seven intentional anonymous-executable definer warnings; these are documented exception notices, not automatically evidence of vulnerabilities.

**Explicitly NOT authorized by this approval:**
- Merge of PR #441 into `main`, converting PR to ready-for-review, or any production deployment.
- Production schema/migration changes, production data mutations, or paid resources.
- Waiver of W01/W02 dependency evidence, schema-drift review, or other W04 release gates.
- A claim of exhaustive security proof over all inputs.

**Owner-exception gate:** PASS (owner-approved); **W04 staging technical gate:** PASS; **production release gate:** PENDING separate authorization and dependency verification.
