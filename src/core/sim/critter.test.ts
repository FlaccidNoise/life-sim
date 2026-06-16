import { describe, it, expect } from 'vitest';
import { World } from './world';
import { defaultConfig } from './config';
import { CellType } from '../cells/types';
import { spawnSwimmer } from './critter';

describe('spawnSwimmer — hand-wired bonded critter (M5)', () => {
  it('builds 1 MOVER + 2 SENSOR + 4 NEURON cells in one organism, wired + bonded + provisioned', () => {
    const w = new World(defaultConfig({ maxCells: 64 }), false);
    const c = spawnSwimmer(w, 500, 500, 0);
    const f = w.cells.fields;

    expect(f.cellType[c.mover]).toBe(CellType.MOVER);
    expect(f.cellType[c.sensorFwd]).toBe(CellType.SENSOR);
    expect(f.cellType[c.sensorLat]).toBe(CellType.SENSOR);
    // all 7 cells share the organism id, and it owns the MOVER for orientation
    expect(f.organismId[c.mover]).toBe(1); // first organism in a fresh World
    expect(f.organismId[c.sensorFwd]).toBe(f.organismId[c.mover]);
    expect(w.organisms.mover[c.organismId]).toBe(c.mover);
    // provisioned reserve
    expect(f.energy[c.mover]).toBeGreaterThan(500);

    // network: 2 sensors, 1 motor binding, ≥4 synapses
    expect(w.net.sensorCount).toBe(2);
    expect(w.net.motorCount).toBe(1);
    expect(w.net.liveSynapseCount).toBeGreaterThanOrEqual(4);
    // bonds: 6 spokes + 6 bracing = 12 live bonds; the MOVER has 6 (spokes only)
    expect(w.bonds.liveBondCount).toBe(12);
    expect(w.bonds.degree[c.mover]).toBe(6);
  });

  it('is deterministic — two builds give identical topology + bond rest lengths', () => {
    const a = new World(defaultConfig({ maxCells: 64 }), false);
    const b = new World(defaultConfig({ maxCells: 64 }), false);
    const ca = spawnSwimmer(a, 500, 500, 0);
    const cb = spawnSwimmer(b, 500, 500, 0);
    expect(ca).toEqual(cb);
    expect(Array.from(a.bonds.restLen.slice(0, 12))).toEqual(
      Array.from(b.bonds.restLen.slice(0, 12)),
    );
    expect(Array.from(a.net.weight.slice(0, a.net.maxSynapses))).toEqual(
      Array.from(b.net.weight.slice(0, b.net.maxSynapses)),
    );
  });

  it('lays cells out beyond the contact range so the body never self-repels', () => {
    const w = new World(defaultConfig({ maxCells: 64 }), false);
    const c = spawnSwimmer(w, 500, 500, 0);
    const f = w.cells.fields;
    const slots = [c.mover, c.sensorFwd, c.sensorLat, c.clockA, c.clockB, c.turn, c.thrust];
    const contact = 2 * w.config.cellRadius;
    for (let i = 0; i < slots.length; i++) {
      for (let j = i + 1; j < slots.length; j++) {
        const d = Math.hypot(
          f.posX[slots[i]!]! - f.posX[slots[j]!]!,
          f.posY[slots[i]!]! - f.posY[slots[j]!]!,
        );
        expect(d).toBeGreaterThan(contact);
      }
    }
  });
});
