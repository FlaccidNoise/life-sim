// The overlay root. The error state comes first, then the loading state, then the normal state.

import type { Heir } from '../protocol';
import { DeathOverlay } from './DeathOverlay';
import {
  benchText,
  brainDriving,
  death,
  errorText,
  hint,
  lineageAlive,
  mode,
  ready,
  starving,
  stats,
  toast,
} from './state';

function Readout() {
  const s = stats.value;
  return (
    <pre class="readout">
      {`tick ${s.tick}\ncreatures ${s.creatures}\ntick µs ${s.tickMicros.toFixed(0)}\nfps ${s.fps}`}
    </pre>
  );
}

// One line near the foot of the screen. A passing hint comes first (the first one a possession
// shows), then the line for the mode: in Play the instincts line, then the starving line. The line
// that asks the player to move says how under it.
function Hint(props: { touch: boolean }) {
  if (death.value) return null;
  const instincts = hint.value === null && mode.value === 'play' && brainDriving.value;
  const text =
    hint.value ??
    (mode.value === 'watch'
      ? 'Click any creature to become it.'
      : instincts
        ? 'Your instincts are steering. Move to take over.'
        : starving.value
          ? 'You are starving. Find green.'
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

// The descendant count, top left, under the debug readout when there is one. The line counts the
// player's own body in `lineageAlive`, so it shows one less. The toast sits above the hint.
function Line(props: { debug: boolean }) {
  return (
    <>
      <p class="bench" style={{ top: props.debug ? '100px' : '12px', bottom: 'auto' }}>
        Descendants alive: {Math.max(lineageAlive.value - 1, 0)}
      </p>
      {toast.value !== null && !death.value && (
        <p class="hint" role="status" style={{ bottom: 'calc(12% + 5rem)' }}>
          {toast.value}
        </p>
      )}
    </>
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
      {mode.value === 'play' && <Line debug={props.debug} />}
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
