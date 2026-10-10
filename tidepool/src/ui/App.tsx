// The overlay root. The error state comes first, then the loading state, then the normal state.

import { benchText, errorText, ready, stats } from './state';

function Readout() {
  const s = stats.value;
  return (
    <pre class="readout">
      {`tick ${s.tick}\ncreatures ${s.creatures}\ntick µs ${s.tickMicros.toFixed(0)}\nfps ${s.fps}`}
    </pre>
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
    </>
  );
}
