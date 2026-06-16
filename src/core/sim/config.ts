/**
 * Simulation configuration. Reproducibility is from `(Config, seed)` — seed is
 * part of Config (spec §5.4). Only M0 fields are present; later milestones add
 * economy/physics/mutation coefficients here.
 */
export interface Config {
  seed: number;
  maxCells: number;
  worldWidth: number;
  worldHeight: number;
  dt: number;
  /** Cell radius in world units. Interaction cutoff / spatial-hash cell size = 2·cellRadius. */
  cellRadius: number;
  /** Soft-repulsion stiffness (force per unit of overlap). */
  repulsion: number;
  /** Velocity retained per tick after drag, in (0, 1]. Lower = more viscous. */
  damping: number;

  // Light field (coarse grid over the world)
  lightGridCols: number;
  lightGridRows: number;
  /** Per-patch light capacity ceiling. */
  lightMax: number;
  /** Number of seeded Gaussian patches for the patchy (non-uniform) init. */
  lightPatchCount: number;
  /** Patch radius in grid cells for the patchy init. */
  lightPatchRadius: number;
  /** Regen rate per tick toward each patch's capacity, in (0, 1]. */
  lightRegen: number;
  /** Toroidal diffusion coefficient per tick, in [0, 0.25] (stability bound: 4·diffuse < 1). */
  lightDiffuse: number;

  // Energy economy (§4.5). Every term is a live knob.
  // NOTE: photosynthesis/digestion/basal all scale with area = radius², so cellRadius
  // (default 6 → area 36) is a hidden economy lever — re-derive balance if it changes.
  /** Photosynthesis gain per (localLight · area) per tick. */
  photoGain: number;
  /** Light consumed per unit of photosynthesis energy gained. */
  photoDepletion: number;
  /** Max energy a digestive cell extracts from one prey per tick. */
  digestRate: number;
  /** Fraction of extracted energy the digester keeps (<1). */
  digestEfficiency: number;
  /** Basal metabolic cost per tick, per unit area (living cells only). */
  basalCost: number;
  /** Energy a MEAT cell loses per tick. */
  meatDecay: number;
  /** Energy a fresh corpse holds, per unit mass (biomass → food). */
  meatEnergyOnDeath: number;

  // Division (clone-only; M6 adds genome/mutation).
  /** Energy at/above which a living cell divides. */
  divideThreshold: number;
  /** Energy spent performing a division. */
  divideCost: number;
  /** Child placement offset from the parent, in world units. */
  divideJitter: number;
  /** Fraction of initial cells spawned as PHOTO; the rest are DIGESTIVE. */
  initialPhotoFraction: number;
}

export function defaultConfig(overrides: Partial<Config> = {}): Config {
  return {
    seed: 1,
    maxCells: 100_000,
    // M2: a 2048² world at ~20k seeded cells is the empirically-tuned "breathing"
    // regime — dense enough that digestive cells contact prey passively (no movement
    // until M3), so the 2nd trophic level sustains instead of starving to a PHOTO
    // monoculture (§10 R1). Headless sweep: stable diversity ~0.2–0.3 through 1000+
    // ticks. A sparser 4096² world collapses digestives → monoculture.
    worldWidth: 2048,
    worldHeight: 2048,
    dt: 1,
    cellRadius: 6,
    repulsion: 2,
    damping: 0.5,

    lightGridCols: 32, // 64-unit patches over the 2048 world
    lightGridRows: 32,
    lightMax: 1,
    lightPatchCount: 32,
    lightPatchRadius: 6,
    lightRegen: 0.3, // patches recover fast enough to sustain producers (was 0.05)
    lightDiffuse: 0.1,

    photoGain: 0.05,
    photoDepletion: 0.01, // a photo cell no longer strip-mines its patch in one tick (was 0.2)
    // Digestion tuned for stable coexistence: potent enough that passive contact
    // sustains a digestive, gentle enough not to strip prey and overshoot→crash.
    digestRate: 7,
    digestEfficiency: 0.7,
    basalCost: 0.015, // cheaper upkeep keeps digestives alive between meals (was 0.02)
    meatDecay: 0.5,
    meatEnergyOnDeath: 30,

    divideThreshold: 150, // lower than 200 → faster prey turnover; also damps predator overshoot
    divideCost: 10,
    divideJitter: 6,
    // 0.75 = a 3:1 producer:consumer seed (was 0.85); the larger consumer cohort
    // plus the damping above settles into sustained coexistence rather than a
    // predator boom-bust that ends in monoculture.
    initialPhotoFraction: 0.75,
    ...overrides,
  };
}

export function serializeConfig(config: Config): string {
  return JSON.stringify(config);
}

export function deserializeConfig(json: string): Config {
  const parsed = JSON.parse(json) as Partial<Config>;
  return defaultConfig(parsed);
}
