import Link from "next/link";
import { login } from "./actions";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">RYTHM COMPANY OS</p>
          <h1 id="login-title" className="auth-title">Human CEO access</h1>
          <p className="auth-copy">Sign in to an organization you own or belong to.</p>
        </div>

        {params.message ? <p className="form-success" role="status">{params.message}</p> : null}
        {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

        <form action={login} className="auth-form">
          <input type="hidden" name="next" value={params.next ?? "/command-center"} />
          <label>Email<input name="email" type="email" autoComplete="email" required /></label>
          <label>Password<input name="password" type="password" autoComplete="current-password" required /></label>
          <button type="submit">Sign in</button>
        </form>

        <p className="security-note"><Link href="/forgot-password">Forgot password?</Link></p>
        <p className="security-note">Access is restricted by Supabase authentication, validated organization membership, and role-based governance.</p>
        <p className="security-note">New B2B customer? <Link href="/signup">Create an account</Link></p>
      </section>
    </main>
  );
}
