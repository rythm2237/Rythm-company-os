"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { OriginalMotion } from "./boardroom/motion";

const ARTWORK = "/brand/boardroom/ai-team.webp";

export default function BoardroomHeroMotion() {
  const hostRef = useRef<HTMLDivElement>(null);
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let scene: OriginalMotion | null = null;

    import("./boardroom/motion").then(({ mountOriginalMotion }) => {
      if (cancelled) return;
      try {
        scene = mountOriginalMotion(host, { imageUrl: ARTWORK, motion: 1 });
        host.querySelector("canvas")?.setAttribute("aria-hidden", "true");
        scene.ready.then(() => { if (!cancelled) setReady(true); }).catch(() => {
          scene?.dispose();
          if (!cancelled) setReady(false);
        });
      } catch {
        // The server-rendered artwork remains visible without canvas support.
        scene?.dispose();
      }
    }).catch(() => { /* A chunk-load failure leaves the static artwork intact. */ });

    return () => { cancelled = true; scene?.dispose(); };
  }, []);

  return (
    <>
    <div className="boardroom-hero-art" data-motion-ready={ready ? "true" : "false"}>
      <div className="boardroom-hero-framing">
      <Image
        className="boardroom-hero-poster"
        src={ARTWORK}
        alt="Specialized AI colleagues collaborating around a shared project, with an executive chair for the Human CEO."
        fill priority unoptimized
        sizes="(max-width: 1100px) 100vw, calc(100vw - 272px)"
      />
      <div className="boardroom-hero-canvas" ref={hostRef} />
      </div>
    </div>
    </>
  );
}
