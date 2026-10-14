// The overlay root. The error state comes first, then the loading state, then the normal state.

import { useState } from 'preact/hooks';
import type { Heir } from '../protocol';
import { BrainPanel, BrainToggle } from './BrainPanel';
import { BudCard } from './BudCard';
import { DeathOverlay } from './DeathOverlay';
import { Guide, GuideToggle } from './Guide';
import { Note, NoteMark } from './Note';
import {
  benchText,
  brainOpen,
  death,
  errorText,
  hint,
  lineageAlive,
  mode,
  pulse,
  ready,
  starving,
  stats,
  toast,
  walkLine,
  walkLog,
} from './state';
import { COUNTER, LINE, STARVING } from './words/lines';

function Readout() {
  const s = stats.value;
  return (
    <pre class="readout">
      {`tick ${s.tick}\ncreatures ${s.creatures}\ntick µs ${s.tickMicros.toFixed(0)}\nfps ${s.fps}`}
    </pre>
  );
}

// The one line near the foot of the screen. Never two: the first of these that is up shows. An
// answer to a click ("Nothing there."), the toast of a bud whose child the frame did not hold, the
// line of the walkthrough, then the
// starving line, which stands for as long as the body starves and so gives way to the three that
// pass. How to move is under the line of beat 2. `--foot` is how far the line is from the foot of
// the screen: the brain panel raises it where the panel is a sheet there.
function Hint(props: { touch: boolean }) {
  if (death.value) return null;
  const text =
    hint.value ??
    toast.value ??
    walkLine.value ??
    (mode.value === 'play' && starving.value ? STARVING : null);
  return text === null ? null : (
    <p class="hint" role="status" style={{ bottom: 'var(--foot, 12%)' }}>
      {text}
      {text === LINE.move && (
        <small>
          {props.touch
            ? 'Hold a finger where you want to swim.'
            : 'W A D, arrows, or a held pointer.'}
        </small>
      )}
    </p>
  );
}

// The count of the line, top left, under the debug readout when there is one: every living body
// with the lineage mark but the player's own, which `lineageAlive` counts. Beat 9 points at it. On a
// narrow screen it is under the buttons: index.html.
function Line(props: { debug: boolean }) {
  return (
    <div
      class={`bench score${props.debug ? ' low' : ''}${pulse.value === 'score' ? ' pulse' : ''}`}
    >
      {COUNTER.replace('{n}', String(Math.max(lineageAlive.value - 1, 0)))} <NoteMark id="score" />
      <Note id="score" />
    </div>
  );
}

// `?debug`: copies the playtest log of the walkthrough as JSON.
function WalkLog() {
  const [said, setSaid] = useState<string | null>(null);
  const log = walkLog.value;
  const empty = Object.keys(log).length === 0;
  const say = (text: string): void => {
    setSaid(text);
    setTimeout(() => setSaid(null), 2000);
  };
  // A page that is not served over HTTPS has no clipboard.
  const copy = (): void => {
    const write = (navigator.clipboard as Clipboard | undefined)?.writeText(JSON.stringify(log));
    if (!write) return say('Could not copy');
    write.then(
      () => say('Copied'),
      () => say('Could not copy'),
    );
  };
  return (
    <button type="button" class="leave walklog" disabled={empty} onClick={copy}>
      {empty ? 'No beats yet' : (said ?? 'Copy beat times')}
    </button>
  );
}

export function App(props: {
  debug: boolean;
  touch: boolean; // the main pointer is a finger
  onLeave: () => void;
  onBrain: () => void; // the Brain button and the close button of the panel
  onPick: (uid: number) => void;
  onWatch: () => void;
  onFocus: (heir: Heir | null) => void;
}) {
  const error = errorText.value;
  if (error !== null) {
    return (
      <div class="panel" role="alert">
        <p>{error}</p>
        <button type="button" onClick={() => location.reload()}>
          Reload
        </button>
      </div>
    );
  }
  if (!ready.value) return <div class="panel">Waking the tidepool…</div>;
  const dead = death.value;
  return (
    <>
      {props.debug && <Readout />}
      {benchText.value !== null && <p class="bench">{benchText.value}</p>}
      <Hint touch={props.touch} />
      {mode.value === 'play' && <Line debug={props.debug} />}
      {mode.value === 'play' && !dead && <BudCard />}
      <div class="corner">
        {props.debug && <WalkLog />}
        {!dead && <BrainToggle onToggle={props.onBrain} />}
        <GuideToggle />
        {mode.value === 'play' && (
          <button type="button" class="leave" onClick={props.onLeave}>
            Leave <kbd>Esc</kbd>
          </button>
        )}
      </div>
      {/* The death overlay stands where the panel is a sheet, and it owns the keyboard. */}
      {brainOpen.value && !dead && <BrainPanel onClose={props.onBrain} />}
      {dead && (
        <DeathOverlay
          cause={dead.cause}
          heirs={dead.heirs}
          first={dead.first}
          onPick={props.onPick}
          onWatch={props.onWatch}
          onFocus={props.onFocus}
        />
      )}
      <Guide />
    </>
  );
}
