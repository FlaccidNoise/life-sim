import { describe, it, expect } from 'vitest';
import {
  buildCritterGenome,
  buildForagerGenome,
  buildHandicappedForagerGenome,
} from './critter-genome';
import { develop } from './develop';
import { CellType } from '../cells/types';
import { SensorChannel } from '../neural/network';

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

  it('places the cells at the spawnSwimmer offsets (off=24, lat=14.4, aft=43.2)', () => {
    expect(body.localX[0]).toBeCloseTo(0, 6); // mover
    expect(body.localY[0]).toBeCloseTo(0, 6);
    expect(body.localX[1]).toBeCloseTo(24, 5); // sensorFwd (off, -lat)
    expect(body.localY[1]).toBeCloseTo(-14.4, 5);
    expect(body.localX[2]).toBeCloseTo(24, 5); // sensorLat (off, lat)
    expect(body.localY[2]).toBeCloseTo(14.4, 5);
    expect(body.localX[3]).toBeCloseTo(-24, 5); // clockA (-off, -lat)
    expect(body.localX[5]).toBeCloseTo(-43.2, 5); // turn (-aft, 0)
    expect(body.localX[6]).toBeCloseTo(43.2, 5); // thrust (aft, 0)
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
