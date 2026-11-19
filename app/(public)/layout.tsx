import PublicShell from "./_components/PublicShell";
import PublicReferralObserver from "./_components/PublicReferralObserver";
import "./marketing.css";
import "./public-shell-hardening.css";
import "./demo-mobile-hardening.css";
import "./experience-mobile-fix.css";
import "./knowledge.css";
import "./public-mobile-hardening-v2.css";
import "./guided-tour-hardening.css";
import "./operating-model-cube.css";
import "./public-demo-layout.css";

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="marketing-site" data-public-build={process.env.VERCEL_GIT_COMMIT_SHA || undefined}>
      <PublicReferralObserver />
      <PublicShell>{children}</PublicShell>
    </div>
  );
}
