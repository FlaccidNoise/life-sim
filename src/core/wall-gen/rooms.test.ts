import { describe, it, expect } from 'vitest';
import { carveRooms } from './rooms';
import { Rng } from '../rng';

const fraction = (solid: Uint8Array): number => {
  let n = 0;
  for (let i = 0; i < solid.length; i++) if (solid[i]) n++;
  return n / solid.length;
};

const largestOpenComponent = (solid: Uint8Array, cols: number, rows: number): number => {
  const seen = new Uint8Array(solid.length);
  let best = 0;
  const stack: number[] = [];
  for (let start = 0; start < solid.length; start++) {
    if (solid[start] || seen[start]) continue;
    let size = 0;
    stack.push(start);
    seen[start] = 1;
    while (stack.length) {
      const i = stack.pop()!;
      size++;
      const c = i % cols;
      const r = (i - c) / cols;
      const nbrs = [
        ((r - 1 + rows) % rows) * cols + c,
        ((r + 1) % rows) * cols + c,
        r * cols + ((c - 1 + cols) % cols),
        r * cols + ((c + 1) % cols),
      ];
      for (const j of nbrs) {
        if (!solid[j] && !seen[j]) {
          seen[j] = 1;
          stack.push(j);
        }
      }
    }
    if (size > best) best = size;
  }
  return best;
};

describe('carveRooms', () => {
  it('hits roughly the target solid fraction', () => {
    // Target 0.45 solid; rooms+corridors overshoot the open target a little (the loop only stops
    // AFTER the room that crosses the threshold), so the realised solid fraction sits a touch below
    // 0.45. A [0.3, 0.6] band comfortably brackets that for a 64x64 grid.
    const solid = new Uint8Array(64 * 64);
    carveRooms(solid, 64, 64, 0.45, new Rng(1));
    const f = fraction(solid);
    expect(f).toBeGreaterThan(0.3);
    expect(f).toBeLessThan(0.6);
  });

  it('carves a single large connected open region (rooms joined by corridors)', () => {
    const solid = new Uint8Array(64 * 64);
    carveRooms(solid, 64, 64, 0.45, new Rng(3));
    let openCells = 0;
    for (let i = 0; i < solid.length; i++) if (!solid[i]) openCells++;
    expect(openCells).toBeGreaterThan(0);
    const biggest = largestOpenComponent(solid, 64, 64);
    // Corridors stitch every room centre into one component, so the bulk of open cells (not an
    // isolated dot) belong to a single region.
    expect(biggest).toBeGreaterThan(openCells * 0.9);
  });

  it('is deterministic from the same Rng seed', () => {
    const a = new Uint8Array(64 * 64);
    const b = new Uint8Array(64 * 64);
    carveRooms(a, 64, 64, 0.45, new Rng(7));
    carveRooms(b, 64, 64, 0.45, new Rng(7));
    expect(a).toEqual(b);
  });
});
