/**
 * Knob registry — the data behind the settings modal's tabbed tuning surface. Every tunable is a live
 * control; two kinds:
 *   - LIVE knobs (read every tick: economy rates) mutate the config in place → effect is immediate.
 *   - SEED-TIME knobs (marked `live:false`, shown with a `*`) require a world rebuild to take effect.
 *
 * The renderer lives in settings-modal.ts; this module only owns the spec list, the live boolean
 * toggles, and the GROUP metadata that organizes them into tabs.
 */
import { type Config } from '../../core/config';

export interface KnobsHandlers {
  /** A live knob changed — mutate config in place; the running world picks it up next tick. */
  onLive(key: keyof Config, value: number): void;
  /** A seed-time knob changed — apply and rebuild the world from the seed. */
  onReset(key: keyof Config, value: number): void;
  /** A live boolean toggle changed — mutate config in place (e.g. learning on/off). */
  onToggle(key: keyof Config, value: boolean): void;
}

/** Tab groups, in display order. */
export type KnobGroup = 'world' | 'genes' | 'costs' | 'economy' | 'predation';

export interface KnobSpec {
  key: keyof Config;
  label: string;
  min: number;
  max: number;
  step: number;
  live: boolean;
  group: KnobGroup;
}

export interface KnobGroupMeta {
  key: KnobGroup;
  label: string;
  hint: string;
}

/** Tab list + a one-line orientation hint per group. */
export const KNOB_GROUPS: readonly KnobGroupMeta[] = [
  {
    key: 'world',
    label: 'World & food',
    hint: 'How the ocean is built and how its food economy runs. Most are seed-time (*) — they shape a new world.',
  },
  {
    key: 'genes',
    label: 'Creature genes',
    hint: 'Founder value for each heritable scalar gene. Offspring mutate around these; tune them, then launch a new world.',
  },
  {
    key: 'costs',
    label: 'Selection costs',
    hint: 'Basal upkeep charged per unit of each gene above its center — the evolutionary price of every trait. All live.',
  },
  {
    key: 'economy',
    label: 'Economy & evolution',
    hint: 'Global survival economy, the mutation rate, and the master behavior toggles.',
  },
  {
    key: 'predation',
    label: 'Predation',
    hint: 'Hunters: how many start, how hard they bite, and what a successful bite pays.',
  },
];

export const SPECS: readonly KnobSpec[] = [
  // ── World & food ──────────────────────────────────────────────────────────────────────────────────
  { key: 'initialPopulation', label: 'initial pop', min: 1, max: 2000, step: 1, live: false, group: 'world' }, // prettier-ignore
  { key: 'driftSpeed', label: 'drift speed', min: 0, max: 3, step: 0.1, live: false, group: 'world' },
  { key: 'flowStrength', label: 'flow strength', min: 0, max: 16, step: 0.5, live: false, group: 'world' }, // prettier-ignore
  { key: 'flowPushStrength', label: 'flow push (drift bodies)', min: 0, max: 1.5, step: 0.05, live: true, group: 'world' }, // prettier-ignore
  { key: 'foodRegen', label: 'food regen', min: 0, max: 0.2, step: 0.005, live: true, group: 'world' },
  { key: 'foodPatchRichness', label: 'pocket richness', min: 1, max: 4, step: 0.5, live: false, group: 'world' }, // prettier-ignore
  { key: 'foodPatchRichnessVar', label: 'pocket variation', min: 0, max: 1, step: 0.1, live: false, group: 'world' }, // prettier-ignore
  { key: 'foodMaxFertility', label: 'max fertility', min: 1, max: 6, step: 0.5, live: false, group: 'world' }, // prettier-ignore
  { key: 'deadWaterCost', label: 'dead-water cost', min: 0, max: 1, step: 0.05, live: true, group: 'world' }, // prettier-ignore

  // ── Creature genes (founder centers; seed-time) ─────────────────────────────────────────────────────
  { key: 'maxSpeed', label: 'gene· max speed', min: 1, max: 20, step: 0.5, live: false, group: 'genes' }, // prettier-ignore
  { key: 'eatRate', label: 'gene· eat rate', min: 0.2, max: 6, step: 0.1, live: false, group: 'genes' },
  { key: 'senseStep', label: 'gene· sense range', min: 8, max: 256, step: 4, live: false, group: 'genes' }, // prettier-ignore
  { key: 'cellRadius', label: 'gene· size', min: 2, max: 32, step: 0.5, live: false, group: 'genes' },
  { key: 'maxTurn', label: 'gene· max turn', min: 0.05, max: 1.2, step: 0.05, live: false, group: 'genes' }, // prettier-ignore
  { key: 'maxThrust', label: 'gene· max thrust', min: 0.1, max: 4, step: 0.1, live: false, group: 'genes' }, // prettier-ignore
  { key: 'metabolicEfficiency', label: 'gene· metab eff', min: 0.5, max: 2.0, step: 0.05, live: false, group: 'genes' }, // prettier-ignore
  { key: 'reproThreshold', label: 'gene· repro bar', min: 10, max: 120, step: 5, live: false, group: 'genes' }, // prettier-ignore
  { key: 'satiatedThreshold', label: 'gene· satiated', min: 40, max: 220, step: 5, live: false, group: 'genes' }, // prettier-ignore
  { key: 'birthEnergy', label: 'gene· birth energy', min: 8, max: 90, step: 1, live: false, group: 'genes' }, // prettier-ignore
  { key: 'damage', label: 'gene· damage', min: 0, max: 20, step: 0.5, live: false, group: 'genes' },
  { key: 'visionRange', label: 'gene· vis range', min: 0, max: 384, step: 2, live: false, group: 'genes' }, // prettier-ignore
  { key: 'visionFov', label: 'gene· vis FOV', min: 0.1, max: 3.14, step: 0.05, live: false, group: 'genes' }, // prettier-ignore
  { key: 'visionAcuity', label: 'gene· vis acuity', min: 0, max: 3, step: 0.1, live: false, group: 'genes' }, // prettier-ignore

  // ── Selection costs (live) ──────────────────────────────────────────────────────────────────────────
  { key: 'maxSpeedCost', label: 'cost· speed', min: 0, max: 0.5, step: 0.01, live: true, group: 'costs' }, // prettier-ignore
  { key: 'eatRateCost', label: 'cost· eat', min: 0, max: 1, step: 0.01, live: true, group: 'costs' },
  { key: 'senseRangeCost', label: 'cost· sense', min: 0, max: 0.05, step: 0.001, live: true, group: 'costs' }, // prettier-ignore
  { key: 'maxTurnCost', label: 'cost· turn', min: 0, max: 2, step: 0.05, live: true, group: 'costs' },
  { key: 'maxThrustCost', label: 'cost· thrust', min: 0, max: 1, step: 0.02, live: true, group: 'costs' }, // prettier-ignore
  { key: 'damageCost', label: 'cost· damage', min: 0, max: 0.5, step: 0.01, live: true, group: 'costs' }, // prettier-ignore
  { key: 'visionRangeCost', label: 'cost· vis range', min: 0, max: 0.2, step: 0.005, live: true, group: 'costs' }, // prettier-ignore
  { key: 'visionFovCost', label: 'cost· vis FOV', min: 0, max: 1, step: 0.01, live: true, group: 'costs' }, // prettier-ignore
  { key: 'visionAcuityCost', label: 'cost· vis acuity', min: 0, max: 1, step: 0.02, live: true, group: 'costs' }, // prettier-ignore

  // ── Economy & evolution (live) ──────────────────────────────────────────────────────────────────────
  { key: 'basalCost', label: 'basal cost', min: 0, max: 2, step: 0.05, live: true, group: 'economy' },
  // Satiation food-drive floor (only bites when the hunger gate is on): 0 = a fed creature parks (births
  // crater); 1 = gate off (always forages). 0.7 keeps it relocating + topping up so it can breed.
  { key: 'foodDriveFloor', label: 'food-drive floor', min: 0, max: 1, step: 0.05, live: true, group: 'economy' }, // prettier-ignore
  { key: 'reproOverhead', label: 'repro overhead', min: 0, max: 40, step: 1, live: true, group: 'economy' }, // prettier-ignore
  { key: 'mutationSigma', label: 'mutation σ', min: 0, max: 0.3, step: 0.005, live: true, group: 'economy' }, // prettier-ignore

  // ── Predation ───────────────────────────────────────────────────────────────────────────────────────
  { key: 'predatorFraction', label: 'predator frac', min: 0, max: 0.6, step: 0.05, live: false, group: 'predation' }, // prettier-ignore
  // hunt scans a neighbourhood sized to biteRange (economy.ts), so it can exceed one hash cell; the
  // default is 16, so the slider reaches 24 to keep the seeded value representable.
  { key: 'biteRange', label: 'bite range', min: 0, max: 24, step: 1, live: true, group: 'predation' },
  { key: 'predationGain', label: 'predation gain', min: 1, max: 6, step: 0.5, live: true, group: 'predation' }, // prettier-ignore
  { key: 'herbivoryExp', label: 'herbivory exp', min: 0.5, max: 2, step: 0.05, live: true, group: 'predation' }, // prettier-ignore
  { key: 'predatorSeedClusters', label: 'pred nurseries', min: 0, max: 6, step: 1, live: false, group: 'predation' }, // prettier-ignore
  // Predator revival: seed hunters in the upper size band so they have the size weapon from t0 — the lever
  // that lets a predator lineage persist instead of starving small. 0 = full band (off).
  { key: 'predatorSizeBoost', label: 'predator size boost', min: 0, max: 1, step: 0.05, live: false, group: 'predation' }, // prettier-ignore
  // Red Queen (lever E1): predator pays this fraction of prey DAMAGE on a bite. Capped at 0.3 — the
  // documented safe band (≥0.5 starves predators).
  { key: 'counterBiteFraction', label: 'counter-bite', min: 0, max: 0.3, step: 0.05, live: true, group: 'predation' }, // prettier-ignore
];

/** Live boolean toggles (checkboxes) — the master behavior switches. Shown in the Economy tab. */
export const TOGGLES: readonly { key: keyof Config; label: string; group: KnobGroup }[] = [
  { key: 'learningEnabled', label: 'learning on', group: 'economy' },
  { key: 'hungerSense', label: 'hunger sense', group: 'economy' },
];
