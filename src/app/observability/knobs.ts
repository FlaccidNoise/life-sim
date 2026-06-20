/**
 * Knob panel — every tunable as a live control (the interactive-tuning surface; this is where future
 * ablation off-switches will live as toggles too). Two kinds:
 *   - LIVE knobs (read every tick: economy rates) mutate the config in place → effect is immediate.
 *   - SEED-TIME knobs (initial population, drift speed) require a world reset to take effect.
 */
import { type Config } from '../../core/config';

export interface KnobsHandlers {
  /** A live knob changed — mutate config in place; the running world picks it up next tick. */
  onLive(key: keyof Config, value: number): void;
  /** A seed-time knob changed — apply and reset the world. */
  onReset(key: keyof Config, value: number): void;
  /** A live boolean toggle changed — mutate config in place (e.g. learning on/off). */
  onToggle(key: keyof Config, value: boolean): void;
}

interface KnobSpec {
  key: keyof Config;
  label: string;
  min: number;
  max: number;
  step: number;
  live: boolean;
}

const SPECS: KnobSpec[] = [
  { key: 'initialPopulation', label: 'initial pop', min: 1, max: 2000, step: 1, live: false },
  { key: 'driftSpeed', label: 'drift speed', min: 0, max: 3, step: 0.1, live: false },
  { key: 'foodRegen', label: 'food regen', min: 0, max: 0.2, step: 0.005, live: true },
  { key: 'eatRate', label: 'eat rate', min: 0, max: 6, step: 0.1, live: true },
  { key: 'basalCost', label: 'basal cost', min: 0, max: 2, step: 0.05, live: true },
  { key: 'reproThreshold', label: 'repro bar', min: 10, max: 150, step: 5, live: true },
  { key: 'mutationSigma', label: 'mutation σ', min: 0, max: 0.3, step: 0.005, live: true },
  { key: 'learningRate', label: 'learn rate', min: 0, max: 0.2, step: 0.002, live: true },
];

/** Live boolean toggles (checkboxes), e.g. the Baldwin learning master switch. */
const TOGGLES: { key: keyof Config; label: string }[] = [
  { key: 'learningEnabled', label: 'learning on' },
];

export class Knobs {
  constructor(root: HTMLElement, config: Config, h: KnobsHandlers) {
    root.innerHTML =
      TOGGLES.map(
        (t) => `
        <label class="knob toggle" data-key="${t.key}">
          <input class="check" type="checkbox" ${config[t.key] ? 'checked' : ''} />
          <span class="lbl">${t.label}</span>
        </label>`,
      ).join('') +
      SPECS.map(
        (s) => `
        <div class="knob" data-key="${s.key}">
          <div class="knob-head">
            <span class="lbl">${s.label}${s.live ? '' : ' *'}</span><span class="knob-val"></span>
          </div>
          <input class="slider" type="range" min="${s.min}" max="${s.max}" step="${s.step}"
                 value="${config[s.key] as number}" />
        </div>`,
      ).join('');

    for (const s of SPECS) {
      const wrap = root.querySelector<HTMLElement>(`[data-key="${s.key}"]`)!;
      const slider = wrap.querySelector<HTMLInputElement>('.slider')!;
      const val = wrap.querySelector<HTMLElement>('.knob-val')!;
      const show = (v: number): string => (s.step < 1 ? v.toFixed(3) : String(v));
      val.textContent = show(config[s.key] as number);
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        val.textContent = show(v);
        if (s.live) h.onLive(s.key, v);
        else h.onReset(s.key, v);
      });
    }

    for (const t of TOGGLES) {
      const wrap = root.querySelector<HTMLElement>(`[data-key="${t.key}"]`)!;
      const check = wrap.querySelector<HTMLInputElement>('.check')!;
      check.addEventListener('change', () => h.onToggle(t.key, check.checked));
    }
  }
}
