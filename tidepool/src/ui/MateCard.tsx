// The mate card: the body of the player and a body in reach, side by side, and the first thing
// that the two still lack for an exchange of genes. It takes no pointer but on its Court button and
// on the "?" mark of its note: the world runs on under it. `main.ts` shows it only in a world
// where mixing is on.

import { FLAG_WILLING, type Kin } from '../protocol';
import { Sketch } from './BudCard';
import { Note, NoteMark } from './Note';
import { courtHeld, courtable, mate, mateShown } from './state';
import { BUD, dietWord, KIND, MATE } from './words/lines';

// The kinds of part of a body, each once, in gene order.
function kindsOf(kin: Kin): string {
  const kinds = [...new Set(kin.parts.map((part) => KIND[part.kind] ?? BUD.part))];
  return kinds.length > 0 ? kinds.join(', ') : MATE.noParts;
}

// One body: its sketch, its size as it is now, its kinds of part, and the counts of its brain. The
// last line is its accept: for the player, the court input or the output of the brain that drives.
function Side(props: { kin: Kin; name: string }) {
  const { kin } = props;
  const willing = (kin.flags & FLAG_WILLING) !== 0;
  return (
    <figure>
      <Sketch kin={kin} marked={[]} />
      <figcaption>{props.name}</figcaption>
      <p>{MATE.size.replace('{l}', kin.length.toFixed(1)).replace('{w}', kin.width.toFixed(1))}</p>
      <p>{kindsOf(kin)}</p>
      <p>{MATE.diet.replace('{diet}', dietWord(kin.diet))}</p>
      <p>{MATE.hidden.replace('{n}', String(kin.hidden))}</p>
      <p>{MATE.conns.replace('{n}', String(kin.conns))}</p>
      <p class={willing ? 'willing' : 'unwilling'}>{willing ? MATE.willing : MATE.unwilling}</p>
    </figure>
  );
}

export function MateCard() {
  const found = mate.value;
  if (!found || !mateShown()) return null;
  const hold = (down: boolean) => (): void => {
    courtHeld.value = down;
  };
  return (
    <div class="bud mate">
      <p class="bud-head">
        {MATE.heading} <NoteMark id="mate" />
      </p>
      <Note id="mate" />
      <p class="bud-note">{MATE.what}</p>
      <div class="bud-pair">
        <Side kin={found.you} name={MATE.you} />
        <Side kin={found.other} name={MATE.other} />
      </div>
      <p class="mate-state" role="status">
        {MATE.state[found.state]}
      </p>
      {/* Held, not clicked: the body accepts for as long as the button or the key C is down. */}
      {courtable() && (
        <button
          type="button"
          class="leave court"
          aria-keyshortcuts="C"
          aria-pressed={courtHeld.value}
          onPointerDown={hold(true)}
          onPointerUp={hold(false)}
          onPointerCancel={hold(false)}
          onPointerLeave={hold(false)}
          onContextMenu={(e) => e.preventDefault()}
        >
          {MATE.court} <kbd>C</kbd>
        </button>
      )}
    </div>
  );
}
