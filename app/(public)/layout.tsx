import type { Metadata } from "next";
import PublicShell from "./_components/PublicShell";
import "./marketing.css";

export const metadata: Metadata = {
  title: "Governed AI Companies",
};

export default function PublicLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <div className="marketing-site"><PublicShell>{children}</PublicShell></div>;
}
