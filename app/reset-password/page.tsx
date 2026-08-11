import { redirect } from "next/navigation";
import { createAuthServerClient } from "@/lib/supabase/auth-server";
import { updatePassword } from "./actions";

export const dynamic = "force-dynamic";

type Props = {
  searchParams: Promise<{ error?: string }>;
};

export default async function ResetPasswordPage({ searchParams }: Props) {
  const params = await searchParams;
  const supabase = await createAuthServerClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (!user) {
    redirect(`/login?error=${encodeURIComponent("Password reset session is missing or expired. Request a new reset link.")}`);
  }

  return (
    <main className="auth-shell">
      <section className="auth-card" aria-labelledby="reset-password-title">
        <div>
          <p className="eyebrow">RYTHM COMPANY OS</p>
          <h1 id="reset-password-title" className="auth-title">Choose a new password</h1>
          <p className="auth-copy">Set a new password for {user.email ?? "your RYTHM account"}.</p>
        </div>

        {params.error ? <p className="form-error" role="alert">{params.error}</p> : null}

        <form action={updatePassword} className="auth-form">
          <label>New password<input name="password" type="password" autoComplete="new-password" required minLength={8} /></label>
          <label>Confirm new password<input name="confirmPassword" type="password" autoComplete="new-password" required minLength={8} /></label>
          <button type="submit">Update password</button>
        </form>

        <p className="security-note">After the password is updated, this recovery session is signed out and you must sign in again.</p>
      </section>
    </main>
  );
}
