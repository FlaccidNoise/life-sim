import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig, decisiveMovementPreset } from './config';
import { CellType } from '../cells/types';
import { torusDist } from '../math/vec2';
import { buildForagerGenome, buildSightedForagerGenome } from '../genome/critter-genome';
import type { Genome } from '../genome/genome';

// GOLDEN (runnable only at Phase 4): a FOOD-eye improves close-approach navigation to an off-axis
// food cluster — and the ONLY variable that proves it is `viewRange`. We run the SAME sighted-forager
// body (buildSightedForagerGenome — 8 cells, with the eye pair) TWICE on the IDENTICAL geometry +
// seed: once eyes-OPEN (viewRange 60, the cone query fires) and once eyes-BLIND (viewRange 0, the
// cone query is skipped). Same body, same mass, same start pose, same food — the delta in how close
// the MOVER ends up IS the eye. This isolates the eye organ from any body-plan confound.
//
// (Earlier this golden compared the 8-cell sighted body vs the 6-cell smell-only body; that ≥10u
// gap was carried by the heavier 8-cell body, NOT the eye — verified by blinding the sighted body
// and still beating smell-only. So the body-plan comparison is INFORMATIONAL only, not the proof.)
//
// WHY viewRange ISOLATES THE EYE: with viewRange 0 the SIGHT-source sensor cells skip the cone query
// (sense.ts: `if (!sightOn) continue`) and retain the SMELL-path gradient sampled at their position —
// i.e. the body degenerates to a pure smell forager (the eye contributes no extra information). With
// viewRange 60 those same cells run the cone query and lock a CLEAN direct vector to the plant; the
// steering loop (LAT-eye→turn, FWD-eye→thrust) then homes the body in.
//
// GEOMETRY: the forager starts at (400,400) facing +x (heading 0); the plant cluster sits ~100 units
// away at 45° OFF the heading axis. Smell is a diffuse central-difference gradient — off-axis its LAT
// component is weak, so a smell-only steerer under-steers, overshoots, and settles into a stable miss
// ~24 units out. The eye locks the cluster the moment it enters the 60-unit cone and closes to ~3u.
//
// TIMING (why ≥800 ticks, not 400): the eye PAYS OFF LONG-RUN, not early. At 400 ticks eyes-OPEN
// (26.1) is actually ~1.5u WORSE than eyes-BLIND (24.5) — the early cruise hasn't yet brought the
// cluster into a stable lock. By ~800 ticks the eye has homed in (3.3) while the blind body is stuck
// in its smell-miss (23.7); that ~20u gap is rock-steady through 3000 ticks. So we measure at 2000.
//
// Small 800² torus + 16-grid food field is the proven climbable-gradient geometry (mirrors
// critter-swim.test.ts); the decisive-movement preset commits the steering; viewRange 60 / half-angle
// ~79° (safely under the π/2 ceiling) fires the eye once the cluster is in range.
//
// MEASURED (deterministic): at 2000 ticks eyesOpen.d1≈3.3, eyesBlind.d1≈23.7 (gap ≈20). The smell-
// only 6-cell body (informational baseline) stalls at d1≈45.5 across all tick counts.
function distAfter(genome: Genome, ticks: number, viewRange: number): { d0: number; d1: number } {
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
    viewRange, // the ONLY variable: 60 = eyes-OPEN (cone query fires), 0 = eyes-BLIND (query skipped)
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
  // Identical start pose: (400,400) facing +x → the food is OFF-axis.
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

describe('GOLDEN — the FOOD-eye improves close-approach navigation (viewRange is the only variable)', () => {
  it('the SAME sighted body homes in closer with eyes OPEN than with eyes BLIND', () => {
    // Long enough for the eye to win: the payoff is long-run (at 400 ticks the eye is ~1.5u WORSE;
    // the ~20u win is stable from ~800 ticks through 3000). Measure at 2000.
    const TICKS = 2000;
    const body = () => buildSightedForagerGenome(6, 100); // identical 8-cell body for BOTH runs
    const eyesOpen = distAfter(body(), TICKS, 60); // cone query fires
    const eyesBlind = distAfter(body(), TICKS, 0); // cone query skipped → degenerates to smell
    // Same body, same mass, same geometry, same seed: both start at the identical distance.
    expect(eyesOpen.d0).toBeCloseTo(eyesBlind.d0, 5);
    // The eye is the cause: with the cone query firing the body homes in (~3u); blinded it stalls in
    // a smell-miss (~24u). Assert a MEANINGFUL margin (≥10u) against the measured ~20u gap — not a
    // fluke, and one a stalled-blind body provably FAILS (eyesBlind 23.7 ≥ 23.7−10, so the blind run
    // does NOT satisfy this assertion → the eye, not the body plan, carries the win).
    expect(eyesOpen.d1).toBeLessThan(eyesBlind.d1 - 10);

    // INFORMATIONAL CONTEXT (not part of the proof): the bare 6-cell smell-only body stalls even
    // further out (~45u) — but that larger gap is a body-plan difference, so it is NOT asserted here.
    const smellOnly = distAfter(buildForagerGenome(6, 100), TICKS, 0);
    expect(smellOnly.d0).toBeCloseTo(eyesOpen.d0, 5); // identical start (sanity only)
  });
});
