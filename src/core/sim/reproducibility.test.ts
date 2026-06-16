import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { spawnSwimmer, type Critter } from './critter';
import { CellType } from '../cells/types';

function runWorld(seed: number): World {
  const w = new World(defaultConfig({ seed, maxCells: 2000 }), false);
  w.seedLife(1000);
  for (let i = 0; i < 200; i++) w.tick();
  return w;
}

describe('reproducibility', () => {
  it('produces byte-identical arrays for the same (Config, seed)', () => {
    const a = runWorld(12345);
    const b = runWorld(12345);
    expect(Array.from(a.cells.fields.posX.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.posX.slice(0, 1000)),
    );
    expect(Array.from(a.cells.fields.posY.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.posY.slice(0, 1000)),
    );
    expect(Array.from(a.cells.fields.age.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.age.slice(0, 1000)),
    );
    expect(Array.from(a.cells.fields.heading.slice(0, 1000))).toEqual(
      Array.from(b.cells.fields.heading.slice(0, 1000)),
    );
  });

  it('produces different positions for different seeds', () => {
    const a = runWorld(1);
    const b = runWorld(2);
    expect(Array.from(a.cells.fields.posX.slice(0, 1000))).not.toEqual(
      Array.from(b.cells.fields.posX.slice(0, 1000)),
    );
  });
});

function runWithCritter(seed: number): { w: World; c: Critter } {
  const w = new World(defaultConfig({ seed, maxCells: 2000 }), false);
  w.seedLife(500);
  // Spawn the critter into a PHOTO cluster so the smell field gives it a real
  // gradient → the reproduced activations cover the sensor→neuron→motor chain.
  const f = w.cells.fields;
  for (let k = 0; k < 12; k++) {
    const i = w.cells.alloc();
    f.posX[i] = 1040 + (k % 4) * 4;
    f.posY[i] = 1000 + ((k / 4) | 0) * 4;
    f.radius[i] = w.config.cellRadius;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.PHOTO;
  }
  const c = spawnSwimmer(w, 1000, 1000, 0.5);
  for (let i = 0; i < 150; i++) w.tick();
  return { w, c };
}

describe('reproducibility — neuron activations', () => {
  it('produces byte-identical activations for the same (Config, seed)', () => {
    const a = runWithCritter(999);
    const b = runWithCritter(999);
    // Compare the actual critter neuron slots + the mover's thrust/heading, so the
    // sensorimotor chain — not only the oscillator — is locked.
    const slots = [a.c.sensorFwd, a.c.sensorLat, a.c.clockA, a.c.clockB, a.c.turn, a.c.thrust];
    for (const s of slots) expect(a.w.net.actCur[s]!).toBe(b.w.net.actCur[s]!);
    expect(a.w.cells.fields.heading[a.c.mover]!).toBe(b.w.cells.fields.heading[b.c.mover]!);
    // and the SENSOR chain (not just the free-running oscillator) computed a non-zero
    // value — proving the sensor→neuron path, fed by the PHOTO smell gradient, ran.
    expect(a.w.net.actCur[a.c.sensorFwd]! !== 0 || a.w.net.actCur[a.c.sensorLat]! !== 0).toBe(true);
  });
});
