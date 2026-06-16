import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { isLiving } from '../cells/types';

const CONFIGS = [
  { seed: 1 },
  { seed: 2, basalCost: 0.1, divideThreshold: 120 },
  { seed: 3, lightMax: 0.3, meatDecay: 1 },
  { seed: 4, photoGain: 0.1, lightRegen: 0.2 },
];

describe('tier-3 invariants (property)', () => {
  for (const over of CONFIGS) {
    it(`holds invariants every tick (config ${JSON.stringify(over)})`, () => {
      const cfg = defaultConfig({ maxCells: 2000, worldWidth: 1024, worldHeight: 1024, ...over });
      const w = new World(cfg, false);
      w.seedLife(600);
      for (let t = 0; t < 200; t++) {
        w.tick();
        const f = w.cells.fields;
        expect(w.cells.aliveCount).toBeGreaterThanOrEqual(0);
        expect(w.cells.aliveCount).toBeLessThanOrEqual(cfg.maxCells);
        // Scan the live set with plain JS so the per-cell invariants are checked
        // without paying vitest's per-call expect() cost millions of times (the
        // rebalanced economy can grow this to ~1.5k cells × 200 ticks). On the
        // first violation we capture the offending slot and let the asserts below
        // report it; on a clean tick we never touch expect() inside the loop.
        let bad = -1;
        for (let k = 0; k < w.liveCount; k++) {
          const i = w.liveIndices[k]!;
          const energy = f.energy[i]!;
          const x = f.posX[i]!;
          const y = f.posY[i]!;
          if (
            !Number.isFinite(energy) ||
            !Number.isFinite(x) ||
            !Number.isFinite(y) ||
            x < 0 ||
            x >= cfg.worldWidth ||
            y < 0 ||
            y >= cfg.worldHeight ||
            (isLiving(f.cellType[i]!) && !(energy > 0))
          ) {
            bad = i;
            break;
          }
        }
        if (bad >= 0) {
          expect(Number.isFinite(f.energy[bad]!)).toBe(true);
          expect(Number.isFinite(f.posX[bad]!)).toBe(true);
          expect(Number.isFinite(f.posY[bad]!)).toBe(true);
          expect(f.posX[bad]!).toBeGreaterThanOrEqual(0);
          expect(f.posX[bad]!).toBeLessThan(cfg.worldWidth);
          expect(f.posY[bad]!).toBeGreaterThanOrEqual(0);
          expect(f.posY[bad]!).toBeLessThan(cfg.worldHeight);
          if (isLiving(f.cellType[bad]!)) expect(f.energy[bad]!).toBeGreaterThan(0);
          // Fallback in case the captured cell paradoxically satisfies all asserts.
          throw new Error(
            `invariant violated at slot ${bad} on tick ${t} (config ${JSON.stringify(over)})`,
          );
        }
      }
    });
  }
});
