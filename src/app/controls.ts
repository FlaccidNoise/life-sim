import { type Config } from '../core/sim/config';

interface Knob {
  key: keyof Config;
  label: string;
  min: number;
  max: number;
  step: number;
}

const KNOBS: Knob[] = [
  { key: 'photoGain', label: 'photo gain', min: 0, max: 0.3, step: 0.005 },
  { key: 'photoDepletion', label: 'photo depletion', min: 0, max: 1, step: 0.005 },
  { key: 'digestRate', label: 'digest rate', min: 0, max: 20, step: 0.5 },
  { key: 'digestEfficiency', label: 'digest eff', min: 0, max: 1, step: 0.02 },
  { key: 'basalCost', label: 'basal cost', min: 0, max: 0.5, step: 0.005 },
  { key: 'meatDecay', label: 'meat decay', min: 0, max: 5, step: 0.1 },
  { key: 'divideThreshold', label: 'divide thresh', min: 20, max: 600, step: 5 },
  { key: 'lightRegen', label: 'light regen', min: 0, max: 1, step: 0.01 },
  { key: 'lightDiffuse', label: 'light diffuse', min: 0, max: 0.25, step: 0.005 },
];

/** Build slider rows into `host`, mutating `config` live as they move. */
export function mountControls(host: HTMLElement, config: Config): void {
  for (const k of KNOBS) {
    const row = document.createElement('label');
    row.style.display = 'block';
    const out = document.createElement('span');
    const input = document.createElement('input');
    input.type = 'range';
    input.min = String(k.min);
    input.max = String(k.max);
    input.step = String(k.step);
    input.value = String(config[k.key]);
    const render = (): void => {
      out.textContent = ` ${k.label}: ${config[k.key]}`;
    };
    input.addEventListener('input', () => {
      config[k.key] = Number(input.value);
      render();
    });
    render();
    row.append(input, out);
    host.append(row);
  }
}
