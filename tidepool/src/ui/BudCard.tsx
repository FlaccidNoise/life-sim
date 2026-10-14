// The bud card: a parent and its child side by side, and each difference as one line with a mark on
// the side it belongs to. It takes no pointer but on the "?" mark of its note: the world runs on
// under it.

import type { ComponentChild } from 'preact';
import {
  KIND_CHEMO,
  KIND_CILIA,
  KIND_EYE,
  KIND_FILTER,
  KIND_FIN,
  KIND_FLAGELLUM,
  type Kin,
  type Part,
} from '../protocol';
import { swatch } from './DeathOverlay';
import { Note, NoteMark } from './Note';
import { budOpen, lastBud, noteOpen, type Bud } from './state';
import { BUD } from './words/lines';

const MAX_LINES = 5; // with more differences, the last line counts the rest
const HALF = 22; // half the length of a drawn body, in the units of the sketch
const WATER = '#04121c';

// One part at its anchor, drawn along +x, which points out of the body.
function shapeOf(part: Part): ComponentChild {
  const s = part.size;
  switch (part.kind) {
    case KIND_FLAGELLUM: {
      const step = (6 + 28 * s) / 4;
      return <path d={`M0 0q${step / 2} 3 ${step} 0t${step} 0t${step} 0t${step} 0`} />;
    }
    case KIND_FILTER:
      return <circle r={1.5 + 3 * s} fill={WATER} />;
    case KIND_CHEMO:
      return (
        <>
          <path d={`M0 0h${3 + 6 * s}`} />
          <circle cx={3 + 6 * s} r="1.3" fill="currentColor" />
        </>
      );
    case KIND_FIN:
      return <path d={`M-1 -3L${3 + 8 * s} 0L-1 3Z`} fill="currentColor" />;
    case KIND_EYE:
      return (
        <>
          <circle r={1.6 + 2.4 * s} fill="currentColor" />
          <circle r={0.8 + 1.2 * s} fill={WATER} stroke="none" />
        </>
      );
    default:
      return <circle r="1.5" fill="currentColor" />;
  }
}

// A body from its own record: its hue, its width as a share of its length, and its parts at their
// anchors. The nose is on the right. Every body is drawn at one length. `marked` are the places in
// its part list of the parts that a line of the card is about.
function Sketch(props: { kin: Kin; marked: number[] }) {
  const { kin, marked } = props;
  const ry = kin.length > 0 ? (HALF * kin.width) / kin.length : 0;
  return (
    <svg viewBox="-60 -30 96 60" aria-hidden="true">
      <ellipse rx={HALF} ry={ry} fill={swatch(kin.hue, 1)} stroke="none" />
      {kin.parts.map((part, i) => {
        // Cilia are all round the membrane. Each other part is at its anchor: one on the midline
        // at the nose or the tail, and a mirrored pair at any other place.
        const turn = part.anchor * Math.PI;
        const [cos, sin] = [Math.cos(turn), Math.sin(turn)];
        const sides = part.anchor === 0 || part.anchor === 1 ? [1] : [1, -1];
        return (
          <g key={i} class={marked.includes(i) ? 'marked' : undefined}>
            {part.kind === KIND_CILIA ? (
              <ellipse
                rx={HALF + 2}
                ry={ry + 2}
                stroke-width={1 + 3 * part.size}
                stroke-dasharray="0.8 2.6"
              />
            ) : (
              sides.map((side) => {
                // The outward normal of the outline at the anchor.
                const out = (Math.atan2(side * sin * HALF, cos * ry) * 180) / Math.PI;
                return (
                  <g
                    key={side}
                    transform={`translate(${cos * HALF} ${side * sin * ry}) rotate(${out})`}
                  >
                    {shapeOf(part)}
                  </g>
                );
              })
            )}
          </g>
        );
      })}
    </svg>
  );
}

/** What the card holds, for the card and for chapter 3 of the field guide. */
export function BudBody(props: { bud: Bud }) {
  const { bud } = props;
  const marked = (side: 'parent' | 'child'): number[] =>
    bud.lines.flatMap((d) => (d.side === side && d.part !== undefined ? [d.part] : []));
  const lines = bud.lines.length > MAX_LINES ? bud.lines.slice(0, MAX_LINES - 1) : bud.lines;
  const rest = bud.lines.length - lines.length;
  return (
    <>
      <div class="bud-pair">
        <figure>
          <Sketch kin={bud.parent} marked={marked('parent')} />
          <figcaption>{BUD.parent}</figcaption>
        </figure>
        <figure>
          <Sketch kin={bud.child} marked={marked('child')} />
          <figcaption>{BUD.child}</figcaption>
        </figure>
      </div>
      {bud.lines.length === 0 ? (
        <p>{BUD.none}</p>
      ) : (
        <ul>
          {lines.map((d, i) => (
            <li key={i} class={d.side}>
              {d.text}
            </li>
          ))}
          {rest > 0 && <li class="bud-note">{BUD.more.replace('{n}', String(rest))}</li>}
        </ul>
      )}
      {bud.brood > 1 && <p class="bud-note">{BUD.brood.replace('{n}', String(bud.brood))}</p>}
      {bud.childDied && <p class="bud-note">{BUD.died}</p>}
      {!bud.brainRead && <p class="bud-note">{BUD.noBrain}</p>}
      <p class="bud-note">{BUD.oneLength}</p>
    </>
  );
}

// The card stays up for as long as its note is open.
export function BudCard() {
  const bud = lastBud.value;
  if (!bud || !(budOpen.value || noteOpen.value === 'bud')) return null;
  return (
    <div class="bud" role="status">
      <p class="bud-head">
        {BUD.heading} <NoteMark id="bud" />
      </p>
      <Note id="bud" />
      <BudBody bud={bud} />
    </div>
  );
}
