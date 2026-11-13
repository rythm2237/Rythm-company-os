import Link from "next/link";
import { headers } from "next/headers";
import { authCallbackOrigin } from "@/lib/auth/redirect";
import { ForgotPasswordForm } from "./ForgotPasswordForm";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string; message?: string }>;
};

export default async function ForgotPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const origin = authCallbackOrigin(process.env, (await headers()).get("host") ?? undefined);
  const redirectTo = `${origin}/auth/callback?next=/reset-password`;

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

        <ForgotPasswordForm redirectTo={redirectTo} />

        <p className="security-note">For security, this page does not disclose whether an email is registered.</p>
        <p className="security-note">For the secure PKCE recovery flow, open the reset email in the same browser where you requested it.</p>
        <p className="security-note"><Link href="/login">Back to sign in</Link></p>
      </section>
    </main>
  );
}
