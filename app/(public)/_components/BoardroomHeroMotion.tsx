"use client";

import Image from "next/image";
import { useEffect, useRef, useState } from "react";
import type { OriginalMotion } from "./boardroom/motion";

const ARTWORK = "/brand/boardroom/ai-team.webp";

export default function BoardroomHeroMotion() {
  const hostRef = useRef<HTMLDivElement>(null);
  const sceneRef = useRef<OriginalMotion | null>(null);
  const [ready, setReady] = useState(false);
  const [playing, setPlaying] = useState(false);

  useEffect(() => {
    const host = hostRef.current;
    if (!host) return;
    let cancelled = false;
    let scene: OriginalMotion | null = null;

    import("./boardroom/motion").then(({ mountOriginalMotion }) => {
      if (cancelled) return;
      try {
        scene = mountOriginalMotion(host, { imageUrl: ARTWORK, motion: 1, onPlayChange: setPlaying });
        sceneRef.current = scene;
        host.querySelector("canvas")?.setAttribute("aria-hidden", "true");
        setPlaying(scene.playing);
        scene.ready.then(() => { if (!cancelled) setReady(true); }).catch(() => {
          scene?.dispose();
          if (!cancelled) { sceneRef.current = null; setReady(false); }
        });
      } catch {
        // The server-rendered artwork remains visible without canvas support.
        scene?.dispose();
        sceneRef.current = null;
      }
    }).catch(() => { /* A chunk-load failure leaves the static artwork intact. */ });

    return () => { cancelled = true; scene?.dispose(); sceneRef.current = null; };
  }, []);

  return (
    <>
    <div className="boardroom-hero-art" data-motion-ready={ready ? "true" : "false"}>
      <Image
        className="boardroom-hero-poster"
        src={ARTWORK}
        alt="Specialized AI colleagues collaborating around a shared project, with an executive chair for the Human CEO."
        fill priority unoptimized
        sizes="(max-width: 1100px) 100vw, calc(100vw - 272px)"
      />
      <div className="boardroom-hero-canvas" ref={hostRef} />
    </div>
      {ready ? (
        <button
          className="boardroom-motion-toggle"
          type="button"
          aria-pressed={!playing}
          onClick={() => { const current = sceneRef.current; if (current) current.setPlaying(!current.playing); }}
        >
          <span aria-hidden="true">{playing ? "Ⅱ" : "▷"}</span>
          {playing ? "Pause motion" : "Play motion"}
        </button>
      ) : null}
    </>
  );
}
