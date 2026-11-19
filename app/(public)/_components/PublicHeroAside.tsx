import Image from "next/image";
import type { ReactNode } from "react";

export type HeroArtwork = "team" | "workbench" | "governance";

export function illustrationForPath(path: string): HeroArtwork {
  if (/approval|privacy|security|trust|legal|terms|cookies|dpa|subprocessor|transparency|consumer|withdrawal|data-requests|status/.test(path)) return "governance";
  if (/template|compare|platforms|integrations|software|support/.test(path)) return "workbench";
  return "team";
}

/** Decorative editorial artwork: product copy remains the source of information. */
export default function PublicHeroAside({ children, variant = "team" }: { children: ReactNode; variant?: HeroArtwork }) {
  return <div className="public-hero-aside">
    <Image className="public-hero-artwork" src={`/illustrations/${variant}.webp`} alt="" aria-hidden="true"
      width={1100} height={825} sizes="(max-width: 760px) 90vw, (max-width: 1050px) 60vw, 38vw" />
    <div className="public-hero-aside-copy">{children}</div>
  </div>;
}
