// The overlay root. The error state comes first, then the loading state, then the normal state.

import { benchText, brainDriving, errorText, hint, mode, ready, stats } from './state';

function Readout() {
  const s = stats.value;
  return (
    <pre class="readout">
      {`tick ${s.tick}\ncreatures ${s.creatures}\ntick µs ${s.tickMicros.toFixed(0)}\nfps ${s.fps}`}
    </pre>
  );
}

// One line near the foot of the screen. A passing hint comes first, then the line for the mode.
function Hint() {
  const text =
    hint.value ??
    (mode.value === 'watch'
      ? 'Click any creature to become it.'
      : brainDriving.value
        ? 'Your instincts are steering. Move to take over.'
        : null);
  return text === null ? null : (
    <p class="hint" role="status">
      {text}
    </p>
  );
}

export function App({ debug }: { debug: boolean }) {
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
  return (
    <>
      {debug && <Readout />}
      {benchText.value !== null && <p class="bench">{benchText.value}</p>}
      <Hint />
    </>
  );
}
