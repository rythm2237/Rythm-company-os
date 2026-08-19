import Link from "next/link";
import { signInWithOAuth } from "../oauth-actions";
import { login } from "./actions";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; message?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;
  const next = params.next ?? "/command-center";

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

        <div style={{ display: "grid", gap: 10, marginTop: 24 }} aria-label="Social sign in options">
          <form action={signInWithOAuth}>
            <input type="hidden" name="provider" value="google" />
            <input type="hidden" name="source" value="login" />
            <input type="hidden" name="next" value={next} />
            <button className="secondary-button" style={{ width: "100%" }} type="submit">
              Continue with Google
            </button>
          </form>
          <form action={signInWithOAuth}>
            <input type="hidden" name="provider" value="azure" />
            <input type="hidden" name="source" value="login" />
            <input type="hidden" name="next" value={next} />
            <button className="secondary-button" style={{ width: "100%" }} type="submit">
              Continue with Microsoft
            </button>
          </form>
        </div>

        <div style={{ display: "flex", alignItems: "center", gap: 12, marginTop: 22, color: "#788296", fontSize: ".78rem" }}>
          <span style={{ height: 1, background: "#e1e5ec", flex: 1 }} />
          <span>or continue with email</span>
          <span style={{ height: 1, background: "#e1e5ec", flex: 1 }} />
        </div>

        <form action={login} className="auth-form" autoComplete="on">
          <input type="hidden" name="next" value={next} />
          <label htmlFor="login-email">
            Email
            <input
              id="login-email"
              name="email"
              type="email"
              inputMode="email"
              autoComplete="username"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
          </label>
          <label htmlFor="login-password">
            Password
            <input
              id="login-password"
              name="password"
              type="password"
              autoComplete="current-password"
              required
            />
          </label>
          <button type="submit">Sign in</button>
        </form>

        <p className="security-note"><Link href="/forgot-password">Forgot password?</Link></p>
        <p className="security-note">Access is restricted by Supabase authentication, validated organization membership, and role-based governance.</p>
        <p className="security-note">New B2B customer? <Link href="/signup">Create an account</Link></p>
      </section>
    </main>
  );
}
