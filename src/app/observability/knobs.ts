/**
 * Knob panel — every tunable as a live control. Per the rebuild spec this is also where every future
 * ablation off-switch will live as a toggle (the interactive-tuning surface). Phase 0 exposes the two
 * seed-time knobs (initial population, drift speed); changing a knob triggers a world reset so the
 * change takes effect deterministically from the seed.
 */
import { type Config } from '../../core/config';

export interface KnobsHandlers {
  onChange(patch: Partial<Config>): void;
}

interface KnobSpec {
  key: keyof Config;
  label: string;
  min: number;
  max: number;
  step: number;
}

export class Knobs {
  constructor(root: HTMLElement, config: Config, h: KnobsHandlers) {
    const specs: KnobSpec[] = [
      { key: 'initialPopulation', label: 'initial pop', min: 1, max: config.maxOrganisms, step: 1 },
      { key: 'driftSpeed', label: 'drift speed', min: 0, max: 2, step: 0.05 },
    ];
    root.innerHTML = specs
      .map(
        (s) => `
        <div class="knob" data-key="${s.key}">
          <div class="knob-head"><span class="lbl">${s.label}</span><span class="knob-val"></span></div>
          <input class="slider" type="range" min="${s.min}" max="${s.max}" step="${s.step}"
                 value="${config[s.key]}" />
        </div>`,
      )
      .join('');

    for (const s of specs) {
      const wrap = root.querySelector<HTMLElement>(`[data-key="${s.key}"]`)!;
      const slider = wrap.querySelector<HTMLInputElement>('.slider')!;
      const val = wrap.querySelector<HTMLElement>('.knob-val')!;
      val.textContent = String(config[s.key]);
      slider.addEventListener('input', () => {
        const v = Number(slider.value);
        val.textContent = s.step < 1 ? v.toFixed(2) : String(v);
        h.onChange({ [s.key]: v });
      });
    }
  }
}
