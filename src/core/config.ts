/**
 * Simulation configuration — the SINGLE source of truth. Per the rebuild spec's safeguard #2
 * ("one config, one scale"), DEMO_CONFIG is used by the browser demo, the headless harness, AND every
 * test. Demo = validated = tested. There is deliberately no separate "test scale" — validation that
 * doesn't run at the watched scale doesn't count.
 *
 * Phase 0 fields only. Each later phase ADDS its knobs here (and every new system ships with an
 * off-switch knob, enforced by the ablation gate).
 */
export interface Config {
  /** Seed for the single RNG. Part of the reproducibility key (Config, seed). */
  seed: number;
  /** Toroidal world dimensions in world units. ONE fixed scale (safeguard #2). */
  worldWidth: number;
  worldHeight: number;
  /** Fixed timestep. All rates are per-tick. */
  dt: number;
  /** Organism store capacity (restart-required buffer size). */
  maxOrganisms: number;
  /** Organisms seeded at world creation. A live knob — crank it to preview a fuller world. */
  initialPopulation: number;
  /** Phase-0 constant drift speed (world units/tick) so there is visible motion to watch. */
  driftSpeed: number;
}

export function defaultConfig(overrides: Partial<Config> = {}): Config {
  return {
    seed: 1,
    // One fixed moderate scale (rebuild decision): big enough for real ecology later, small enough
    // to validate at full scale in real time on a laptop.
    worldWidth: 1024,
    worldHeight: 1024,
    dt: 1,
    maxOrganisms: 4096,
    // Phase 0 is a watchable skeleton; a modest crowd makes the instrument panel legible (motion,
    // the population series, click-to-inspect). Physics/economy arrive in later phases.
    initialPopulation: 200,
    driftSpeed: 0.4,
    ...overrides,
  };
}

/** The one config the demo, harness, and tests all use. */
export const DEMO_CONFIG: Config = defaultConfig();
