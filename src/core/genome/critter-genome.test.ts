import { describe, it, expect } from 'vitest';
import {
  buildCritterGenome,
  buildForagerGenome,
  buildHandicappedForagerGenome,
  buildNightForagerGenome,
  buildGlowForagerGenome,
  buildToxinAvoiderGenome,
  buildPredatorGenome,
  buildSightedForagerGenome,
  buildHearingPredatorGenome,
  buildFleeingPreyGenome,
} from './critter-genome';
import { develop } from './develop';
import { CellType } from '../cells/types';
import { SensorChannel } from '../neural/network';
import { SenseSource, SightTarget } from '../cells/sense-source';
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

describe('buildSightedForagerGenome — forager with a FOOD-eye pair + smell', () => {
  const g = buildSightedForagerGenome(6, 100);
  const body = develop(g, 256, 16);

  it('has 8 genes: 6-cell forager + a FWD/LAT eye pair', () => {
    expect(g.genes.length).toBe(8);
  });

  it('keeps the smell SENSOR pair as senseSource SMELL', () => {
    // genes 1,2 are the original forager smell sensors
    expect(g.genes[1]!.senseSource).toBe(SenseSource.SMELL);
    expect(g.genes[1]!.sensorChannel).toBe(SensorChannel.FWD_GRAD);
    expect(g.genes[2]!.senseSource).toBe(SenseSource.SMELL);
    expect(g.genes[2]!.sensorChannel).toBe(SensorChannel.LAT_GRAD);
  });

  it('adds an eye pair: senseSource SIGHT, sightTarget FOOD, on a FWD + a LAT channel', () => {
    const eyeFwd = g.genes[6]!;
    const eyeLat = g.genes[7]!;
    expect(eyeFwd.cellType).toBe(CellType.SENSOR);
    expect(eyeFwd.senseSource).toBe(SenseSource.SIGHT);
    expect(eyeFwd.sightTarget).toBe(SightTarget.FOOD);
    expect(eyeFwd.sensorChannel).toBe(SensorChannel.FWD_GRAD);
    expect(eyeLat.senseSource).toBe(SenseSource.SIGHT);
    expect(eyeLat.sightTarget).toBe(SightTarget.FOOD);
    expect(eyeLat.sensorChannel).toBe(SensorChannel.LAT_GRAD);
  });

  it('wires the eye pair into the steering loop (FWD-eye→thrust, LAT-eye→turn)', () => {
    const conn = (pre: number, post: number) =>
      g.connectionRules.find((c) => c.preGene === pre && c.postGene === post)!;
    expect(conn(6, 4).weight).toBeCloseTo(1.5, 6); // FWD-eye → thrust (advance toward seen food)
    expect(conn(7, 3).weight).toBeCloseTo(1.5, 6); // LAT-eye → turn (steer toward seen food)
    // the original smell loop is untouched
    expect(conn(1, 4).weight).toBeCloseTo(1.5, 6);
    expect(conn(2, 3).weight).toBeCloseTo(1.5, 6);
  });

  it('develops an 8-cell body with no truncation and positive energy', () => {
    expect(body.count).toBe(8);
    expect(body.truncated).toBe(false);
    expect(body.totalEnergy).toBeGreaterThan(0);
    expect(body.senseSource[6]).toBe(SenseSource.SIGHT);
    expect(body.sightTarget[6]).toBe(SightTarget.FOOD);
  });

  it('instantiates into a small World without error', () => {
    const w = new World(defaultConfig({ maxCells: 2000 }), false);
    const org = w.spawnOrganism(g, 500, 500, 0);
    expect(org).toBeGreaterThanOrEqual(0);
  });
});

describe('buildHearingPredatorGenome — sight+hearing pursuit predator', () => {
  const g = buildHearingPredatorGenome(6, 100);
  const body = develop(g, 256, 16);

  it('keeps the carnivore mouth (gene 5 = PREDATOR)', () => {
    expect(g.genes[5]!.cellType).toBe(CellType.PREDATOR);
  });

  it('has 10 genes: 6-cell predator + a PREY-eye pair + a HEARING pair', () => {
    expect(g.genes.length).toBe(10);
  });

  it('grows a PREY-eye pair: senseSource SIGHT, sightTarget PREY, FWD + LAT', () => {
    expect(g.genes[6]!.senseSource).toBe(SenseSource.SIGHT);
    expect(g.genes[6]!.sightTarget).toBe(SightTarget.PREY);
    expect(g.genes[6]!.sensorChannel).toBe(SensorChannel.FWD_GRAD);
    expect(g.genes[7]!.senseSource).toBe(SenseSource.SIGHT);
    expect(g.genes[7]!.sightTarget).toBe(SightTarget.PREY);
    expect(g.genes[7]!.sensorChannel).toBe(SensorChannel.LAT_GRAD);
  });

  it('grows a HEARING pair: senseSource HEARING, FWD + LAT', () => {
    expect(g.genes[8]!.senseSource).toBe(SenseSource.HEARING);
    expect(g.genes[8]!.sensorChannel).toBe(SensorChannel.FWD_GRAD);
    expect(g.genes[9]!.senseSource).toBe(SenseSource.HEARING);
    expect(g.genes[9]!.sensorChannel).toBe(SensorChannel.LAT_GRAD);
  });

  it('wires sight/hearing into PURSUIT (FWD→thrust positive, LAT→turn positive)', () => {
    const conn = (pre: number, post: number) =>
      g.connectionRules.find((c) => c.preGene === pre && c.postGene === post)!;
    expect(conn(6, 4).weight).toBeGreaterThan(0); // PREY-eye FWD → thrust (charge seen prey)
    expect(conn(7, 3).weight).toBeGreaterThan(0); // PREY-eye LAT → turn (orient on prey)
    expect(conn(8, 4).weight).toBeGreaterThan(0); // hearing FWD → thrust (home in on motion)
    expect(conn(9, 3).weight).toBeGreaterThan(0); // hearing LAT → turn
  });

  it('develops a 10-cell carnivore body with no truncation', () => {
    expect(body.count).toBe(10);
    expect(body.truncated).toBe(false);
    expect(body.cellType[5]).toBe(CellType.PREDATOR);
  });

  it('instantiates into a small World and flags the organism carnivore', () => {
    const w = new World(defaultConfig({ maxCells: 2000, preyDeposit: 1 }), false);
    const org = w.spawnOrganism(g, 500, 500, 0);
    expect(org).toBeGreaterThanOrEqual(0);
    expect(w.organisms.carnivore[org]).toBe(1);
  });
});

describe('buildFleeingPreyGenome — approaches food, flees seen/heard predators', () => {
  const g = buildFleeingPreyGenome(6, 100);
  const body = develop(g, 256, 16);

  it('is NOT carnivore: the mouth stays DIGESTIVE', () => {
    expect(g.genes[5]!.cellType).toBe(CellType.DIGESTIVE);
  });

  it('has 12 genes: sighted forager(8) + a PREDATOR-eye pair + a HEARING pair', () => {
    expect(g.genes.length).toBe(12);
  });

  it('keeps the FOOD-approach senses (smell pair + FOOD-eye pair)', () => {
    expect(g.genes[6]!.senseSource).toBe(SenseSource.SIGHT);
    expect(g.genes[6]!.sightTarget).toBe(SightTarget.FOOD);
  });

  it('grows a PREDATOR-eye pair (gene 8/9) wired to FLEE (FWD→thrust neg, LAT→turn neg)', () => {
    expect(g.genes[8]!.senseSource).toBe(SenseSource.SIGHT);
    expect(g.genes[8]!.sightTarget).toBe(SightTarget.PREDATOR);
    expect(g.genes[9]!.sightTarget).toBe(SightTarget.PREDATOR);
    const conn = (pre: number, post: number) =>
      g.connectionRules.find((c) => c.preGene === pre && c.postGene === post)!;
    expect(conn(8, 4).weight).toBeLessThan(0); // predator-eye FWD → thrust (brake/flip)
    expect(conn(9, 3).weight).toBeLessThan(0); // predator-eye LAT → turn (veer away)
  });

  it('grows a HEARING flee pair (gene 10/11) wired to FLEE', () => {
    expect(g.genes[10]!.senseSource).toBe(SenseSource.HEARING);
    expect(g.genes[11]!.senseSource).toBe(SenseSource.HEARING);
    const conn = (pre: number, post: number) =>
      g.connectionRules.find((c) => c.preGene === pre && c.postGene === post)!;
    expect(conn(11, 3).weight).toBeLessThan(0); // hearing LAT → turn (veer from motion)
  });

  it('develops a 12-cell body, no truncation, positive energy', () => {
    expect(body.count).toBe(12);
    expect(body.truncated).toBe(false);
    expect(body.totalEnergy).toBeGreaterThan(0);
  });

  it('keeps every cell within bondDegreeCap (8) — no cell breaches the cap', () => {
    const degree = new Array<number>(body.count).fill(0);
    for (const b of body.bonds) {
      degree[b.a]!++;
      degree[b.b]!++;
    }
    expect(Math.max(...degree)).toBeLessThanOrEqual(8);
  });

  it('instantiates into a small World as a non-carnivore', () => {
    const w = new World(defaultConfig({ maxCells: 2000, preyDeposit: 1 }), false);
    const org = w.spawnOrganism(g, 500, 500, 0);
    expect(org).toBeGreaterThanOrEqual(0);
    expect(w.organisms.carnivore[org]).toBe(0);
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
