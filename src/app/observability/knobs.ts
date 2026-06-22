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
  { key: 'basalCost', label: 'basal cost', min: 0, max: 2, step: 0.05, live: true },
  { key: 'reproOverhead', label: 'repro overhead', min: 0, max: 40, step: 1, live: true },
  { key: 'mutationSigma', label: 'mutation σ', min: 0, max: 0.3, step: 0.005, live: true },
  // Gene CENTERS (seed-time): the founder value for each evolvable scalar gene.
  { key: 'maxSpeed', label: 'gene· max speed', min: 1, max: 15, step: 0.5, live: false },
  { key: 'eatRate', label: 'gene· eat rate', min: 0.2, max: 6, step: 0.1, live: false },
  { key: 'senseStep', label: 'gene· sense range', min: 8, max: 200, step: 4, live: false },
  { key: 'cellRadius', label: 'gene· size', min: 2, max: 14, step: 0.5, live: false },
  { key: 'maxTurn', label: 'gene· max turn', min: 0.05, max: 1, step: 0.05, live: false },
  { key: 'maxThrust', label: 'gene· max thrust', min: 0.1, max: 3, step: 0.1, live: false },
  {
    key: 'metabolicEfficiency',
    label: 'gene· metab eff',
    min: 0.5,
    max: 1.5,
    step: 0.05,
    live: false,
  },
  { key: 'reproThreshold', label: 'gene· repro bar', min: 20, max: 120, step: 5, live: false },
  { key: 'satiatedThreshold', label: 'gene· satiated', min: 40, max: 220, step: 5, live: false },
  { key: 'birthEnergy', label: 'gene· birth energy', min: 8, max: 90, step: 1, live: false },
  { key: 'damage', label: 'gene· damage', min: 0, max: 20, step: 0.5, live: false },
  { key: 'visionRange', label: 'gene· vis range', min: 0, max: 24, step: 1, live: false },
  { key: 'visionFov', label: 'gene· vis FOV', min: 0.1, max: 3.14, step: 0.05, live: false },
  { key: 'visionAcuity', label: 'gene· vis acuity', min: 0, max: 3, step: 0.1, live: false },
  // Trophic / predation knobs.
  { key: 'predatorFraction', label: 'predator frac', min: 0, max: 0.6, step: 0.05, live: false },
  // Capped at the spatial-hash cell size (2·cellRadius=12): the 3×3 scan can't reach further.
  { key: 'biteRange', label: 'bite range', min: 0, max: 12, step: 1, live: true },
  // ── Aquarium: diversity pockets (seed-time *) + the predator bundle ────────────────────────────────
  // Deep predator-haven vs shallow grazer-refuge pockets → distinct island communities (reset to apply).
  { key: 'foodPatchRichness', label: 'pocket richness', min: 1, max: 4, step: 0.5, live: false },
  {
    key: 'foodPatchRichnessVar',
    label: 'pocket variation',
    min: 0,
    max: 1,
    step: 0.1,
    live: false,
  },
  { key: 'foodMaxFertility', label: 'max fertility', min: 1, max: 6, step: 0.5, live: false },
  { key: 'deadWaterCost', label: 'dead-water cost', min: 0, max: 1, step: 0.05, live: true },
  // Predator bundle (see predation-engine-ceiling memory): make the bite pay (gain/herbivory fallback) +
  // cluster-seed predator founders into the deepest pockets so a hunter lineage survives the bootstrap.
  { key: 'predationGain', label: 'predation gain', min: 1, max: 6, step: 0.5, live: true },
  { key: 'herbivoryExp', label: 'herbivory exp', min: 1, max: 2, step: 0.05, live: true },
  { key: 'predatorSeedClusters', label: 'pred nurseries', min: 0, max: 6, step: 1, live: false },
  // Red Queen (lever E1): predator pays this fraction of prey DAMAGE on a bite. ≥0.5 starves predators.
  { key: 'counterBiteFraction', label: 'counter-bite', min: 0, max: 0.5, step: 0.05, live: true },
  // Selection-pressure levers (live): basal upkeep per unit of each gene above its center.
  { key: 'maxSpeedCost', label: 'cost· speed', min: 0, max: 0.5, step: 0.01, live: true },
  { key: 'eatRateCost', label: 'cost· eat', min: 0, max: 1, step: 0.01, live: true },
  { key: 'senseRangeCost', label: 'cost· sense', min: 0, max: 0.05, step: 0.001, live: true },
  { key: 'maxTurnCost', label: 'cost· turn', min: 0, max: 2, step: 0.05, live: true },
  { key: 'maxThrustCost', label: 'cost· thrust', min: 0, max: 1, step: 0.02, live: true },
  { key: 'damageCost', label: 'cost· damage', min: 0, max: 0.5, step: 0.01, live: true },
  { key: 'visionRangeCost', label: 'cost· vis range', min: 0, max: 0.2, step: 0.005, live: true },
  { key: 'visionFovCost', label: 'cost· vis FOV', min: 0, max: 1, step: 0.01, live: true },
  { key: 'visionAcuityCost', label: 'cost· vis acuity', min: 0, max: 1, step: 0.02, live: true },
];

/** Live boolean toggles (checkboxes), e.g. the Baldwin learning master switch. */
const TOGGLES: { key: keyof Config; label: string }[] = [
  { key: 'learningEnabled', label: 'learning on' },
  { key: 'hungerSense', label: 'hunger sense' },
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
