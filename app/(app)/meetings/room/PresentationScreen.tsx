"use client";

import { useLayoutEffect, useRef, useState } from "react";
import { paginateSlides, type Slide } from "./presentation-layout";
import styles from "./boardroom-immersive.module.css";

type Props = { slides: Slide[]; index: number; onCount: (count: number) => void; mobile?: boolean };
export default function PresentationScreen({ slides, index, onCount, mobile = false }: Props) {
  const probe = useRef<HTMLElement>(null);
  const [pages, setPages] = useState(slides);
  const contentKey = JSON.stringify(slides);
  useLayoutEffect(() => {
    const element = probe.current;
    if (!element) return;
    const title = element.querySelector("h2")!;
    const list = element.querySelector("ul")!;
    const fit = () => {
      if (!element.clientWidth || !element.clientHeight) return;
      const source: Slide[] = JSON.parse(contentKey);
      const next = paginateSlides(source, (candidate) => {
        title.textContent = candidate.title;
        element.querySelector("footer")!.textContent = candidate.footer;
        element.querySelector(".screen-label")!.textContent = candidate.eyebrow;
        list.replaceChildren(...candidate.bullets.map((bullet) => {
          const li = document.createElement("li"); li.textContent = bullet; return li;
        }));
        return list.scrollHeight <= list.clientHeight + 1 && title.scrollHeight <= title.clientHeight + 1 && element.scrollHeight <= element.clientHeight + 1;
      });
      setPages(next); onCount(next.length);
    };
    fit();
    const observer = new ResizeObserver(fit); observer.observe(element);
    void document.fonts.ready.then(fit);
    return () => observer.disconnect();
  }, [contentKey, onCount]);
  const page = pages[index % Math.max(1, pages.length)] ?? slides[0];
  return <div className={mobile ? styles.mobilePresentation : styles.screenOverlay} data-presentation-screen>
    <article className={styles.slidePage} aria-live="polite" aria-label={`Presentation slide ${index % pages.length + 1} of ${pages.length}`}>
      <div className={styles.screenTop}><span>{page.eyebrow}</span><span>{index % pages.length + 1}/{pages.length}</span></div>
      <h2 dir="auto">{page.title}</h2>
      <ul>{page.bullets.map((bullet, i) => <li dir="auto" key={i}>{bullet}</li>)}</ul>
      <footer>{page.footer}</footer>
    </article>
    <article className={`${styles.slidePage} ${styles.measureSlide}`} ref={probe} aria-hidden="true">
      <div className={styles.screenTop}><span className="screen-label">MEETING OBJECTIVE</span><span>999/999</span></div><h2 /><ul /><footer>Human CEO retains final authority.</footer>
    </article>
  </div>;
}
