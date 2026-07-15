/**
 * Arc C3 — a SEEDED abiotic TEMPERATURE field: one spatially-varying axis that gives different regions
 * different SELECTIVE OPTIMA, so a trait's best value depends on WHERE you live (regional phenotypic
 * differentiation along a gradient). The dedicated THERMAL_PREF gene ([0,1]) is selected to MATCH the local
 * temperature: metabolize() charges extra basal cost = tmc·(THERMAL_PREF − temp)² (a region COST/avoidance,
 * per the vision-revival-null lesson: move a trait regionally by PENALISING the wrong phenotype, not by
 * adding another carrot). THERMAL_PREF has no other role, so this is pure regional stabilizing selection.
 *
 * DETERMINISM: the field is a pure function of (position, seed). Its gradient axis + phase are derived from
 * the seed by integer hashing (NO Rng object, NO stream draw), so turning the field on never perturbs the
 * organism RNG stream — the ONLY behavioural effect is the energy penalty in metabolize (gated on
 * temperatureMetabCost>0, so cost 0 is byte-identical). Same (config, seed) → same field → same world hash.
 */
import { type Config } from './config';

const TAU = Math.PI * 2;

/** Pure integer hash → [0,1). splitmix32-style; no RNG object, no stream state. */
function hash01(n: number): number {
  let h = (n ^ 0x9e3779b9) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = Math.imul(h ^ (h >>> 16), 0x45d9f3b) >>> 0;
  h = (h ^ (h >>> 16)) >>> 0;
  return h / 4294967296;
}

/** Seed-derived, loop-invariant gradient parameters (compute once, reuse per creature). */
export interface TemperatureAxis {
  cx: number; // x coefficient (cosθ · freq·TAU / worldWidth)
  cy: number; // y coefficient (sinθ · freq·TAU / worldWidth)
  phase: number;
}

export function temperatureAxis(cfg: Config): TemperatureAxis {
  const theta = hash01((cfg.seed ^ 0x7e3f) >>> 0) * TAU; // gradient direction (seed-specific)
  const phase = hash01((cfg.seed ^ 0x51c7) >>> 0) * TAU;
  const k = (cfg.temperatureScale * TAU) / cfg.worldWidth; // bands across the world
  return { cx: Math.cos(theta) * k, cy: Math.sin(theta) * k, phase };
}

/** Temperature at (x,y) in [0,1] from precomputed axis params (the hot-path form). */
export function temperatureAtAxis(x: number, y: number, a: TemperatureAxis): number {
  return 0.5 + 0.5 * Math.sin(x * a.cx + y * a.cy + a.phase);
}

/** Convenience: temperature at (x,y) in [0,1] (for observers — region-probe, browser overlay). */
export function temperatureAt(x: number, y: number, cfg: Config): number {
  return temperatureAtAxis(x, y, temperatureAxis(cfg));
}

// ── LIGHT field (photosynthesis) ────────────────────────────────────────────────────────────────────
/** A SEEDED, RNG-free LIGHT intensity field in [0,1], INDEPENDENT of temperature and food. Photosynthetic
 *  autotrophs draw passive energy from this. Pure function of (position, seed) via integer hashing — no
 *  Rng object, no stream draw — so turning it on never perturbs the organism RNG stream. Separate seed
 *  salts from temperature so the two gradients are uncorrelated (a hot region isn't automatically bright). */
export interface LightAxis {
  cx: number;
  cy: number;
  phase: number;
}

export function lightAxis(cfg: Config): LightAxis {
  const theta = hash01((cfg.seed ^ 0x1a2b) >>> 0) * TAU; // distinct salt from temperature
  const phase = hash01((cfg.seed ^ 0x3c4d) >>> 0) * TAU;
  const k = (cfg.photosynthLightScale * TAU) / cfg.worldWidth;
  return { cx: Math.cos(theta) * k, cy: Math.sin(theta) * k, phase };
}

export function lightAtAxis(x: number, y: number, a: LightAxis): number {
  return 0.5 + 0.5 * Math.sin(x * a.cx + y * a.cy + a.phase);
}

export function lightAt(x: number, y: number, cfg: Config): number {
  return lightAtAxis(x, y, lightAxis(cfg));
}
