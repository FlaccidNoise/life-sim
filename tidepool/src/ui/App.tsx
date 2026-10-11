// The overlay root. The error state comes first, then the loading state, then the normal state.

import type { Heir } from '../protocol';
import { DeathOverlay } from './DeathOverlay';
import { benchText, brainDriving, death, errorText, hint, mode, ready, stats } from './state';

function Readout() {
  const s = stats.value;
  return (
    <pre class="readout">
      {`tick ${s.tick}\ncreatures ${s.creatures}\ntick µs ${s.tickMicros.toFixed(0)}\nfps ${s.fps}`}
    </pre>
  );
}

// One line near the foot of the screen. A passing hint comes first, then the line for the mode. The
// line that asks the player to move says how under it.
function Hint(props: { touch: boolean }) {
  if (death.value) return null;
  const instincts = hint.value === null && mode.value === 'play' && brainDriving.value;
  const text =
    hint.value ??
    (mode.value === 'watch'
      ? 'Click any creature to become it.'
      : instincts
        ? 'Your instincts are steering. Move to take over.'
        : null);
  return text === null ? null : (
    <p class="hint" role="status">
      {text}
      {instincts && (
        <small>
          {props.touch
            ? 'Hold a finger where you want to swim.'
            : 'W A D or the arrow keys. Or hold the pointer where you want to swim.'}
        </small>
      )}
    </p>
  );
}

export function App(props: {
  debug: boolean;
  touch: boolean; // the main pointer is a finger
  onLeave: () => void;
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
      {mode.value === 'play' && (
        <button type="button" class="leave" onClick={props.onLeave}>
          Leave <kbd>Esc</kbd>
        </button>
      )}
      {dead && (
        <DeathOverlay
          cause={dead.cause}
          heirs={dead.heirs}
          onPick={props.onPick}
          onWatch={props.onWatch}
          onFocus={props.onFocus}
        />
      )}
    </>
  );
}
