import { describe, it, expect } from 'vitest';
import { World } from '../sim/world';
import { defaultConfig, type Config } from '../sim/config';
import { CellType } from '../cells/types';

/**
 * A sessile-plants world frozen down to the growth mechanic only: no creatures, no spores
 * (very high spore threshold), no organism reproduction, no basal upkeep, light flooded so a
 * lone base banks energy every tick. Mirrors golden-bond.test.ts's "freeze the inputs" pattern
 * so a single founder plant's tip-growth is isolated from the rest of the economy.
 */
function growthWorld(overrides: Partial<Config> = {}): World {
  const w = new World(
    defaultConfig({
      seed: 7,
      maxCells: 64,
      worldWidth: 800,
      worldHeight: 800,
      sessilePlants: true,
      basalCost: 0, // no upkeep — a banked cell never browns out between growth events
      // small, fast growth economy so the plant reaches the cap within a short run
      plantGrowthThreshold: 5,
      plantGrowthCost: 2,
      plantBondLen: 15,
      // spores OFF (huge threshold) so the only structural change is tip growth — one founder plant
      plantSporeThreshold: 1e9,
      // organism reproduction OFF so a banking plant never splits off a copy and confuses the count
      reproThreshold: 1e9,
      ...overrides,
    }),
    false,
  );
  // Flood the light field to its max everywhere (both the live buffer and the regen cap).
  w.light.light.fill(w.config.lightMax);
  w.light.cap.fill(w.config.lightMax);
  return w;
}

/** Count live PHOTO cells (base + chain) belonging to plant organism `org`. */
function plantCellCount(w: World, org: number): number {
  const f = w.cells.fields;
  let c = 0;
  for (let i = 0; i < w.cells.highWaterMark; i++) {
    if (w.cells.isAlive(i) && f.organismId[i] === org && f.cellType[i] === CellType.PHOTO) c++;
  }
  return c;
}

describe('plant gradual growth', () => {
  it('grows ONE cell at a time up to exactly plantMaxChain (7), then stops', () => {
    const w = growthWorld();
    const cap = w.config.plantMaxChain;
    expect(cap).toBe(7); // guard the spec default — the test below leans on it

    const base = w.seedPlantBase(400, 400, 50);
    expect(base).toBeGreaterThanOrEqual(0);
    const org = w.cells.fields.organismId[base]!;

    // A fresh base is a 1-cell plant before any tick.
    expect(plantCellCount(w, org)).toBe(1);

    // Tick one at a time, recording the count AFTER each tick. The per-tick delta must be 0 or +1
    // (growPlants adds at most one tip cell per plant per tick) and the count must be monotonic —
    // i.e. growth is GRADUAL, never a jump from 1 straight to the cap.
    const counts: number[] = [1];
    let reachedCapAtTick = -1;
    for (let t = 0; t < 60; t++) {
      w.light.light.fill(w.config.lightMax); // top the pocket so depletion never browns it out
      w.tick();
      const c = plantCellCount(w, org);
      const prev = counts[counts.length - 1]!;
      expect(c - prev).toBeGreaterThanOrEqual(0); // never shrinks (no sever/graze in this world)
      expect(c - prev).toBeLessThanOrEqual(1); // GRADUAL: at most one new cell per tick
      counts.push(c);
      if (c === cap && reachedCapAtTick < 0) reachedCapAtTick = t;
    }

    // It actually reached the cap (non-vacuous: a no-growth bug would never trip this).
    expect(reachedCapAtTick).toBeGreaterThanOrEqual(0);
    // Final state is EXACTLY the cap — not over, not under.
    const final = plantCellCount(w, org);
    expect(final).toBe(cap);

    // Growth was genuinely incremental: every value 1..cap appeared at some tick (no skipped sizes).
    for (let size = 1; size <= cap; size++) {
      expect(counts).toContain(size);
    }

    // And it STOPPED at the cap: across the many ticks after first reaching it, the count never grew.
    const ticksAfterCap = counts.slice(reachedCapAtTick + 1); // counts[i+1] is the count after tick i
    expect(ticksAfterCap.length).toBeGreaterThan(0); // we ran well past the cap
    for (const c of ticksAfterCap) expect(c).toBe(cap);

    // The base itself never moved (anchored) — it is the pinned root the chain grew off.
    expect(w.cells.fields.posX[base]).toBe(400);
    expect(w.cells.fields.posY[base]).toBe(400);
    expect(w.cells.fields.anchored[base]).toBe(1);
  });
});
