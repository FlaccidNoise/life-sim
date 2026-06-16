import { describe, it, expect } from 'vitest';
import { defaultConfig, serializeConfig, deserializeConfig } from './config';

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
