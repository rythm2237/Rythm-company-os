export const dynamic = "force-dynamic";

type SetupPageProps = {
  searchParams: Promise<{ error?: string }>;
};

export default async function CeoPasswordSetupPage({ searchParams }: SetupPageProps) {
  const { error } = await searchParams;
  const setupEnabled = Boolean(process.env.RYTHM_SETUP_TOKEN);

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="setup-title">
        <p className="eyebrow">RYTHM SECURE SETUP</p>
        <h1 id="setup-title" className="auth-title">Set CEO password</h1>
        <p className="auth-copy">
          This temporary server-only workflow updates the existing Human CEO account without changing its UID or Owner membership.
        </p>

        {!setupEnabled ? (
          <p className="form-error" role="alert">
            Setup is locked. Add RYTHM_SETUP_TOKEN in Vercel and redeploy.
          </p>
        ) : null}

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <form action="/api/setup/ceo-password" method="post" className="auth-form">
          <label>
            Temporary setup token
            <input name="setupToken" type="password" autoComplete="off" required />
          </label>
          <label>
            New password
            <input name="password" type="password" autoComplete="new-password" minLength={12} required />
          </label>
          <label>
            Confirm new password
            <input name="confirmation" type="password" autoComplete="new-password" minLength={12} required />
          </label>
          <button type="submit" disabled={!setupEnabled}>Update CEO password</button>
        </form>

        <p className="security-note">
          After successful login, remove RYTHM_SETUP_TOKEN and this temporary route will be removed from the codebase.
        </p>
      </section>
    </main>
  );
}
