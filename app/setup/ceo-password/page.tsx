import { redirect } from "next/navigation";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

const CEO_USER_ID = "30f4573e-e045-4740-b8d9-8bd7b592df46";

async function setCeoPassword(formData: FormData) {
  "use server";

  const setupToken = String(formData.get("setupToken") ?? "");
  const password = String(formData.get("password") ?? "");
  const confirmation = String(formData.get("confirmation") ?? "");
  const expectedToken = process.env.RYTHM_SETUP_TOKEN;

  if (!expectedToken || setupToken !== expectedToken) {
    redirect("/setup/ceo-password?error=Invalid%20or%20missing%20setup%20token.");
  }

  if (password.length < 12) {
    redirect("/setup/ceo-password?error=Password%20must%20contain%20at%20least%2012%20characters.");
  }

  if (password !== confirmation) {
    redirect("/setup/ceo-password?error=Passwords%20do%20not%20match.");
  }

  const supabase = createServerSupabaseClient();
  if (!supabase) {
    redirect("/setup/ceo-password?error=Server%20administration%20client%20is%20not%20configured.");
  }

  const { error } = await supabase.auth.admin.updateUserById(CEO_USER_ID, {
    password,
    email_confirm: true,
  });

  if (error) {
    redirect(`/setup/ceo-password?error=${encodeURIComponent(error.message)}`);
  }

  redirect("/login?message=CEO%20password%20updated.%20Sign%20in%20with%20the%20new%20password.");
}

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
          <p className="form-error" role="alert">Setup is locked. Add RYTHM_SETUP_TOKEN in Vercel and redeploy.</p>
        ) : null}

        {error ? <p className="form-error" role="alert">{error}</p> : null}

        <form action={setCeoPassword} className="auth-form">
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
