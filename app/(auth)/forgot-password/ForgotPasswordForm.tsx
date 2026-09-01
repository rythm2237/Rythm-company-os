"use client";

import { FormEvent, useMemo, useState } from "react";
import { createAuthBrowserClient } from "@/lib/supabase/auth-browser";

const RESET_REDIRECT_URL = "https://rythm-os.com/auth/callback?next=/reset-password";

export function ForgotPasswordForm() {
  const supabase = useMemo(() => createAuthBrowserClient(), []);
  const [email, setEmail] = useState("");
  const [pending, setPending] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  async function onSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setPending(true);
    setError(null);
    setMessage(null);

    const normalizedEmail = email.trim().toLowerCase();
    if (!normalizedEmail) {
      setError("Email is required.");
      setPending(false);
      return;
    }

    const { error: resetError } = await supabase.auth.resetPasswordForEmail(normalizedEmail, {
      redirectTo: RESET_REDIRECT_URL,
    });

    if (resetError) {
      console.error("password_reset_request_failed", {
        status: resetError.status,
        code: resetError.code,
        message: resetError.message,
      });
      setError("We could not send a reset email right now. Please try again in a moment.");
      setPending(false);
      return;
    }

    setMessage("If an account exists for that email, a password reset link has been sent. Open the newest email in this same browser to continue.");
    setPending(false);
  }

  return (
    <>
      {message ? <p className="form-success" role="status">{message}</p> : null}
      {error ? <p className="form-error" role="alert">{error}</p> : null}
      <form onSubmit={onSubmit} className="auth-form">
        <label>
          Email
          <input
            name="email"
            type="email"
            autoComplete="email"
            required
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            disabled={pending}
          />
        </label>
        <button type="submit" disabled={pending}>{pending ? "Sending…" : "Send reset link"}</button>
      </form>
    </>
  );
}
