import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig, decisiveMovementPreset } from './config';
import { torusDist } from '../math/vec2';
import { buildHearingPredatorGenome, buildFleeingPreyGenome } from '../genome/critter-genome';

// GOLDEN (runnable only at Phase 4): with sight+hearing+predation+flee ON, a pursuit predator
// catches a fleeing prey. "Caught" is detected STRUCTURALLY — the prey organism's cellCount drops
// to 0 (atomic death → MEAT) — never by reading a role label. Predation runs off organisms.carnivore,
// which the PREDATOR mouth sets structurally at instantiate.
// Measured (deterministic): with the brief's exact knob values the predator runs the prey down at
// tick 190 (well inside the 3000-tick window). The prey GENUINELY FLEES — over the first 150 ticks
// its inverted predator-eye/hearing steering drives a 33-unit retreat (net +25 in y, directly away
// from the predator that starts below it); with flee OFF (predFleeWeight 0 + predScentDeposit 0) that
// collapses to ~19 units (net +10), so the flee roughly doubles the prey's escape. The latch + tether
// + carnivore speed-edge still close the gap. The prey dies atomically (aggregate energy → death
// floor → whole organism converts to MEAT in one tick → cellCount 0). No genome weights were touched;
// every lever is a config knob within its documented ceiling (predReach/predLatchRange 1.4 ≤ 1.5·cellSize).
describe('GOLDEN — sighted/hearing predator catches a fleeing prey', () => {
  it('drains the prey organism to atomic death within the chase window', () => {
    const cfg = defaultConfig({
      ...decisiveMovementPreset,
      maxCells: 512,
      worldWidth: 600,
      worldHeight: 600,
      repulsion: 0.5,
      basalCost: 0,
      divideThreshold: 1e9, // no births to confound the count
      initialMotileFraction: 0,
      // senses ON
      viewRange: 60,
      viewHalfAngle: Math.PI / 2,
      loudnessGain: 1, // hearing ON
      // predation + flee ON (proven ecology levers)
      preyDeposit: 2,
      predScentDeposit: 2,
      predFleeWeight: 1,
      predDigestRate: 40,
      predReach: 1.4,
      predLatchRange: 1.4,
      predLatchStiffness: 0.5,
      carnivoreThrustMult: 1.3,
    });
    const w = new World(cfg, false);
    // prey first (lower organism id), predator a short distance behind it, facing the prey.
    const prey = w.spawnOrganism(buildFleeingPreyGenome(6, 400), 300, 300, Math.PI / 2);
    const predator = w.spawnOrganism(buildHearingPredatorGenome(6, 400), 300, 240, Math.PI / 2);
    expect(prey).toBeGreaterThanOrEqual(0);
    expect(predator).toBeGreaterThanOrEqual(0);
    expect(w.organisms.carnivore[predator]).toBe(1);
    expect(w.organisms.carnivore[prey]).toBe(0);

    // Record the prey's start centroid so we can prove it GENUINELY FLED (moved away), not sat still.
    const f = w.cells.fields;
    const preyStart = preyCentroid(f, prey);

    let caught = false;
    let maxPreyDisplacement = 0;
    for (let t = 0; t < 3000; t++) {
      w.tick();
      if (w.organisms.cellCount[prey]! > 0) {
        const c = preyCentroid(f, prey);
        const d = torusDist(c.x, c.y, preyStart.x, preyStart.y, 600, 600);
        if (d > maxPreyDisplacement) maxPreyDisplacement = d;
      }
      if (w.organisms.cellCount[prey] === 0) {
        caught = true;
        break;
      }
    }
    expect(caught).toBe(true); // the prey was hunted down (cellCount → 0 = atomic death)
    expect(w.organisms.cellCount[predator]!).toBeGreaterThan(0); // the hunter survived the chase
    // The prey genuinely evaded under its inverted predator-eye/hearing steering before being run
    // down — a non-trivial displacement, not a sit-still rig.
    expect(maxPreyDisplacement).toBeGreaterThan(20);
  });
});

// Centroid of a still-living organism's cells (for displacement / flee evidence only — never used
// to drive predation, which runs off organisms.carnivore). Only called while cellCount[org] > 0, so
// the organism's cells are valid; we filter purely on organismId (structural, not a role label).
function preyCentroid(
  f: { posX: Float64Array; posY: Float64Array; organismId: Uint32Array },
  org: number,
): { x: number; y: number } {
  let sx = 0;
  let sy = 0;
  let n = 0;
  for (let i = 0; i < f.organismId.length; i++) {
    if (f.organismId[i] === org) {
      sx += f.posX[i]!;
      sy += f.posY[i]!;
      n++;
    }
  }
  return n > 0 ? { x: sx / n, y: sy / n } : { x: 0, y: 0 };
}
