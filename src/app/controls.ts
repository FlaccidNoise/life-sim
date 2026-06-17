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

// Grouped so the 36 live knobs are scannable rather than one long wall of sliders.
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
  {
    // The buffer-resize knobs maxBonds/maxOrganisms/bondDegreeCap are restart-required
    // (pool capacities, not derivable from maxCells) and are intentionally NOT live
    // sliders — same as maxCells/maxSynapses, which are also omitted here.
    title: 'bonds / organisms (M5)',
    knobs: [
      // bondStiffness CAP is 2.5: the symplectic-Euler stability ceiling (k>~3 diverges
      // to Inf/NaN; a multi-spoke hub is tighter still). Rigidity comes from bracing
      // geometry + low strain tolerance, not large k. Do NOT raise this max.
      { key: 'bondStiffness', label: 'bond stiffness', min: 0, max: 2.5, step: 0.05 },
      { key: 'bondMaxStrain', label: 'bond max strain', min: 0.1, max: 2, step: 0.05 },
      { key: 'transferRate', label: 'transfer rate', min: 0, max: 0.5, step: 0.01 },
      { key: 'transferEfficiency', label: 'transfer eff', min: 0, max: 1, step: 0.01 },
      { key: 'adhesionStrength', label: 'adhesion str', min: 0, max: 5, step: 0.05 },
      { key: 'adhesionRange', label: 'adhesion range', min: 6, max: 36, step: 1 },
      { key: 'digestClusterBonus', label: 'digest cluster', min: 0, max: 2, step: 0.05 },
    ],
  },
  {
    title: 'genome + reproduction (M6)',
    knobs: [
      { key: 'reproThreshold', label: 'repro thresh', min: 50, max: 5000, step: 50 },
      { key: 'reproParentFloor', label: 'parent floor', min: 0, max: 2000, step: 50 },
      { key: 'offspringOffset', label: 'offspring offset', min: 8, max: 200, step: 4 },
      { key: 'organismDeathFloor', label: 'death floor', min: -100, max: 500, step: 10 },
      { key: 'mutationParamRate', label: 'mut param rate', min: 0, max: 1, step: 0.02 },
      { key: 'mutationParamSigma', label: 'mut param σ', min: 0, max: 1, step: 0.01 },
      { key: 'mutationWeightRate', label: 'mut weight rate', min: 0, max: 1, step: 0.02 },
      {
        key: 'mutationDuplicateSubgraphRate',
        label: 'mut dup-subgraph',
        min: 0,
        max: 1,
        step: 0.02,
      },
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
