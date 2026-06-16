import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';
import { SensorChannel } from '../neural/network';
import { spawnSwimmer } from './critter';

/** Config that freezes everything irrelevant so the neural chain is exact. */
function frozenCfg(over = {}) {
  return defaultConfig({
    maxCells: 64,
    worldWidth: 800,
    worldHeight: 800,
    foodGridCols: 8,
    foodGridRows: 8, // 100-unit patches
    repulsion: 0,
    photoGain: 0,
    basalCost: 0,
    neuralCost: 0,
    moveCost: 0,
    divideThreshold: 1e9,
    damping: 0.5,
    dt: 1,
    cellRadius: 2,
    initialMotileFraction: 0,
    foodDeposit: 0,
    foodDiffuse: 0,
    foodDecay: 0,
    ...over,
  });
}

describe('golden tick — SENSE → THINK → ACT through World.tick', () => {
  it('CLOSED-FORM: a minimal SENSOR→NEURON brain produces exact tanh activations (§6 tier-2)', () => {
    // Frozen +x food ramp; one SENSOR (fwd channel, heading 0) → one NEURON via a
    // weight-2 synapse, bias 0.1. Hand-computed exact activations pin the equation
    // a_j(t)=tanh(bias+Σw·a(t−1)) THROUGH the full tick (not just the isolated kernel).
    const w = new World(frozenCfg(), false);
    const f = w.cells.fields;
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) w.food.field[r * 8 + c] = c;

    const s = w.cells.alloc();
    f.posX[s] = 350; // col 3 mid-patch → senseX = col4(4) − col2(2) = 2 exactly
    f.posY[s] = 350;
    f.cellType[s] = CellType.SENSOR;
    f.energy[s] = 1e6;
    f.heading[s] = 0; // body-frame fwd projection == senseX
    const nrn = w.cells.alloc();
    f.posX[nrn] = 364; // > 2·cellRadius from the sensor → no repulsion
    f.posY[nrn] = 350;
    f.cellType[nrn] = CellType.NEURON;
    f.energy[nrn] = 1e6;
    w.net.bias[nrn] = 0.1;
    w.net.addSensor(s, SensorChannel.FWD_GRAD);
    w.net.addSynapse(s, f.generation[s]!, nrn, f.generation[nrn]!, 2);
    w.net.rebuildLive(w.cells);

    // Tick 1: neuron reads a(t−1)=0 → tanh(0.1 + 2·0); sensor now holds 2 (a(t)).
    w.tick();
    expect(w.net.actCur[s]!).toBeCloseTo(2, 5);
    expect(w.net.actCur[nrn]!).toBeCloseTo(Math.tanh(0.1), 5);
    // Tick 2: neuron reads a(t−1)=sensor 2 → tanh(0.1 + 2·2) = tanh(4.1).
    w.tick();
    expect(w.net.actCur[nrn]!).toBeCloseTo(Math.tanh(4.1), 5);
  });

  it('drives a hand-wired critter MOVER from its brain (integration smoke)', () => {
    const w = new World(frozenCfg(), false);
    for (let r = 0; r < 8; r++) for (let c = 0; c < 8; c++) w.food.field[r * 8 + c] = c;
    const critter = spawnSwimmer(w, 350, 350, 0);
    const f = w.cells.fields;
    w.tick();
    w.tick();
    w.tick();
    expect(f.thrust[critter.mover]!).toBeGreaterThan(0); // motor binding drives the MOVER (cruise + sensor); exact values are pinned by the closed-form test above
    expect(Number.isFinite(f.heading[critter.mover]!)).toBe(true);
    expect(Math.abs(w.net.actCur[critter.turn]!)).toBeLessThanOrEqual(1.0000001);
    expect(Math.abs(w.net.actCur[critter.thrust]!)).toBeLessThanOrEqual(1.0000001);
  });

  it('bonded cells stay cohered as one organism (soft body) as it moves', () => {
    const w = new World(defaultConfig({ maxCells: 64, initialMotileFraction: 0 }), false);
    const critter = spawnSwimmer(w, 500, 500, 0);
    const f = w.cells.fields;
    const off = 4 * w.config.cellRadius;
    const restFwd = Math.hypot(off, off * 0.6); // MOVER↔sensorFwd spoke rest length
    for (let t = 0; t < 30; t++) w.tick();
    // The hand-wired critter is a SOFT braced body, not a rigid one. Under the no-food
    // spin a single spoke (e.g. MOVER↔sensorFwd) can over-stretch and snap, but the cross-
    // bracing keeps every cell in ONE organism — the body never flies apart. Assert the
    // real cohesion invariant: sensorFwd is still bonded into the mover's organism and is a
    // finite, bounded distance away (not the exact rest length, and not a fled fragment).
    expect(f.organismId[critter.sensorFwd]).toBe(f.organismId[critter.mover]);
    expect(f.organismId[critter.sensorFwd]).toBeGreaterThan(0);
    const d = Math.hypot(
      f.posX[critter.sensorFwd]! - f.posX[critter.mover]!,
      f.posY[critter.sensorFwd]! - f.posY[critter.mover]!,
    );
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(restFwd * 0.5);
    expect(d).toBeLessThan(restFwd * 4); // a generous "did not fly apart" sanity bound
  });

  it('recurrent clock oscillates under a flat food field (persistent activation, §4.6)', () => {
    // No gradient anywhere → sensors inject ~0; only the recurrent clock drives turn.
    const w = new World(
      defaultConfig({ maxCells: 64, initialMotileFraction: 0, foodDeposit: 0 }),
      false,
    );
    const critter = spawnSwimmer(w, 500, 500, 0);
    const seen = new Set<number>();
    let lastTurn = w.net.actCur[critter.turn]!;
    let turnVaries = false;
    for (let t = 0; t < 40; t++) {
      w.tick();
      seen.add(Math.round(w.net.actCur[critter.clockA]! * 1000));
      if (Math.abs(w.net.actCur[critter.turn]! - lastTurn) > 1e-4) turnVaries = true;
      lastTurn = w.net.actCur[critter.turn]!;
    }
    expect(seen.size).toBeGreaterThan(1); // clockA takes multiple distinct values → oscillating
    expect(turnVaries).toBe(true); // the recurrent clock is load-bearing on behaviour
  });
});
