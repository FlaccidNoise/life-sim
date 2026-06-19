import { describe, it, expect } from 'vitest';
import {
  defaultConfig,
  decisiveMovementPreset,
  serializeConfig,
  deserializeConfig,
} from './config';

describe('Config', () => {
  it('provides defaults', () => {
    const c = defaultConfig();
    expect(c.seed).toBeTypeOf('number');
    expect(c.maxCells).toBeGreaterThan(0);
    expect(c.worldWidth).toBeGreaterThan(0);
    expect(c.dt).toBeGreaterThan(0);
  });

  it('applies overrides', () => {
    const c = defaultConfig({ seed: 99, maxCells: 10 });
    expect(c.seed).toBe(99);
    expect(c.maxCells).toBe(10);
  });

  it('round-trips through JSON', () => {
    const c = defaultConfig({ seed: 7 });
    const back = deserializeConfig(serializeConfig(c));
    expect(back).toEqual(c);
  });

  it('fills missing fields with defaults on deserialize', () => {
    const back = deserializeConfig('{"seed":5}');
    expect(back.seed).toBe(5);
    expect(back.maxCells).toBe(defaultConfig().maxCells);
  });

  it('provides M2 light/economy/division defaults', () => {
    const c = defaultConfig();
    expect(c.lightGridCols).toBeGreaterThanOrEqual(3);
    expect(c.lightGridRows).toBeGreaterThanOrEqual(3);
    expect(c.lightMax).toBeGreaterThan(0);
    expect(c.photoGain).toBeGreaterThan(0);
    expect(c.basalCost).toBeGreaterThan(0);
    expect(c.digestEfficiency).toBeGreaterThan(0);
    expect(c.digestEfficiency).toBeLessThan(1);
    expect(c.divideThreshold).toBeGreaterThan(c.divideCost);
    expect(c.initialPhotoFraction).toBeGreaterThan(0);
    expect(c.initialPhotoFraction).toBeLessThanOrEqual(1);
  });
});

describe('M3 config', () => {
  it('exposes food-field + sense/move knobs with sane defaults', () => {
    const c = defaultConfig();
    expect(c.foodGridCols).toBe(64);
    expect(c.foodGridRows).toBe(64);
    expect(c.foodDiffuse).toBeGreaterThan(0);
    expect(c.foodDiffuse).toBeLessThanOrEqual(0.25);
    expect(c.foodDecay).toBeGreaterThanOrEqual(0);
    expect(c.foodDecay).toBeLessThan(1);
    expect(c.maxThrust).toBeGreaterThan(0);
    expect(c.moveCost).toBeGreaterThan(0);
    expect(c.initialMotileFraction).toBeGreaterThanOrEqual(0);
    // photo + motile fractions must leave room for digestives
    expect(c.initialPhotoFraction + c.initialMotileFraction).toBeLessThanOrEqual(1);
  });

  it('round-trips the new fields through serialize/deserialize', () => {
    const c = defaultConfig({ thrustGain: 99, foodDecay: 0.123 });
    const back = deserializeConfig(serializeConfig(c));
    expect(back.thrustGain).toBe(99);
    expect(back.foodDecay).toBe(0.123);
  });
});

describe('M4 config', () => {
  it('exposes neural knobs with sane defaults', () => {
    const c = defaultConfig();
    expect(c.maxSynapses).toBeGreaterThan(0);
    expect(c.neuralCost).toBeGreaterThanOrEqual(0);
    expect(c.turnScale).toBeGreaterThan(0);
    expect(c.thrustScale).toBeGreaterThan(0);
    expect(typeof c.thrustBias).toBe('number');
  });

  it('round-trips the new fields through serialize/deserialize', () => {
    const c = defaultConfig({ neuralCost: 0.077, maxSynapses: 1234 });
    const back = deserializeConfig(serializeConfig(c));
    expect(back.neuralCost).toBe(0.077);
    expect(back.maxSynapses).toBe(1234);
  });
});

describe('M5 config', () => {
  it('exposes bond/organism/transfer/adhesion knobs with sane defaults', () => {
    const c = defaultConfig();
    expect(c.maxBonds).toBeGreaterThan(0);
    expect(c.maxOrganisms).toBeGreaterThan(0);
    expect(c.bondDegreeCap).toBeGreaterThanOrEqual(4);
    expect(c.bondStiffness).toBeGreaterThan(0);
    // Symplectic-Euler stability (audit blocker): the bond spring's effective k = bondStiffness·perBondStiffness
    // (the kernel's /d cancels the ddx=±d projection). The two-free-mass ceiling for dt=1/damping=0.5/mass=1
    // is ~3; a multi-spoke hub is tighter; k=8 diverges to ~1e162. Gate the default well under the ceiling so a
    // future re-tune to an unstable value fails HERE (Task 1) instead of as Inf/NaN 13 tasks later (Task 14).
    expect(c.bondStiffness * c.dt * c.dt).toBeLessThanOrEqual(2.5);
    // Latch tether springs share the bond spring's symplectic-Euler divergence
    // physics (mutual fx=stiffness·dx, same force stage, same mass regime — see
    // latch-tether.ts). Gate their defaults under the same k·dt² ≤ 2.5 ceiling so
    // a future re-tune past the ~3 two-free-mass ceiling fails here, not as Inf/NaN
    // in the SoA force buffers. (Defaults are 0 and 0.8, both well under; this
    // guards against a bad slider/re-tune.)
    expect(c.predLatchStiffness * c.dt * c.dt).toBeLessThanOrEqual(2.5);
    expect(c.grazeLatchStiffness * c.dt * c.dt).toBeLessThanOrEqual(2.5);
    expect(c.bondMaxStrain).toBeGreaterThan(0);
    expect(c.transferRate).toBeGreaterThan(0);
    expect(c.transferRate).toBeLessThanOrEqual(0.5); // stability bound
    expect(c.transferEfficiency).toBeGreaterThan(0);
    expect(c.transferEfficiency).toBeLessThanOrEqual(1);
    expect(c.adhesionStrength).toBe(0); // OFF by default — no perturbation to M2/M3
    expect(c.adhesionRange).toBeGreaterThan(0);
    expect(c.digestClusterBonus).toBeGreaterThanOrEqual(0);
    expect(c.maxSplitChecksPerTick).toBeGreaterThan(0);
  });

  it('round-trips the new fields through serialize/deserialize', () => {
    const c = defaultConfig({ maxBonds: 1234, transferRate: 0.077, digestClusterBonus: 0.33 });
    const back = JSON.parse(serializeConfig(c)) as typeof c;
    expect(back.maxBonds).toBe(1234);
    expect(back.transferRate).toBe(0.077);
    expect(back.digestClusterBonus).toBe(0.33);
  });
});

describe('M6 config', () => {
  it('exposes genome/reproduction/development knobs with sane defaults', () => {
    const c = defaultConfig();
    expect(c.reproThreshold).toBeGreaterThan(0);
    expect(c.reproParentFloor).toBeGreaterThan(0);
    // The parent must be able to afford an offspring AND survive: the floor it keeps
    // must be below the threshold that triggers reproduction.
    expect(c.reproParentFloor).toBeLessThan(c.reproThreshold);
    expect(c.organismDeathFloor).toBeGreaterThanOrEqual(0);
    expect(c.organismDeathFloor).toBeLessThan(c.reproThreshold);
    expect(c.offspringOffset).toBeGreaterThan(0);
    expect(c.maxCellsPerOrganism).toBeGreaterThan(0);
    expect(c.maxRecursionDepth).toBeGreaterThan(0);
    expect(c.maxBirthsPerTick).toBeGreaterThan(0);
    // Mutation rates default to 0 (clone-only): M6 is reproduction-first, selection is M7.
    expect(c.mutationParamRate).toBe(0);
    expect(c.mutationWeightRate).toBe(0);
    expect(c.mutationAddGeneRate).toBe(0);
    expect(c.mutationDeleteGeneRate).toBe(0);
    expect(c.mutationDuplicateGeneRate).toBe(0);
    expect(c.mutationRewireRate).toBe(0);
    expect(c.mutationChangeTypeRate).toBe(0);
    expect(c.mutationDuplicateSubgraphRate).toBe(0);
    // Sigmas are present (live-tunable) even though rates are 0.
    expect(c.mutationParamSigma).toBeGreaterThan(0);
    expect(c.mutationWeightSigma).toBeGreaterThan(0);
  });

  it('round-trips the new fields through serialize/deserialize', () => {
    const c = defaultConfig({
      reproThreshold: 777,
      mutationParamRate: 0.05,
      maxCellsPerOrganism: 99,
    });
    const back = JSON.parse(serializeConfig(c)) as typeof c;
    expect(back.reproThreshold).toBe(777);
    expect(back.mutationParamRate).toBe(0.05);
    expect(back.maxCellsPerOrganism).toBe(99);
  });
});

describe('config — loudnessGain (hearing)', () => {
  it('defaults to 0 (hearing OFF, byte-identical)', () => {
    expect(defaultConfig().loudnessGain).toBe(0);
  });
  it('is overridable', () => {
    expect(defaultConfig({ loudnessGain: 0.5 }).loudnessGain).toBe(0.5);
  });
});

describe('decisiveMovementPreset — opt-in decisive-steering movement gains', () => {
  it('raises maxThrust, turnScale, thrustScale above the conservative defaults', () => {
    const base = defaultConfig();
    expect(decisiveMovementPreset.maxThrust!).toBeGreaterThan(base.maxThrust);
    expect(decisiveMovementPreset.turnScale!).toBeGreaterThan(base.turnScale);
    expect(decisiveMovementPreset.thrustScale!).toBeGreaterThan(base.thrustScale);
  });

  it('does NOT alter defaultConfig (byte-identical guard stays intact)', () => {
    const base = defaultConfig();
    expect(base.maxThrust).toBe(6);
    expect(base.turnScale).toBeCloseTo(0.3, 6);
    expect(base.thrustScale).toBe(3);
    expect(base.thrustBias).toBe(2);
  });

  it('is applied only when explicitly spread into a config', () => {
    const tuned = defaultConfig(decisiveMovementPreset);
    expect(tuned.maxThrust).toBe(decisiveMovementPreset.maxThrust);
    expect(tuned.turnScale).toBe(decisiveMovementPreset.turnScale);
  });
});
