import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig, decisiveMovementPreset } from './config';
import { CellType } from '../cells/types';
import { torusDist } from '../math/vec2';
import { buildForagerGenome, buildSightedForagerGenome } from '../genome/critter-genome';
import type { Genome } from '../genome/genome';

// GOLDEN (runnable only at Phase 4): with sight ON, a forager that grows a FOOD-eye pair closes
// distance to a nearby plant cluster FASTER than a smell-only forager from the IDENTICAL start.
// This is the proof that the FOOD-eye actually improves navigation.
//
// Each forager runs in its OWN World with the IDENTICAL setup (same food cluster, same start pose,
// same seed) — the ONLY difference is the genome (smell-only vs smell + FOOD-eye). We measure how
// close each one's MOVER gets to the food after the same number of ticks.
//
// GEOMETRY (why this proves sight helps, honestly): the forager starts at (400,400) facing +x
// (heading 0); the plant cluster sits ~100 units away at 45° OFF the heading axis (up-and-to-the-
// right). Smell is a diffuse, central-difference gradient — off-axis its LAT component is weak, so
// the smell-only forager under-steers, overshoots, and settles into a stable miss ~45 units away.
// As the body cruises forward the cluster enters the 60-unit view cone; the eye then locks a CLEAN
// direct vector to the plant and the steering loop (LAT-eye→turn, FWD-eye→thrust) homes it in to
// ~16-27 units. Sight wins by a robust ~19-unit margin (verified 300-500 ticks, half-angle 45-87°);
// the smell-only d1 is rock-steady at 45.5 across tick counts because it locks into an orbiting miss.
//
// Small 800² torus + 16-grid food field is the proven climbable-gradient geometry (mirrors
// critter-swim.test.ts); the decisive-movement preset commits the steering; viewRange 60 / half-
// angle ~79° (safely under the π/2 ceiling) fires the eye once the cluster is in range.
//
// dSmell≈45.5, dSight≈26.1 at 400 ticks (margin ≈19).
function distAfter(genome: Genome, ticks: number): { d0: number; d1: number } {
  const cfg = defaultConfig({
    ...decisiveMovementPreset,
    maxCells: 256,
    worldWidth: 800,
    worldHeight: 800,
    foodGridCols: 16,
    foodGridRows: 16,
    repulsion: 0,
    divideThreshold: 1e9, // plants don't divide; forager can't reach repro
    basalCost: 0,
    initialMotileFraction: 0,
    viewRange: 60, // sight ON (R = ceil(60/50) = 2 within the cost ceiling)
    viewHalfAngle: Math.PI / 2 - 0.2, // ~79°: wide cone, safely under the π/2 accept-behind ceiling
  });
  const w = new World(cfg, false);
  const f = w.cells.fields;
  // PHOTO food cluster ~100 units away at 45° off the forager's +x heading (up and to the right).
  const off = 100 / Math.SQRT2;
  for (let k = 0; k < 12; k++) {
    const i = w.cells.alloc();
    f.posX[i] = 400 + off - 3 + (k % 4) * 4;
    f.posY[i] = 400 + off - 4 + ((k / 4) | 0) * 4;
    f.radius[i] = cfg.cellRadius;
    f.mass[i] = 1;
    f.energy[i] = 100;
    f.cellType[i] = CellType.PHOTO;
  }
  const foodX = 400 + off - 3 + 6;
  const foodY = 400 + off - 4 + 4;
  // Identical start pose for both genomes: (400,400) facing +x → the food is OFF-axis.
  const org = w.spawnOrganism(genome, 400, 400, 0);
  expect(org).toBeGreaterThanOrEqual(0);
  // find the MOVER cell of this organism for distance measurement
  let mover = -1;
  for (let i = 0; i < f.cellType.length; i++) {
    if (f.organismId[i] === org && f.cellType[i] === CellType.MOVER) {
      mover = i;
      break;
    }
  }
  expect(mover).toBeGreaterThanOrEqual(0);
  const d0 = torusDist(f.posX[mover]!, f.posY[mover]!, foodX, foodY, 800, 800);
  for (let t = 0; t < ticks; t++) w.tick();
  const d1 = torusDist(f.posX[mover]!, f.posY[mover]!, foodX, foodY, 800, 800);
  return { d0, d1 };
}

describe('GOLDEN — sight forager out-forages smell-only forager', () => {
  it('the sighted forager is meaningfully closer to off-axis food after the same ticks', () => {
    const TICKS = 400;
    const smell = distAfter(buildForagerGenome(6, 100), TICKS);
    const sight = distAfter(buildSightedForagerGenome(6, 100), TICKS);
    // Both start at the same distance (sanity: identical setup).
    expect(sight.d0).toBeCloseTo(smell.d0, 5);
    // The FOOD-eye locks the off-axis cluster and homes in; smell under-steers and stalls in a miss.
    // Assert a MEANINGFUL margin (≥10 units), not a 1-unit fluke. Measured margin ≈19 at 400 ticks.
    expect(sight.d1).toBeLessThan(smell.d1 - 10);
  });
});
