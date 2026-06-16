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
}

export function defaultConfig(overrides: Partial<Config> = {}): Config {
  return {
    seed: 1,
    maxCells: 100_000,
    worldWidth: 4096,
    worldHeight: 4096,
    dt: 1,
    cellRadius: 6,
    repulsion: 2,
    damping: 0.5,
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
