import { type Config } from '../core/sim/config';

interface Knob {
  key: keyof Config;
  label: string;
  min: number;
  max: number;
  step: number;
}

interface Section {
  title: string;
  knobs: Knob[];
}

// Grouped so the 21 live knobs are scannable rather than one long wall of sliders.
const SECTIONS: Section[] = [
  {
    title: 'economy',
    knobs: [
      { key: 'photoGain', label: 'photo gain', min: 0, max: 0.3, step: 0.005 },
      { key: 'photoDepletion', label: 'photo depletion', min: 0, max: 1, step: 0.005 },
      { key: 'digestRate', label: 'digest rate', min: 0, max: 20, step: 0.5 },
      { key: 'digestEfficiency', label: 'digest eff', min: 0, max: 1, step: 0.02 },
      { key: 'basalCost', label: 'basal cost', min: 0, max: 0.5, step: 0.005 },
      { key: 'meatDecay', label: 'meat decay', min: 0, max: 5, step: 0.1 },
      { key: 'divideThreshold', label: 'divide thresh', min: 20, max: 600, step: 5 },
    ],
  },
  {
    title: 'environment',
    knobs: [
      { key: 'lightRegen', label: 'light regen', min: 0, max: 1, step: 0.01 },
      { key: 'lightDiffuse', label: 'light diffuse', min: 0, max: 0.25, step: 0.005 },
      { key: 'foodDeposit', label: 'food deposit', min: 0, max: 10, step: 0.5 },
      { key: 'foodDiffuse', label: 'food diffuse', min: 0, max: 0.25, step: 0.005 },
      { key: 'foodDecay', label: 'food decay', min: 0, max: 0.5, step: 0.005 },
    ],
  },
  {
    title: 'sense + move (M3)',
    knobs: [
      { key: 'thrustGain', label: 'thrust gain', min: 0, max: 200, step: 1 },
      { key: 'maxThrust', label: 'max thrust', min: 0, max: 20, step: 0.5 },
      { key: 'turnRate', label: 'turn rate', min: 0, max: 1, step: 0.01 },
      { key: 'cruiseThrust', label: 'cruise thrust', min: 0, max: 5, step: 0.1 },
      { key: 'moveCost', label: 'move cost', min: 0, max: 0.2, step: 0.002 },
    ],
  },
  {
    title: 'neural (M4)',
    knobs: [
      { key: 'neuralCost', label: 'neural cost', min: 0, max: 0.1, step: 0.005 },
      { key: 'turnScale', label: 'turn scale', min: 0, max: 1, step: 0.02 },
      { key: 'thrustScale', label: 'thrust scale', min: 0, max: 8, step: 0.1 },
      { key: 'thrustBias', label: 'thrust bias', min: -2, max: 6, step: 0.1 },
    ],
  },
];

/** Decimals to show for a value, derived from the knob's step (so 0.005 → 3, 1 → 0). */
function decimalsFor(step: number): number {
  if (step >= 1) return 0;
  return Math.min(3, Math.max(0, -Math.floor(Math.log10(step))));
}

/** Build grouped slider rows into `host`, mutating `config` live as they move. */
export function mountControls(host: HTMLElement, config: Config): void {
  const title = document.createElement('div');
  title.className = 'panel-title';
  title.textContent = 'knobs — live';
  host.append(title);

  for (const section of SECTIONS) {
    const head = document.createElement('div');
    head.className = 'knob-section muted';
    head.textContent = `· ${section.title}`;
    host.append(head);

    for (const k of section.knobs) {
      const decimals = decimalsFor(k.step);
      const row = document.createElement('label');
      row.className = 'knob';

      const headRow = document.createElement('div');
      headRow.className = 'knob-head';
      const label = document.createElement('span');
      label.className = 'knob-label';
      label.textContent = k.label;
      const val = document.createElement('span');
      val.className = 'knob-val';
      headRow.append(label, val);

      const input = document.createElement('input');
      input.type = 'range';
      input.min = String(k.min);
      input.max = String(k.max);
      input.step = String(k.step);
      input.value = String(config[k.key]);
      input.setAttribute('aria-label', k.label);

      const render = (): void => {
        val.textContent = config[k.key].toFixed(decimals);
      };
      input.addEventListener('input', () => {
        config[k.key] = Number(input.value);
        render();
      });
      render();

      row.append(headRow, input);
      host.append(row);
    }
  }
}
