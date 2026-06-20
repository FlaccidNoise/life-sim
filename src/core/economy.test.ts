import { describe, it, expect } from 'vitest';
import { OrganismStore } from './store';
import { FoodField } from './food-field';
import { Rng } from './rng';
import { metabolize, cullDead, reproduce } from './economy';

const W = 128;
const H = 128;

describe('metabolize', () => {
  it('eats from the current food cell and pays basal + movement cost', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.vx[i] = 0;
    s.vy[i] = 0;
    s.energy[i] = 5;
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 1); // cell full (B=10)
    metabolize(s, food, 2, 0.4, 0.01, 0.1); // eat 2, basal 0.4, no movement
    expect(s.energy[i]).toBeCloseTo(5 + 2 - 0.4);
    expect(food.sampleAt(10, 10)).toBeCloseTo(8); // 2 grazed
    expect(s.age[i]!).toBe(1);
  });

  it('charges movement cost ∝ speed²', () => {
    const s = new OrganismStore(4);
    const i = s.alloc();
    s.x[i] = 10;
    s.y[i] = 10;
    s.vx[i] = 3;
    s.vy[i] = 4; // speed² = 25
    s.energy[i] = 50;
    s.rebuildLive();
    const food = new FoodField(W, H, 16, 16, 10, 0); // empty → no eat income
    metabolize(s, food, 2, 0.4, 0.01, 0.1);
    expect(s.energy[i]).toBeCloseTo(50 - 0.4 - 0.01 * 25);
  });
});

describe('cullDead', () => {
  it('frees organisms with energy ≤ 0 and returns the count', () => {
    const s = new OrganismStore(4);
    const a = s.alloc();
    const b = s.alloc();
    s.energy[a] = -1;
    s.energy[b] = 5;
    s.rebuildLive();
    expect(cullDead(s)).toBe(1);
    expect(s.isAlive(a)).toBe(false);
    expect(s.isAlive(b)).toBe(true);
  });
});

describe('reproduce', () => {
  it('splits energy: parent pays reproCost, child starts at birthEnergy', () => {
    const s = new OrganismStore(4);
    const p = s.alloc();
    s.x[p] = 50;
    s.y[p] = 50;
    s.energy[p] = 100;
    s.rebuildLive();
    const rng = new Rng(1);
    const births = reproduce(s, rng, 60, 35, 25, 8, 0.05, 0.02, W, H);
    expect(births).toBe(1);
    expect(s.energy[p]).toBeCloseTo(100 - 35);
    s.rebuildLive();
    expect(s.liveCount).toBe(2);
    const child = s.liveIndices[1]!;
    expect(s.energy[child]!).toBe(25);
  });

  it('does not reproduce below the threshold', () => {
    const s = new OrganismStore(4);
    const p = s.alloc();
    s.energy[p] = 59;
    s.rebuildLive();
    expect(reproduce(s, new Rng(1), 60, 35, 25, 8, 0.05, 0.02, W, H)).toBe(0);
  });

  it('is deterministic given the seed (RNG consumed in order)', () => {
    const make = (): OrganismStore => {
      const s = new OrganismStore(8);
      for (let k = 0; k < 3; k++) {
        const p = s.alloc();
        s.x[p] = 50;
        s.y[p] = 50;
        s.energy[p] = 100;
      }
      s.rebuildLive();
      return s;
    };
    const s1 = make();
    reproduce(s1, new Rng(7), 60, 35, 25, 8, 0.05, 0.02, W, H);
    s1.rebuildLive();
    const s2 = make();
    reproduce(s2, new Rng(7), 60, 35, 25, 8, 0.05, 0.02, W, H);
    s2.rebuildLive();
    for (let k = 0; k < s1.liveCount; k++) {
      const i = s1.liveIndices[k]!;
      expect(s2.x[i]!).toBe(s1.x[i]!);
      expect(s2.y[i]!).toBe(s1.y[i]!);
    }
  });
});
