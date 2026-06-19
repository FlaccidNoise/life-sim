import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig, decisiveMovementPreset, type Config } from './config';
import { buildHearingPredatorGenome, buildFleeingPreyGenome } from '../genome/critter-genome';

// GOLDEN (runnable only at Phase 4): the predator/prey arms race, proven on TWO axes:
//   1. STRUCTURAL CATCH — a sighted/hearing pursuit predator runs a fleeing prey down: the prey
//      organism's cellCount drops to 0 (atomic death → MEAT). Detected STRUCTURALLY (cellCount),
//      never by reading a role label. Predation runs off organisms.carnivore, which the PREDATOR
//      mouth sets structurally at instantiate. The predator survives the chase.
//   2. THE PREY GENUINELY FLEES — proven by ABLATION, not by a whole-run distance guard. We run the
//      SAME scenario TWICE: flee ON (predFleeWeight 1 + predScentDeposit 5) vs flee OFF
//      (predFleeWeight 0 + predScentDeposit 0). With flee ON the prey's net retreat AWAY from the
//      predator over the early window (tick 150) is far larger than with flee OFF — so the flee
//      mechanism CAUSES measurably more evasion. (The old guard asserted whole-run max displacement
//      > 20, which a stationary-brain prey ALSO passes from its own cruise dynamics — vacuous.)
//
// GEOMETRY (why "net-away" is the right metric): the predator starts directly BELOW the prey
// (prey at y=300, predator at y=240), both facing +y. So "away from the predator" is the +y
// direction, and the prey's net +y displacement from its own start is a clean signed measure of
// retreat. The flee wiring (inverted predator-eye/hearing steering) drives the prey UP the +y axis;
// turning it OFF collapses that retreat to the residual cruise.
//
// MEASURED (deterministic, byte-identical across reps): at tick 150 the prey's net +y displacement
// is ≈30.0 with flee ON vs ≈10.2 with flee OFF (the flee roughly TRIPLES the early retreat). The
// latch + tether + carnivore speed-edge still close the gap: catch fires at tick 192 (flee ON) /
// 215 (flee OFF), both well inside the 3000-tick window; the predator survives both. No genome
// weights were touched; every lever is a config knob within its documented ceiling
// (predReach/predLatchRange 1.4 ≤ 1.5·cellSize).

function ecologyConfig(flee: boolean): Config {
  return defaultConfig({
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
    // predation ON (proven ecology levers)
    preyDeposit: 2,
    predDigestRate: 40,
    predReach: 1.4,
    predLatchRange: 1.4,
    predLatchStiffness: 0.5,
    carnivoreThrustMult: 1.3,
    // flee: the ABLATED variable — ON deposits predator scent + lets the prey steer down its gradient.
    predScentDeposit: flee ? 5 : 0,
    predFleeWeight: flee ? 1 : 0,
  });
}

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

// Run the chase. Returns: whether the prey was caught (cellCount→0), the catch tick, whether the
// predator survived, and the prey's NET +y displacement (retreat AWAY from the predator below it)
// sampled at `awayTick` — the early-window flee evidence (always < the catch tick, so the prey is
// alive when sampled).
function chase(
  flee: boolean,
  awayTick: number,
): { caught: boolean; predatorSurvived: boolean; netAwayAtWindow: number } {
  const w = new World(ecologyConfig(flee), false);
  // prey first (lower organism id), predator a short distance BELOW it (lower y), facing the prey.
  const prey = w.spawnOrganism(buildFleeingPreyGenome(6, 400), 300, 300, Math.PI / 2);
  const predator = w.spawnOrganism(buildHearingPredatorGenome(6, 400), 300, 240, Math.PI / 2);
  expect(prey).toBeGreaterThanOrEqual(0);
  expect(predator).toBeGreaterThanOrEqual(0);
  expect(w.organisms.carnivore[predator]).toBe(1);
  expect(w.organisms.carnivore[prey]).toBe(0);

  const f = w.cells.fields;
  const preyStartY = preyCentroid(f, prey).y; // predator is below → +y is "away"

  let caught = false;
  let netAwayAtWindow = NaN;
  for (let t = 0; t < 3000; t++) {
    w.tick();
    if (t === awayTick && w.organisms.cellCount[prey]! > 0) {
      netAwayAtWindow = preyCentroid(f, prey).y - preyStartY;
    }
    if (w.organisms.cellCount[prey] === 0) {
      caught = true;
      break;
    }
  }
  return { caught, predatorSurvived: w.organisms.cellCount[predator]! > 0, netAwayAtWindow };
}

describe('GOLDEN — sighted/hearing predator catches a prey that genuinely flees', () => {
  it('the flee mechanism CAUSES more early evasion, yet the predator still runs the prey down', () => {
    // Sample retreat at tick 150 — before either catch (flee ON @192, flee OFF @215), so the prey is
    // alive in both runs.
    const AWAY_TICK = 150;
    const fleeOn = chase(true, AWAY_TICK);
    const fleeOff = chase(false, AWAY_TICK);

    // STRUCTURAL CATCH (the genuine assertion — unchanged): the prey is hunted down (cellCount → 0 =
    // atomic death) and the hunter survives the chase. Holds with flee ON (the real scenario).
    expect(fleeOn.caught).toBe(true);
    expect(fleeOn.predatorSurvived).toBe(true);

    // FLEE IS REAL (ablation): with the flee wiring active the prey retreats ~30u up the +y axis
    // (away from the predator below) by tick 150; with flee OFF that collapses to ~10u (residual
    // cruise). Assert flee ON beats flee OFF by a solid margin (≥10u against the measured ~20u gap) —
    // a metric a sit-still / cruise-only prey provably does NOT pass, unlike the old max-displacement
    // guard. This is the proof the prey GENUINELY flees rather than drifting.
    expect(fleeOn.netAwayAtWindow).toBeGreaterThan(fleeOff.netAwayAtWindow + 10);
  });
});
