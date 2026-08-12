import Link from "next/link";
import { requestPasswordReset } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="forgot-password-title">
        <div>
          <p className="eyebrow">RYTHM COMPANY OS</p>
          <h1 id="forgot-password-title" className="auth-title">Reset your password</h1>
          <p className="auth-copy">Enter your account email. If the account exists, RYTHM will send a secure password reset link.</p>
        </div>

        {params.message ? <p className="form-success" role="status">{params.message}</p> : null}
        {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

        <form action={requestPasswordReset} className="auth-form">
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <button type="submit">Send reset link</button>
        </form>

        <p className="security-note">For security, this page does not disclose whether an email is registered.</p>
        <p className="security-note"><Link href="/login">Back to sign in</Link></p>
      </section>
    </main>
  );
}
