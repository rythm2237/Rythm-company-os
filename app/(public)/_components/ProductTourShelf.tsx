import Link from "next/link";
import { PRODUCT_TOURS } from "@/lib/public-experience/content";

type Props = {
  compact?: boolean;
};

export default function ProductTourShelf({ compact = false }: Props) {
  const tours = compact ? PRODUCT_TOURS.slice(0, 3) : PRODUCT_TOURS;

  return (
    <section className="tour-shelf" aria-labelledby="product-tour-heading">
      <div className="marketing-section-heading">
        <p className="marketing-kicker">PRODUCT TOUR</p>
        <h2 id="product-tour-heading">Watch RYTHM in action.</h2>
        <p>
          Begin with the interactive Company OS tour. Focused micro-demos can be added to
          this same structure without blocking Public Beta.
        </p>
      </div>
      <div className="tour-grid">
        {tours.map((tour) => (
          <article className={tour.status === "available" ? "tour-card is-available" : "tour-card"} key={tour.id}>
            <div className="tour-card-topline">
              <p className="marketing-kicker">{tour.eyebrow}</p>
              <span>{tour.status === "available" ? "Available now" : "Planned"}</span>
            </div>
            <h3>{tour.title}</h3>
            <p>{tour.description}</p>
            {tour.href ? <Link href={tour.href}>Open interactive tour <span aria-hidden="true">→</span></Link> : <span className="tour-coming-soon">Micro-demo placement reserved</span>}
          </article>
        ))}
      </div>
    </section>
  );
}

