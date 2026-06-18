import { describe, it, expect } from 'vitest';
import {
  buildCritterGenome,
  buildForagerGenome,
  buildHandicappedForagerGenome,
  buildNightForagerGenome,
  buildGlowForagerGenome,
  buildToxinAvoiderGenome,
  buildPredatorGenome,
} from './critter-genome';
import { develop } from './develop';
import { CellType } from '../cells/types';
import { SensorChannel } from '../neural/network';
import { World } from '../sim/world';
import { defaultConfig } from '../sim/config';

const key = (a: number, b: number): string => (a < b ? `${a}-${b}` : `${b}-${a}`);

describe('buildCritterGenome — develops into the M5 critter wiring (§8 M6 acceptance)', () => {
  const body = develop(buildCritterGenome(6), 256, 16);

  it('produces 7 cells in the spawnSwimmer order with matching types', () => {
    expect(body.count).toBe(7);
    expect(body.cellType).toEqual([
      CellType.MOVER,
      CellType.SENSOR,
      CellType.SENSOR,
      CellType.NEURON,
      CellType.NEURON,
      CellType.NEURON,
      CellType.NEURON,
    ]);
  });

  it('places the cells at the spawnSwimmer offsets (off=18, lat=10.8, aft=32.4)', () => {
    expect(body.localX[0]).toBeCloseTo(0, 6); // mover
    expect(body.localY[0]).toBeCloseTo(0, 6);
    expect(body.localX[1]).toBeCloseTo(18, 5); // sensorFwd (off, -lat)
    expect(body.localY[1]).toBeCloseTo(-10.8, 5);
    expect(body.localX[2]).toBeCloseTo(18, 5); // sensorLat (off, lat)
    expect(body.localY[2]).toBeCloseTo(10.8, 5);
    expect(body.localX[3]).toBeCloseTo(-18, 5); // clockA (-off, -lat)
    expect(body.localX[5]).toBeCloseTo(-32.4, 5); // turn (-aft, 0)
    expect(body.localX[6]).toBeCloseTo(32.4, 5); // thrust (aft, 0)
  });

  it('wires 15 bonds: 6 MOVER spokes + 6 bracing + 3 cross-body', () => {
    expect(body.bonds.length).toBe(15);
    const pairs = new Set(body.bonds.map((b) => key(b.a, b.b)));
    // spokes
    for (let c = 1; c <= 6; c++) expect(pairs.has(key(0, c))).toBe(true);
    // bracing
    const bracing: [number, number][] = [
      [1, 2],
      [1, 6],
      [2, 6],
      [3, 4],
      [3, 5],
      [4, 5],
    ];
    for (const [a, b] of bracing) expect(pairs.has(key(a, b))).toBe(true);
    // cross-body
    const crossBody: [number, number][] = [
      [1, 3],
      [2, 4],
      [6, 5],
    ];
    for (const [a, b] of crossBody) expect(pairs.has(key(a, b))).toBe(true);
    expect(pairs.size).toBe(15);
  });

  it('wires the 5 asymmetric brain synapses with correct weights/signs', () => {
    const syn = new Map(body.synapses.map((s) => [`${s.pre}-${s.post}`, s.weight]));
    expect(syn.get('2-5')).toBeCloseTo(1.5, 6); // sensorLat → turn
    expect(syn.get('1-6')).toBeCloseTo(1.5, 6); // sensorFwd → thrust
    expect(syn.get('4-3')).toBeCloseTo(0.9, 6); // clockB → clockA
    expect(syn.get('3-4')).toBeCloseTo(-0.9, 6); // clockA → clockB (sign load-bearing)
    expect(syn.get('3-5')).toBeCloseTo(0.3, 6); // clockA → turn
    expect(body.synapses.length).toBe(5);
  });

  it('binds the sensor channels, motor, and biases', () => {
    expect(body.sensorChannel[1]).toBe(SensorChannel.FWD_GRAD);
    expect(body.sensorChannel[2]).toBe(SensorChannel.LAT_GRAD);
    expect(body.motors).toEqual([{ mover: 0, turn: 5, thrust: 6 }]);
    expect(body.bias[3]).toBeCloseTo(0.2, 6); // clockA
    expect(body.bias[6]).toBeCloseTo(0.5, 6); // thrust
    expect(body.mass.every((m) => m === 2)).toBe(true); // cohesion: heavier than free cells
    expect(body.totalEnergy).toBeCloseTo(7 * 5000, 1);
  });
});

describe('buildForagerGenome — a viable brain-driven forager (sense→move→eat)', () => {
  const body = develop(buildForagerGenome(6, 100), 256, 16);

  it('develops a 6-cell body: MOVER + 2 SENSOR + 2 NEURON + a DIGESTIVE mouth', () => {
    expect(body.count).toBe(6);
    expect(body.cellType).toEqual([
      CellType.MOVER,
      CellType.SENSOR,
      CellType.SENSOR,
      CellType.NEURON,
      CellType.NEURON,
      CellType.DIGESTIVE,
    ]);
  });

  it('wires the steering loop + motor and leads with the digestive mouth', () => {
    const syn = new Map(body.synapses.map((s) => [`${s.pre}-${s.post}`, s.weight]));
    expect(syn.get('2-3')).toBeCloseTo(1.5, 6); // sensorLat → turn
    expect(syn.get('1-4')).toBeCloseTo(1.5, 6); // sensorFwd → thrust
    expect(body.motors).toEqual([{ mover: 0, turn: 3, thrust: 4 }]);
    expect(body.sensorChannel[1]).toBe(SensorChannel.FWD_GRAD);
    expect(body.sensorChannel[2]).toBe(SensorChannel.LAT_GRAD);
    expect(body.localX[5]).toBeGreaterThan(body.localX[1]!); // the mouth leads (furthest forward)
  });

  it('is mortal: modest seed energy (no 5000 reserve) so it must forage to live', () => {
    expect(body.totalEnergy).toBeCloseTo(6 * 100, 1);
    expect(body.mass.every((m) => m === 2)).toBe(true);
  });
});

describe('buildPredatorGenome — a forager body with a carnivore mouth', () => {
  const body = develop(buildPredatorGenome(6, 100), 256, 16);

  it('mirrors the forager body but the leading mouth is a PREDATOR cell', () => {
    expect(body.count).toBe(6);
    expect(body.cellType).toEqual([
      CellType.MOVER,
      CellType.SENSOR,
      CellType.SENSOR,
      CellType.NEURON,
      CellType.NEURON,
      CellType.PREDATOR, // the only change from the forager
    ]);
  });

  it('keeps the forager motors + sensor channels (only diet + the ambush thrust link differ)', () => {
    const forager = develop(buildForagerGenome(6, 100), 256, 16);
    expect(body.motors).toEqual(forager.motors);
    expect(body.sensorChannel).toEqual(forager.sensorChannel);
  });

  it('AMBUSH brain: inverts sensorFwd→thrust to negative, keeps sensorLat→turn positive', () => {
    const g = buildPredatorGenome(6, 100);
    const fwdThrust = g.connectionRules.find((c) => c.preGene === 1 && c.postGene === 4)!;
    const latTurn = g.connectionRules.find((c) => c.preGene === 2 && c.postGene === 3)!;
    expect(fwdThrust.weight).toBeLessThan(0); // brakes in prey-scent (loiter), not charges
    expect(latTurn.weight).toBeGreaterThan(0); // still orients toward prey
    // the override is honoured so the probe can sweep the brake strength
    expect(
      buildPredatorGenome(6, 100, -2.5).connectionRules.find(
        (c) => c.preGene === 1 && c.postGene === 4,
      )!.weight,
    ).toBeCloseTo(-2.5, 6);
  });
});

describe('buildHandicappedForagerGenome', () => {
  // The lat→turn rule is the trait under selection (preGene 2 → postGene 3).
  const latTurn = (g: ReturnType<typeof buildForagerGenome>) =>
    g.connectionRules.find((c) => c.preGene === 2 && c.postGene === 3)!;
  const fwdThrust = (g: ReturnType<typeof buildForagerGenome>) =>
    g.connectionRules.find((c) => c.preGene === 1 && c.postGene === 4)!;

  it('knocks ONLY sensorLat→turn, leaving sensorFwd→thrust at the fit 1.5', () => {
    const fit = buildForagerGenome(6, 100);
    const weak = buildHandicappedForagerGenome(6, 100, 0.2);
    // Same morphology + wiring topology.
    expect(weak.genes.length).toBe(fit.genes.length);
    expect(weak.divisionRules.length).toBe(fit.divisionRules.length);
    expect(weak.connectionRules.length).toBe(fit.connectionRules.length);
    expect(weak.motorRules).toEqual(fit.motorRules);
    // lat→turn handicapped to 0.2; fwd→thrust untouched at the fit 1.5.
    expect(latTurn(weak).weight).toBeCloseTo(0.2, 6);
    expect(fwdThrust(weak).weight).toBeCloseTo(1.5, 6);
    // The fit forager has both at 1.5.
    expect(latTurn(fit).weight).toBeCloseTo(1.5, 6);
    expect(fwdThrust(fit).weight).toBeCloseTo(1.5, 6);
  });

  it('defaults the lat→turn weight to 0.2', () => {
    const weak = buildHandicappedForagerGenome();
    expect(latTurn(weak).weight).toBeCloseTo(0.2, 6);
    expect(fwdThrust(weak).weight).toBeCloseTo(1.5, 6);
  });
});

// ─── Env-sensor forager variants ────────────────────────────────────────────

/** Helper: find a connection rule by (preGene, postGene) on a Genome. */
const conn = (g: ReturnType<typeof buildForagerGenome>, pre: number, post: number) =>
  g.connectionRules.find((c) => c.preGene === pre && c.postGene === post)!;

/** Helper: find a SENSOR gene by its sensorChannel in a Genome. */
const sensorGene = (g: ReturnType<typeof buildForagerGenome>, channel: number) =>
  g.genes.find((x) => x.cellType === CellType.SENSOR && x.sensorChannel === channel)!;

describe('buildNightForagerGenome — nocturnal energy conservation', () => {
  const g = buildNightForagerGenome(6, 100);
  const body = develop(g, 256, 16);

  it('has 7 genes (6 forager + 1 AMBIENT_LIGHT sensor)', () => {
    expect(g.genes.length).toBe(7);
  });

  it('preserves the core foraging loop', () => {
    expect(conn(g, 2, 3).weight).toBeCloseTo(1.5, 6); // sensorLat→turn
    expect(conn(g, 1, 4).weight).toBeCloseTo(1.5, 6); // sensorFwd→thrust
  });

  it('has an AMBIENT_LIGHT sensor wired to thrust with negative weight', () => {
    const amb = sensorGene(g, SensorChannel.AMBIENT_LIGHT);
    expect(amb).toBeDefined();
    expect(amb.sensorChannel).toBe(SensorChannel.AMBIENT_LIGHT);
    const rule = conn(g, 6, 4);
    expect(rule.weight).toBeCloseTo(-0.8, 6);
  });

  it('develops a 7-cell body with no truncation and positive energy', () => {
    expect(body.count).toBe(7);
    expect(body.truncated).toBe(false);
    expect(body.totalEnergy).toBeGreaterThan(0);
  });

  it('instantiates into a small World without error', () => {
    const w = new World(defaultConfig({ maxCells: 2000 }), false);
    const org = w.spawnOrganism(g, 500, 500, 0);
    expect(org).toBeGreaterThanOrEqual(0);
  });
});

describe('buildGlowForagerGenome — glow signaling / flocking', () => {
  const g = buildGlowForagerGenome(6, 100);
  const body = develop(g, 256, 16);

  it('has 7 genes (6 forager + 1 GLOW sensor); turn neuron has glowGain>0', () => {
    expect(g.genes.length).toBe(7);
    expect(g.genes[3]!.glowGain).toBeGreaterThan(0);
  });

  it('preserves the core foraging loop', () => {
    expect(conn(g, 2, 3).weight).toBeCloseTo(1.5, 6); // sensorLat→turn
    expect(conn(g, 1, 4).weight).toBeCloseTo(1.5, 6); // sensorFwd→thrust
  });

  it('has a GLOW sensor wired to thrust with positive weight', () => {
    const glow = sensorGene(g, SensorChannel.GLOW);
    expect(glow).toBeDefined();
    expect(glow.sensorChannel).toBe(SensorChannel.GLOW);
    const rule = conn(g, 6, 4);
    expect(rule.weight).toBeCloseTo(1.2, 6);
  });

  it('develops a 7-cell body with no truncation and positive energy', () => {
    expect(body.count).toBe(7);
    expect(body.truncated).toBe(false);
    expect(body.totalEnergy).toBeGreaterThan(0);
  });

  it('instantiates into a small World without error', () => {
    const w = new World(defaultConfig({ maxCells: 2000 }), false);
    const org = w.spawnOrganism(g, 500, 500, 0);
    expect(org).toBeGreaterThanOrEqual(0);
  });
});

describe('buildToxinAvoiderGenome — toxin avoidance wiggle', () => {
  const g = buildToxinAvoiderGenome(6, 100);
  const body = develop(g, 256, 16);

  it('has 7 genes (6 forager + 1 TOXIN sensor)', () => {
    expect(g.genes.length).toBe(7);
  });

  it('preserves the core foraging loop', () => {
    expect(conn(g, 2, 3).weight).toBeCloseTo(1.5, 6); // sensorLat→turn
    expect(conn(g, 1, 4).weight).toBeCloseTo(1.5, 6); // sensorFwd→thrust
  });

  it('has a TOXIN sensor wired to turn with positive weight', () => {
    const tox = sensorGene(g, SensorChannel.TOXIN);
    expect(tox).toBeDefined();
    expect(tox.sensorChannel).toBe(SensorChannel.TOXIN);
    const rule = conn(g, 6, 3);
    expect(rule.weight).toBeCloseTo(1.5, 6);
  });

  it('develops a 7-cell body with no truncation and positive energy', () => {
    expect(body.count).toBe(7);
    expect(body.truncated).toBe(false);
    expect(body.totalEnergy).toBeGreaterThan(0);
  });

  it('instantiates into a small World without error', () => {
    const w = new World(defaultConfig({ maxCells: 2000 }), false);
    const org = w.spawnOrganism(g, 500, 500, 0);
    expect(org).toBeGreaterThanOrEqual(0);
  });
});
