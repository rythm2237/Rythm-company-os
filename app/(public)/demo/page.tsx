import type { Metadata } from "next";
import Link from "next/link";
import DemoWorkspace from "../_components/DemoWorkspace";
import { NOVA_COMMERCE_DEMO, type DemoSurfaceId } from "@/lib/demo/nova-commerce";

export const metadata: Metadata = {
  title: "Interactive Demo",
  description: "Explore Nova Commerce, a synthetic read-only RYTHM Company OS workspace with governed AI Agents, projects, meetings, decisions, and traceability.",
};

type Props = { searchParams: Promise<{ surface?: string }> };

export default async function DemoPage({ searchParams }: Props) {
  const { surface } = await searchParams;
  const initialSurface = NOVA_COMMERCE_DEMO.surfaces.some((item) => item.id === surface)
    ? surface as DemoSurfaceId
    : "command";

  return (
    <main className="demo-page">
      <section className="demo-page-intro">
        <div>
          <p className="marketing-kicker">INTERACTIVE PRODUCT EXPERIENCE</p>
          <h1>Enter a company that is already operating.</h1>
        </div>
        <div>
          <p>Nova Commerce is a safe, synthetic organization built to show how RYTHM feels before you create an account or choose a product.</p>
          <div className="demo-safety"><span>Public</span><span>Read only</span><span>No Production tenant data</span><span>No external actions</span></div>
        </div>
      </section>
      <DemoWorkspace initialSurface={initialSurface} />
      <section className="demo-conversion-section">
        <div><p className="marketing-kicker">THE DEMO IS TEMPORARY. A RYTHM COMPANY IS PERSISTENT.</p><h2>Ready to build your AI workforce?</h2><p>Compare Ready, Custom, and Enterprise paths after you have explored the operating environment.</p></div>
        <div className="hero-actions"><Link className="marketing-button" href="/pricing">Compare products</Link><Link href="/signup">Get Started</Link></div>
      </section>
    </main>
  );
}

