// The death overlay: the cause, then the heirs to continue as, or the end of the line. The first
// death with a living descendant leads with the descendants, and the cause comes after them.

import type { DeathCause, Heir } from '../protocol';
import { heirGone } from './state';
import { FIRST_DEATH } from './words/lines';

const CAUSE_TEXT: Record<DeathCause, string> = {
  starved: 'You starved.',
  'old age': 'You died of old age.',
};

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
  const causeLine = (
    <p class={lineFirst ? 'death-after' : 'death-cause'} role={lineFirst ? undefined : 'status'}>
      {CAUSE_TEXT[cause]}
    </p>
  );
  return (
    <section class="death" aria-label="You died">
      {lineFirst ? (
        <p class="death-cause" role="status">
          {FIRST_DEATH}
        </p>
      ) : (
        causeLine
      )}
      <p class="death-next">
        {heirs.length === 0 ? 'Your line has ended.' : 'Continue as a descendant.'}
      </p>
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
