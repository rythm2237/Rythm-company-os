import { login } from "./actions";

export const dynamic = "force-dynamic";

type LoginPageProps = {
  searchParams: Promise<{ error?: string; next?: string }>;
};

export default async function LoginPage({ searchParams }: LoginPageProps) {
  const params = await searchParams;

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="login-title">
        <div>
          <p className="eyebrow">RYTHM COMPANY OS</p>
          <h1 id="login-title" className="auth-title">CEO access</h1>
          <p className="auth-copy">
            Sign in with the Human CEO account registered in the RYTHM organization.
          </p>
        </div>

        {params.error ? (
          <p className="form-error" role="alert">{params.error}</p>
        ) : null}

        <form action={login} className="auth-form">
          <input type="hidden" name="next" value={params.next ?? "/command-center"} />

          <label>
            Email
            <input name="email" type="email" autoComplete="email" required />
          </label>

          <label>
            Password
            <input name="password" type="password" autoComplete="current-password" required />
          </label>

          <button type="submit">Sign in</button>
        </form>

        <p className="security-note">
          Access is restricted by Supabase authentication, organization membership, and Owner role.
        </p>
      </section>
    </main>
  );
}
