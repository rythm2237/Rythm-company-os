import PublicShell from "./_components/PublicShell";
import "./marketing.css";
import "./public-shell-hardening.css";
import "./demo-mobile-hardening.css";

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="marketing-site"><PublicShell>{children}</PublicShell></div>;
}
