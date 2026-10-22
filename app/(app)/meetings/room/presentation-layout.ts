export type Slide = { eyebrow: string; title: string; bullets: string[]; footer: string };

/** Fit against the actual rendered screen, preserving every character of meeting content. */
export function paginateSlides(slides: Slide[], fits: (slide: Slide) => boolean): Slide[] {
  const result: Slide[] = [];
  function take(text: string, candidate: (part: string) => Slide) {
    const chars = Array.from(text);
    let low = 1, high = chars.length, best = 0;
    while (low <= high) {
      const middle = Math.floor((low + high) / 2);
      if (fits(candidate(chars.slice(0, middle).join("")))) { best = middle; low = middle + 1; }
      else high = middle - 1;
    }
    // Prefer a word boundary, but handle URLs and scripts without spaces too.
    const prefix = chars.slice(0, Math.max(1, best)).join("");
    const space = prefix.lastIndexOf(" ");
    return space > prefix.length * .6 ? prefix.slice(0, space + 1) : prefix;
  }
  for (const source of slides) {
    let title = source.title;
    const empty = { ...source, bullets: [] };
    if (!fits({ ...empty, title })) {
      while (title) {
        const part = take(title, (value) => ({ ...empty, title: value }));
        result.push({ ...empty, title: part });
        title = title.slice(part.length);
      }
      title = "Discussion continued";
    }
    let page: Slide = { ...source, title, bullets: [] };
    for (const bullet of source.bullets) {
      let remaining = bullet;
      while (remaining) {
        if (fits({ ...page, bullets: [...page.bullets, remaining] })) {
          page.bullets.push(remaining); remaining = "";
        } else if (page.bullets.length) {
          result.push(page); page = { ...source, title, bullets: [] };
        } else {
          // A long but fitting title must leave room for at least one legible body line.
          if (!fits({ ...page, bullets: [Array.from(remaining)[0]] }) && title !== "Discussion continued") {
            result.push(page); title = "Discussion continued"; page = { ...source, title, bullets: [] };
            continue;
          }
          const part = take(remaining, (value) => ({ ...page, bullets: [value] }));
          result.push({ ...page, bullets: [part] });
          remaining = remaining.slice(part.length); page = { ...source, title, bullets: [] };
        }
      }
    }
    if (page.bullets.length || !source.bullets.length) result.push(page);
  }
  return result;
}

// Coordinates use the original 1672 × 941 room image. Left/right alternate by depth.
export const SEATS = [
  { id: "left-rear", x: "23%", y: "52%" }, { id: "right-rear", x: "77%", y: "52%" },
  { id: "left-middle", x: "16%", y: "64%" }, { id: "right-middle", x: "84%", y: "64%" },
  { id: "left-front", x: "17%", y: "81%" }, { id: "right-front", x: "83%", y: "81%" },
] as const;

export function assignSeats(ids: string[], previous: Map<string, string>) {
  const next = new Map([...previous].filter(([id]) => ids.includes(id)));
  for (const id of ids) {
    if (next.has(id)) continue;
    const seat = SEATS.find((item) => ![...next.values()].includes(item.id));
    if (seat) next.set(id, seat.id);
  }
  return next;
}
