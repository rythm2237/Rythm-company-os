import assert from 'node:assert/strict';
import { assignSeats, paginateSlides, SEATS, type Slide } from '../app/(app)/meetings/room/presentation-layout';
const text = 'A long dynamic description with evidence, dependencies and an accountable owner. '.repeat(12);
const title = 'A long decision question '.repeat(14);
const slide: Slide = { eyebrow:'MEETING OBJECTIVE', title, bullets:[text,'Independent final point'], footer:'CEO authority' };
// Deterministic capacity model checks preservation; browser QA supplies real geometry.
const fits = (page: Slide) => page.title.length <= 75 && page.title.length + page.bullets.join('').length <= 180;
const pages = paginateSlides([slide], fits);
assert(pages.length > 5);
assert(pages.every(fits));
assert.equal(pages.flatMap(p=>p.bullets).join(''),slide.bullets.join(''));
assert.equal(pages.filter(p=>!p.bullets.length).map(p=>p.title).join(''),title);
for (const count of [1,2,4,6,9]) {
 const ids=Array.from({length:count},(_,i)=>`agent-${i}`);
 const assigned=assignSeats(ids,new Map());
 assert.equal(assigned.size,Math.min(count,6));
 assert.equal(new Set(assigned.values()).size,assigned.size);
 if(count===4) assert.equal([...assigned.values()].filter(s=>s.startsWith('left')).length,2);
 const changed=assignSeats([...ids.slice(1),'new-agent'],assigned);
 for(const id of ids.slice(1)) if(assigned.has(id)) assert.equal(changed.get(id),assigned.get(id));
}
assert.equal(SEATS.length,6);
for(const seat of SEATS) assert(parseFloat(seat.y)>42.61,'Seat stays below LCD');
console.log('Boardroom layout: pagination preserves full content; stable, balanced unique seat assignment passed.');
