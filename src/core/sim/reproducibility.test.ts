import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';

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
