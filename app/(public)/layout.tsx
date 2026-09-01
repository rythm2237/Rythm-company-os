import PublicShell from "./_components/PublicShell";
import PublicReferralObserver from "./_components/PublicReferralObserver";
import "./marketing.css";
import "./public-shell-hardening.css";
import "./demo-mobile-hardening.css";
import "./experience-mobile-fix.css";
import "./guided-tour-hardening.css";
import "./knowledge.css";

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <div className="marketing-site">
      <PublicReferralObserver />
      <PublicShell>{children}</PublicShell>
    </div>
  );
}
