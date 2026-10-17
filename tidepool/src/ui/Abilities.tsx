// The ability buttons of the possessed body, rule X2 of the M4 plan: Dash with a Flagellum, Toxin
// with a Toxin gland, and none for a body with no such part. A dash of a body with a Jaw is a
// strike (rule P1 of the parts retune): it has no button of its own. A button is held,
// as the Court button is: its bit is set for as long as the pointer or the key is down. While the
// brain drives, a button takes no press and shows what the brain fires. `main.ts` writes the state.

import { ABILITY_DASH, ABILITY_TOXIN, TICK_HZ } from '../protocol';
import { abilityButtons, abilityView, brainDriving, death, mode } from './state';

const BUTTONS = [
  { bit: ABILITY_DASH, name: 'Dash', key: 'Space', field: 'dash' },
  { bit: ABILITY_TOXIN, name: 'Toxin', key: 'Q', field: 'toxin' },
] as const;

// What `FLAG_DASH` shows is a dash: it lights the Dash button. A cloud shows no flag.
const LIGHT = ABILITY_DASH;

export function Abilities() {
  const { has, left, fired } = abilityView.value;
  if (mode.value !== 'play' || death.value || has === 0) return null;
  const driving = brainDriving.value;
  const down = abilityButtons.value;
  const hold = (bit: number, on: boolean) => (): void => {
    abilityButtons.value = on ? abilityButtons.peek() | bit : abilityButtons.peek() & ~bit;
  };
  return (
    <div
      class="abilities"
      style={{
        position: 'fixed',
        left: '50%',
        bottom: '12px',
        transform: 'translateX(-50%)',
        display: 'flex',
        gap: '8px',
        pointerEvents: 'none',
      }}
    >
      {BUTTONS.filter((b) => (has & b.bit) !== 0).map((b) => {
        const ticks = left[b.field];
        const lit = driving ? fired && (b.bit & LIGHT) !== 0 : (down & b.bit) !== 0;
        return (
          <button
            key={b.bit}
            type="button"
            class="leave"
            aria-keyshortcuts={b.key}
            aria-pressed={lit}
            disabled={driving}
            title={driving ? 'The brain drives: it fires this.' : undefined}
            style={{
              position: 'static',
              minWidth: '72px',
              touchAction: 'none',
              userSelect: 'none',
              ...(lit && { borderColor: '#cfe6ee', background: '#12384d' }),
              ...(ticks > 0 && !driving && { opacity: 0.6 }),
            }}
            onPointerDown={hold(b.bit, true)}
            onPointerUp={hold(b.bit, false)}
            onPointerCancel={hold(b.bit, false)}
            onPointerLeave={hold(b.bit, false)}
            onContextMenu={(e) => e.preventDefault()}
          >
            {b.name} {ticks > 0 ? <span>{(ticks / TICK_HZ).toFixed(1)}</span> : <kbd>{b.key}</kbd>}
          </button>
        );
      })}
    </div>
  );
}
