import { describe, it, expect } from 'vitest';
import { RockField } from './rock-field';
import { Rng } from '../math/rng';

describe('RockField init', () => {
  it('is reproducible from the same seed', () => {
    const a = new RockField(100, 8, 8, 4096, 4096);
    a.init(new Rng(42), 20, 4096, 4096, 4, 12);
    const b = new RockField(100, 8, 8, 4096, 4096);
    b.init(new Rng(42), 20, 4096, 4096, 4, 12);

    expect(a.rockCount).toBe(b.rockCount);
    expect(a.rockCount).toBeGreaterThan(0);
    for (let i = 0; i < a.rockCount; i++) {
      expect(a.cx[i]).toBe(b.cx[i]);
      expect(a.cy[i]).toBe(b.cy[i]);
      expect(a.radius[i]).toBe(b.radius[i]);
    }
  });

  it('differs across different seeds', () => {
    const a = new RockField(100, 8, 8, 4096, 4096);
    a.init(new Rng(42), 20, 4096, 4096, 4, 12);
    const b = new RockField(100, 8, 8, 4096, 4096);
    b.init(new Rng(99), 20, 4096, 4096, 4, 12);

    // At least one position should differ (extremely unlikely to collide)
    let diff = false;
    for (let i = 0; i < Math.min(a.rockCount, b.rockCount); i++) {
      if (a.cx[i] !== b.cx[i] || a.cy[i] !== b.cy[i]) {
        diff = true;
        break;
      }
    }
    expect(diff).toBe(true);
  });

  it('places all rocks within world bounds [0, W)', () => {
    const rf = new RockField(50, 8, 8, 1000, 800);
    rf.init(new Rng(7), 30, 1000, 800, 5, 20);

    for (let i = 0; i < rf.rockCount; i++) {
      expect(rf.cx[i]).toBeGreaterThanOrEqual(0);
      expect(rf.cx[i]).toBeLessThan(1000);
      expect(rf.cy[i]).toBeGreaterThanOrEqual(0);
      expect(rf.cy[i]).toBeLessThan(800);
    }
  });

  it('rockCount matches placed count', () => {
    const rf = new RockField(100, 8, 8, 4096, 4096);
    rf.init(new Rng(1), 25, 4096, 4096, 4, 12);

    // Count should be close to requested (rejection sampling might skip a few in
    // extremely unlucky cases, but with 25 rocks in 4096×4096 that's negligible)
    expect(rf.rockCount).toBeGreaterThanOrEqual(24);
    expect(rf.rockCount).toBeLessThanOrEqual(25);
  });

  it('respects maxRocks capacity', () => {
    const rf = new RockField(10, 6, 6, 4096, 4096);
    rf.init(new Rng(3), 50, 4096, 4096, 4, 12);

    expect(rf.rockCount).toBeLessThanOrEqual(10);
    expect(rf.rockCount).toBeGreaterThan(0);
  });

  it('does not place overlapping rocks', () => {
    const rf = new RockField(50, 8, 8, 4096, 4096);
    rf.init(new Rng(5), 30, 4096, 4096, 5, 15);

    for (let i = 0; i < rf.rockCount; i++) {
      for (let j = i + 1; j < rf.rockCount; j++) {
        // Toroidal wrap: shortest distance between centers
        let dx = Math.abs(rf.cx[i]! - rf.cx[j]!);
        if (dx > 2048) dx = 4096 - dx;
        let dy = Math.abs(rf.cy[i]! - rf.cy[j]!);
        if (dy > 2048) dy = 4096 - dy;
        const minDist = rf.radius[i]! + rf.radius[j]!;
        const d2 = dx * dx + dy * dy;
        expect(d2).toBeGreaterThanOrEqual(minDist * minDist - 1e-6);
      }
    }
  });

  it('grid places rocks in correct buckets', () => {
    const rf = new RockField(5, 4, 4, 400, 400);
    // Manually place rocks for deterministic grid test
    rf.cx[0] = 50;
    rf.cy[0] = 50;
    rf.radius[0] = 5;
    rf.cx[1] = 250;
    rf.cy[1] = 250;
    rf.radius[1] = 5;
    rf.rockCount = 2;
    rf.buildGrid();

    // Rock 0 at (50,50) → grid cell (0,0), rock 1 at (250,250) → grid cell (2,2)
    const b0 = 0 * 4 + 0; // bucket 0
    const b2 = 2 * 4 + 2; // bucket 10
    expect(rf.sorted[rf.bucketStart[b0]!]).toBe(0);
    expect(rf.sorted[rf.bucketStart[b2]!]).toBe(1);
  });
});

describe('RockField colOf / rowOf', () => {
  it('maps positions to correct grid cells', () => {
    // world 400×400, 4×4 grid → cell size 100×100
    const rf = new RockField(1, 4, 4, 400, 400);

    expect(rf.colOf(0)).toBe(0);
    expect(rf.colOf(99)).toBe(0);
    expect(rf.colOf(100)).toBe(1);
    expect(rf.colOf(399)).toBe(3);
    // clamp out-of-bounds (should not happen with pre-wrapped coords)
    expect(rf.colOf(400)).toBe(3);
    expect(rf.colOf(-1)).toBe(0);
  });
});