import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { Brain, BRAIN_GENES, ScalarGene, SCALAR_GENE_COUNT } from './genome';

describe('World — Phase 0 determinism contract', () => {
  it('same (config, seed) → byte-identical hash after N ticks', () => {
    const a = new World(defaultConfig({ seed: 3 }));
    const b = new World(defaultConfig({ seed: 3 }));
    for (let t = 0; t < 1000; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());
  });

  it('different seeds → different hash (seed actually controls the world)', () => {
    const a = new World(defaultConfig({ seed: 3 }));
    const b = new World(defaultConfig({ seed: 4 }));
    for (let t = 0; t < 1000; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).not.toBe(b.stateHash());
  });

  it('reset() reproduces the seeded run byte-for-byte', () => {
    const w = new World(defaultConfig({ seed: 7 }));
    for (let t = 0; t < 500; t++) w.step();
    const hashRun1 = w.stateHash();
    w.reset();
    for (let t = 0; t < 500; t++) w.step();
    expect(w.stateHash()).toBe(hashRun1);
  });

  it('positions stay within the toroidal bounds', () => {
    const cfg = defaultConfig({ seed: 2 });
    const w = new World(cfg);
    for (let t = 0; t < 2000; t++) w.step();
    const s = w.store;
    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      expect(s.x[i]!).toBeGreaterThanOrEqual(0);
      expect(s.x[i]!).toBeLessThan(cfg.worldWidth);
      expect(s.y[i]!).toBeGreaterThanOrEqual(0);
      expect(s.y[i]!).toBeLessThan(cfg.worldHeight);
    }
  });

  it('population matches the configured initial count', () => {
    const w = new World(defaultConfig({ seed: 1, initialPopulation: 123 }));
    expect(w.population).toBe(123);
  });

  it('no explosion: over a long run everything stays finite and within the speed ceiling', () => {
    const cfg = defaultConfig({ seed: 5, initialPopulation: 600 }); // crowded → lots of repulsion
    const w = new World(cfg);
    for (let t = 0; t < 5000; t++) w.step();
    const s = w.store;
    for (let k = 0; k < s.liveCount; k++) {
      const i = s.liveIndices[k]!;
      expect(Number.isFinite(s.x[i]!)).toBe(true);
      expect(Number.isFinite(s.vx[i]!)).toBe(true);
      // "No explosion" = no runaway divergence: the integrate clamp keeps every INTEGRATED creature at
      // or below its OWN evolved maxSpeed gene (+tiny FP slack). A creature born THIS tick (age 0) is
      // excluded: reproduce() copies the parent's velocity to the child, which a child whose mutated
      // maxSpeed gene is lower than the parent's speed exceeds for exactly one tick — it's clamped to its
      // own gene on its first integrate next tick. That 1-tick birth transient is finite and bounded (it
      // can't exceed the global gene cap), not a runaway, so the ceiling is asserted on age>0 creatures.
      if (s.age[i]! > 0) {
        const maxSpeed = s.scalarGenes[i * SCALAR_GENE_COUNT + ScalarGene.MAX_SPEED]!;
        expect(Math.hypot(s.vx[i]!, s.vy[i]!)).toBeLessThanOrEqual(maxSpeed + 1e-6);
      }
    }
  }, 60000); // 5000 ticks at the richer foodCap 40 sustains ~1600 creatures → ~22s; 60s leaves CI headroom

  it('alive-guardrail (CI proxy): population sustains BOTH births and deaths without extinction', () => {
    // The playground spec's ONE automated guardrail (§10): the world must stay alive — no extinction,
    // no zero-births. (CI runs a short proxy; the full 100k×multi-seed check lives in headless/.)
    const cfg = defaultConfig({ seed: 1 });
    const w = new World(cfg);
    for (let t = 0; t < 3000; t++) w.step(); // fast proxy; the full 100k×seeds check is headless/guardrail
    expect(w.totalBirths).toBeGreaterThan(0);
    expect(w.totalDeaths).toBeGreaterThan(0);
    expect(w.population).toBeGreaterThan(0); // not extinct
    expect(w.population).toBeLessThan(cfg.maxOrganisms); // food-limited, not buffer-pegged
  });

  it('full env stack (walls+flow+advection+push) is deterministic AND non-vacuous', () => {
    // Reproducibility with the WHOLE env feature set live, including the size-scaled flow PUSH that is
    // off in the shipped config (flowPushStrength 0). Two worlds, same (config, seed) → identical hash.
    const make = () => new World(defaultConfig({ seed: 11, flowPushStrength: 1 }));
    const a = make();
    const b = make();
    for (let t = 0; t < 1000; t++) {
      a.step();
      b.step();
    }
    expect(a.stateHash()).toBe(b.stateHash());

    // Non-vacuity: prove the env features are actually DOING something, so the determinism above isn't
    // trivially holding over an inert sim. A regression that silently disables an env feature should
    // fail one of these. (Brief requires ≥2; all three asserted.)

    // 1. Neural env-sensing is live: env-sense genes were drawn + mutated → some weight is non-zero.
    const s = a.store;
    let envSenseWired = false;
    for (let k = 0; k < s.liveCount && !envSenseWired; k++) {
      const base = s.liveIndices[k]! * BRAIN_GENES;
      for (let g = Brain.WALL_LAT_TURN; g <= Brain.FLOW_FWD_THRUST; g++) {
        if (s.brain[base + g]! !== 0) {
          envSenseWired = true;
          break;
        }
      }
    }
    expect(envSenseWired).toBe(true);

    // 2. Walls are present and shaping the food field (at least one cell dammed).
    expect(a.walls.active).toBe(true);
    expect(a.walls.solidFraction()).toBeGreaterThan(0);
    expect(a.walls.foodBlockedMask().some((v) => v === 1)).toBe(true);

    // 3. The economy is turning over: births AND deaths both happened.
    expect(a.totalBirths).toBeGreaterThan(0);
    expect(a.totalDeaths).toBeGreaterThan(0);
  });

  it('no live creature ever occupies a solid wall cell (births relocate out of walls)', () => {
    // reproduce() places a child at parent ± offspringOffset in a random direction; without a wall
    // check the child can be born INSIDE a solid cell. Walls are ON by default → scan every live
    // creature after a long run and assert the invariant "no body sits in a wall" holds.
    const cfg = defaultConfig({ seed: 1 });
    const w = new World(cfg);
    expect(w.walls.active).toBe(true); // guard: the default world actually has walls to test against
    for (let t = 0; t < 1500; t++) {
      w.step();
      const s = w.store;
      for (let k = 0; k < s.liveCount; k++) {
        const i = s.liveIndices[k]!;
        expect(w.walls.isSolidAt(s.x[i]!, s.y[i]!)).toBe(false);
      }
    }
  });

  it('ablation: env fully OFF ⇒ the 8 env-sense brain genes are NEVER drawn (stay exactly 0)', () => {
    // The gated-draw contract (Task 6.2): with walls AND flow off, seedGenome/mutateGenome set each
    // env-sense weight to its founder value (0) WITHOUT consuming RNG. So after a long run every live
    // creature — founders and all offspring — keeps WALL_LAT_TURN..FLOW_FWD_THRUST byte-identically 0,
    // and the organism RNG stream is unperturbed by the env feature.
    const cfg = defaultConfig({
      seed: 13,
      wallRegionCount: 0,
      flowStrength: 0,
      flowPushStrength: 0,
    });
    const w = new World(cfg);
    expect(w.walls.active).toBe(false); // env off: no wall field
    expect(w.flow.flowX.every((v) => v === 0)).toBe(true); // env off: flow field not generated

    for (let t = 0; t < 500; t++) w.step();

    const s = w.store;
    expect(s.liveCount).toBeGreaterThan(0); // non-vacuity: the assertion loop runs over real creatures
    for (let k = 0; k < s.liveCount; k++) {
      const base = s.liveIndices[k]! * BRAIN_GENES;
      for (let g = Brain.WALL_LAT_TURN; g <= Brain.FLOW_FWD_THRUST; g++) {
        expect(s.brain[base + g]!).toBe(0);
      }
    }
  });
});
