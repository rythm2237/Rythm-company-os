import Image from "next/image";
import styles from "./preview.module.css";

export const metadata = {
  title: "RYTHM Boardroom — Approved Design Preview",
  robots: { index: false, follow: false },
};

const controls = [
  ["Approve", styles.approve],
  ["Pause", styles.pause],
  ["Manager Intervention", styles.intervene],
  ["Request Summary", styles.summary],
  ["Next Action", styles.nextAction],
  ["Next Slide", styles.nextSlide],
  ["End Meeting", styles.end],
] as const;

export default function BoardroomPreviewPage() {
  return (
    <main className={styles.preview} aria-label="RYTHM Boardroom design preview">
      <section className={styles.canvas}>
        <Image
          src="/boardroom-reference.webp"
          alt="Approved RYTHM OS executive boardroom interface"
          fill
          priority
          unoptimized
          sizes="100vw"
          className={styles.reference}
        />

        {controls.map(([label, className]) => (
          <button key={label} type="button" aria-label={label} title={label} className={`${styles.hotspot} ${className}`} />
        ))}

        <button type="button" aria-label="Invite participant" title="Invite participant" className={`${styles.hotspot} ${styles.participantHit}`} />
        <button type="button" aria-label="Current speaker" title="Current speaker" className={`${styles.hotspot} ${styles.activeSpeakerHit}`} />
        <button type="button" aria-label="Presentation screen" title="Presentation screen" className={`${styles.hotspot} ${styles.screenHit}`} />
        <button type="button" aria-label="Meeting Manager" title="Meeting Manager" className={`${styles.hotspot} ${styles.meetingManagerHit}`} />
      </section>
    </main>
  );
}
