import { describe, it, expect } from 'vitest';
import { PheroField } from './phero-field';
import { Hasher } from './hash';

const W = 128;
const H = 128;
const COLS = 16;
const ROWS = 16;

describe('PheroField', () => {
  it('deposit adds into the cell; sampleAt reads it back', () => {
    const p = new PheroField(W, H, COLS, ROWS);
    expect(p.sampleAt(40, 40)).toBe(0);
    p.deposit(40, 40, 3);
    expect(p.sampleAt(40, 40)).toBe(3);
    p.deposit(40, 40, 2); // accumulates
    expect(p.sampleAt(40, 40)).toBe(5);
  });

  it('decay-only forgets the field multiplicatively (no diffusion)', () => {
    const p = new PheroField(W, H, COLS, ROWS);
    p.deposit(40, 40, 10);
    p.step(0, 0.1, null); // decay only
    expect(p.sampleAt(40, 40)).toBeCloseTo(9, 10);
    // run a while: it forgets toward 0
    for (let t = 0; t < 200; t++) p.step(0, 0.1, null);
    expect(p.sampleAt(40, 40)).toBeLessThan(1e-6);
  });

  it('diffusion conserves total mass (decay=0); decay then forgets it', () => {
    const p = new PheroField(W, H, COLS, ROWS);
    p.deposit(64, 64, 100);
    const before = p.total();
    expect(before).toBeCloseTo(100, 9);
    // Pure diffusion (decay 0) on a toroidal grid conserves the total — it just spreads it out.
    for (let t = 0; t < 50; t++) p.step(0.2, 0, null);
    expect(p.total()).toBeCloseTo(100, 6);
    expect(p.max()).toBeLessThan(100); // but the peak has spread down
    // now turn on decay → it forgets
    for (let t = 0; t < 500; t++) p.step(0.2, 0.05, null);
    expect(p.total()).toBeLessThan(1e-3);
  });

  it('gradientAt points up the concentration gradient (toward a deposit)', () => {
    const p = new PheroField(W, H, COLS, ROWS);
    // deposit at the right side, sample to its left → gradient should point +x (toward the deposit).
    p.deposit(96, 64, 50);
    for (let t = 0; t < 10; t++) p.step(0.2, 0, null); // spread so a neighbouring cell sees it
    const g = p.gradientAt(64, 64, W / COLS); // one cell half-step
    expect(g.gx).toBeGreaterThan(0); // up-gradient is toward the deposit on the right
  });

  it('wall no-flux: pheromone in a fully-walled cell cannot leak out; blocked cells stay 0', () => {
    const p = new PheroField(W, H, COLS, ROWS);
    const blocked = new Uint8Array(COLS * ROWS);
    const cellW = W / COLS;
    const cellH = H / ROWS;
    // Ring the cell (8,8) with rock on all 4 toroidal neighbours → a sealed chamber. No-flux means a
    // deposit inside it can't diffuse out (each blocked neighbour contributes the cell's OWN value, so
    // avg4 == self → no change), and the blocked cells themselves are forced to 0 every step.
    blocked[8 * COLS + 7] = 1;
    blocked[8 * COLS + 9] = 1;
    blocked[7 * COLS + 8] = 1;
    blocked[9 * COLS + 8] = 1;
    const cx = 8 * cellW + 1;
    const cy = 8 * cellH + 1;
    p.deposit(cx, cy, 100);
    const before = p.sampleAt(cx, cy);
    const total0 = p.total();
    for (let t = 0; t < 200; t++) p.step(0.2, 0, blocked); // diffuse only (decay 0)
    // The sealed cell kept all its mass (no-flux out through rock on every side).
    expect(p.sampleAt(cx, cy)).toBeCloseTo(before, 9);
    // The 4 walling cells hold 0 (forced each step).
    expect(p.sampleAt(7 * cellW + 1, cy)).toBe(0);
    expect(p.sampleAt(9 * cellW + 1, cy)).toBe(0);
    // Global mass is conserved: nothing leaked, nothing was created.
    expect(p.total()).toBeCloseTo(total0, 9);
  });

  it('deterministic: same deposits+steps → byte-identical hash', () => {
    const run = (): string => {
      const p = new PheroField(W, H, COLS, ROWS);
      for (let k = 0; k < 20; k++) p.deposit(k * 5, k * 7, k + 1);
      for (let t = 0; t < 100; t++) p.step(0.2, 0.02, null);
      const h = new Hasher();
      p.hashInto(h);
      return h.hex();
    };
    expect(run()).toBe(run());
  });

  it('reset clears the field back to empty', () => {
    const p = new PheroField(W, H, COLS, ROWS);
    p.deposit(40, 40, 5);
    p.step(0.2, 0.02, null);
    expect(p.total()).toBeGreaterThan(0);
    p.reset();
    expect(p.total()).toBe(0);
    const h = new Hasher();
    p.hashInto(h);
    const fresh = new Hasher();
    new PheroField(W, H, COLS, ROWS).hashInto(fresh);
    expect(h.hex()).toBe(fresh.hex()); // byte-identical to a fresh construction
  });
});
