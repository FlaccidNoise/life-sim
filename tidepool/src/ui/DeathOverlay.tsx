// The death overlay: the cause, then the heirs to continue as, or the end of the line. The first
// death with a living descendant leads with the descendants, and the cause comes after them. A death
// with a killer shows the killer's card with the cause: its body and its brain at the kill.

import { signal } from '@preact/signals';
import { useEffect, useRef } from 'preact/hooks';
import type { BrainView, DeathCause, Heir, Killer } from '../protocol';
import { BrainStill } from './BrainPanel';
import { Sketch } from './BudCard';
import { Note, NoteMark } from './Note';
import { heirGone } from './state';
import { FIRST_DEATH } from './words/lines';

const CAUSE_TEXT: Record<DeathCause, string> = {
  starved: 'You starved.',
  'old age': 'You died of old age.',
  eaten: 'Eaten.',
  poisoned: 'Poisoned.',
  spiked: 'Spiked a spiked body.',
};

/**
 * The killer of the last death, as the `died` message carried it. `brain` is null for a readout of 0
 * words or one that was not read, and `brainError` says why it was not read. main.ts sets it with
 * `death` and clears it with `death`.
 */
export interface KillerCard {
  killer: Killer;
  brain: BrainView | null;
  brainError: string | null;
}
export const killerCard = signal<KillerCard | null>(null);

// The page's style sheet styles the sketch of the bud card only.
const SKETCH_STYLE = {
  flex: 'none',
  width: '6rem',
  margin: 0,
  color: '#cfe6ee',
  fill: 'none',
  stroke: 'currentColor',
  strokeWidth: 1.2,
  strokeLinecap: 'round',
  strokeLinejoin: 'round',
} as const;

// The card holds what the message carried: a frame that no longer holds the killer changes nothing.
function KillerBody(props: { card: KillerCard }) {
  const { killer, brain, brainError } = props.card;
  const kin = { ...killer, growth: 1, flags: 0, hidden: 0, conns: 0 };
  return (
    <div class="killer">
      <div class="heir-top" style={{ justifyContent: 'center', margin: '4px 0' }}>
        <figure style={SKETCH_STYLE}>
          <Sketch kin={kin} marked={[]} />
        </figure>
        <span style={{ textAlign: 'left' }}>
          The body that killed you.
          <span class="heir-top">
            <span class="swatch" style={{ background: swatch(killer.hue, 1) }} />
            Generation {killer.generation}
          </span>
        </span>
      </div>
      {brainError !== null ? (
        <p role="alert">Its brain could not be read.</p>
      ) : (
        brain && (
          <>
            <p>Its brain at the kill:</p>
            <BrainStill brain={brain} />
          </>
        )
      )}
    </div>
  );
}

// The body shader colours a creature in HSV: saturation 0.2 to 0.7 and value 0.5 to 1 with energy.
// CSS has HSL, so this converts the same colour.
export function swatch(hue: number, energy01: number): string {
  const e = Math.min(Math.max(energy01, 0), 1);
  const s = 0.2 + 0.5 * e;
  const v = 0.5 + 0.5 * e;
  const l = v * (1 - s / 2);
  const sl = l === 0 || l === 1 ? 0 : (v - l) / Math.min(l, 1 - l);
  return `hsl(${hue * 360} ${sl * 100}% ${l * 100}%)`;
}

export function DeathOverlay(props: {
  cause: DeathCause;
  heirs: Heir[];
  onPick: (uid: number) => void;
  onWatch: () => void;
  onFocus: (heir: Heir | null) => void;
  first: boolean; // the player has not gone on as an heir yet
}) {
  const { cause, heirs } = props;
  const lineFirst = props.first && heirs.length > 0;
  // The overlay takes the focus when it comes up: the first heir, or its heading when the line has
  // ended. A key that steered does not press a button.
  const section = useRef<HTMLElement>(null);
  useEffect(() => {
    const overlay = section.current;
    (overlay?.querySelector<HTMLElement>('.heir') ?? overlay?.querySelector('p'))?.focus();
  }, []);
  const card = killerCard.value;
  const causeLine = (
    <>
      <p
        class={lineFirst ? 'death-after' : 'death-cause'}
        role={lineFirst ? undefined : 'status'}
        tabIndex={lineFirst ? undefined : -1}
      >
        {CAUSE_TEXT[cause]} {cause === 'eaten' && <NoteMark id="hunter" />}
      </p>
      <Note id="hunter" />
      {card && <KillerBody card={card} />}
    </>
  );
  return (
    <section
      class="death"
      aria-label="You died"
      ref={section}
      style={card ? { maxHeight: 'calc(100% - 32px)' } : undefined}
    >
      {lineFirst ? (
        <p class="death-cause" role="status" tabIndex={-1}>
          {FIRST_DEATH}
        </p>
      ) : (
        causeLine
      )}
      <p class="death-next">
        {heirs.length === 0 ? 'Your line has ended.' : 'Continue as a descendant.'}{' '}
        <NoteMark id="death" />
      </p>
      <Note id="death" />
      {heirGone.value && (
        <p class="death-gone" role="alert">
          That one is gone.
        </p>
      )}
      {heirs.length > 0 && (
        <div class="heirs">
          {heirs.map((heir) => (
            <button
              type="button"
              class="heir"
              key={heir.uid}
              aria-label={`Generation ${heir.generation}, energy ${Math.round(heir.energy01 * 100)} percent`}
              onClick={() => props.onPick(heir.uid)}
              onPointerEnter={() => props.onFocus(heir)}
              onPointerLeave={() => props.onFocus(null)}
              onFocus={() => props.onFocus(heir)}
              onBlur={() => props.onFocus(null)}
            >
              <span class="heir-top">
                <span class="swatch" style={{ background: swatch(heir.hue, heir.energy01) }} />
                Generation {heir.generation}
              </span>
              <span class="energy">
                <span style={{ width: `${Math.min(Math.max(heir.energy01, 0), 1) * 100}%` }} />
              </span>
            </button>
          ))}
        </div>
      )}
      {lineFirst && causeLine}
      <button type="button" class="watch" onClick={props.onWatch}>
        Keep watching
      </button>
    </section>
  );
}
