import { describe, it, expect } from 'vitest';
import { transferEnergy } from './transfer';

describe('transferEnergy — gradient diffusion along bonds', () => {
  it('moves energy from the richer to the needier endpoint, scaled by efficiency', () => {
    const energy = Float32Array.from([100, 0]);
    const liveBonds = Uint32Array.from([0]);
    const cellA = Uint32Array.from([0]);
    const cellB = Uint32Array.from([1]);
    transferEnergy(liveBonds, 1, cellA, cellB, energy, 0.25, 0.9);
    // gap 100, rate 0.25 → move 25 from a; b receives 25·0.9 = 22.5.
    expect(energy[0]).toBeCloseTo(75, 4);
    expect(energy[1]).toBeCloseTo(22.5, 4);
  });

  it('is symmetric in direction (needier endpoint can be either side)', () => {
    const energy = Float32Array.from([0, 80]);
    transferEnergy(
      Uint32Array.from([0]),
      1,
      Uint32Array.from([0]),
      Uint32Array.from([1]),
      energy,
      0.5,
      1.0,
    );
    // b richer by 80, rate 0.5 → move 40 from b; a receives 40.
    expect(energy[1]).toBeCloseTo(40, 4);
    expect(energy[0]).toBeCloseTo(40, 4);
  });

  it('does nothing for equal-energy endpoints', () => {
    const energy = Float32Array.from([50, 50]);
    transferEnergy(
      Uint32Array.from([0]),
      1,
      Uint32Array.from([0]),
      Uint32Array.from([1]),
      energy,
      0.25,
      0.9,
    );
    expect(energy[0]).toBe(50);
    expect(energy[1]).toBe(50);
  });

  it('processes bonds in ascending order (deterministic chained transfer)', () => {
    // chain 0-1-2: bonds (0,1) then (1,2). energy [90, 0, 0], rate 0.5, eff 1.
    const energy = Float32Array.from([90, 0, 0]);
    const liveBonds = Uint32Array.from([0, 1]);
    const cellA = Uint32Array.from([0, 1]);
    const cellB = Uint32Array.from([1, 2]);
    transferEnergy(liveBonds, 2, cellA, cellB, energy, 0.5, 1.0);
    // bond0: 0↔1 gap 90 → move 45: [45,45,0]. bond1: 1↔2 gap 45 → move 22.5: [45,22.5,22.5].
    const oracle1 = Math.fround(45);
    expect(energy[0]).toBeCloseTo(oracle1, 4);
    expect(energy[1]).toBeCloseTo(22.5, 4);
    expect(energy[2]).toBeCloseTo(22.5, 4);
  });
});
