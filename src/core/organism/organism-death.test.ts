import { describe, it, expect } from 'vitest';
import { killStarvedOrganisms } from './organism-death';
import { instantiateBody } from './instantiate';
import { OrganismTable } from './organisms';
import { BondNetwork } from './bonds';
import { CellStore } from '../memory/cell-store';
import { NeuralNetwork } from '../neural/network';
import { GenomeStore } from '../genome/genome';
import { develop } from '../genome/develop';
import { buildAutotrophGenome, buildCritterGenome } from '../genome/critter-genome';
import { CellType } from '../cells/types';
import { GlowEffectors } from '../neural/glow';

function rig() {
  const cells = new CellStore(64, false);
  const net = new NeuralNetwork(64, 64, 64);
  const bonds = new BondNetwork(64, 128, 8);
  const organisms = new OrganismTable(16);
  const store = new GenomeStore();
  const scratch = new Int32Array(64);
  const dying = new Uint8Array(16);
  return { cells, net, bonds, organisms, store, scratch, dying };
}

function collectLive(cells: CellStore): { live: Uint32Array; n: number } {
  const live = new Uint32Array(cells.capacity);
  let n = 0;
  for (let i = 0; i < cells.capacity; i++) if (cells.isAlive(i)) live[n++] = i;
  return { live, n };
}

describe('killStarvedOrganisms', () => {
  it('converts a starved organism to MEAT, reaps its bonds, and frees the id + genome', () => {
    const r = rig();
    const ref = r.store.register(buildAutotrophGenome(6));
    const body = develop(buildAutotrophGenome(6), 256, 16);
    const org = instantiateBody(
      body,
      r.cells,
      r.net,
      r.bonds,
      r.organisms,
      ref,
      1000,
      1000,
      0,
      2048,
      2048,
      r.scratch,
    new GlowEffectors(4096),
    );
    const f = r.cells.fields;
    // starve it: set every cell's energy to 0 and set the aggregate ≤ floor.
    for (let i = 0; i < r.cells.capacity; i++) if (f.organismId[i] === org) f.energy[i] = 0;
    r.organisms.energy[org] = 0;
    r.organisms.cellCount[org] = body.count;
    r.bonds.rebuildLive(r.cells);
    const liveBondsBefore = r.bonds.liveBondCount;
    expect(liveBondsBefore).toBeGreaterThan(0);

    const { live, n } = collectLive(r.cells);
    const out = { deaths: 0 };
    const died = killStarvedOrganisms(
      r.cells,
      r.net,
      r.bonds,
      r.organisms,
      r.store,
      new GlowEffectors(4096),
      live,
      n,
      0,
      30,
      r.dying,
      out,
    );

    expect(died).toBe(true);
    expect(out.deaths).toBe(1);
    expect(r.organisms.isAlive(org)).toBe(false); // id freed
    expect(r.store.get(ref)).toBeUndefined(); // genome freed
    // cells became free MEAT carrying biomass energy.
    for (let i = 0; i < r.cells.capacity; i++) {
      if (r.cells.isAlive(i) && f.cellType[i] === CellType.MEAT) {
        expect(f.organismId[i]).toBe(0);
        expect(f.energy[i]).toBeCloseTo(2 * 30, 3); // mass 2 × meatEnergyOnDeath 30
      }
    }
    r.bonds.rebuildLive(r.cells);
    expect(r.bonds.liveBondCount).toBe(0); // all bonds reaped
  });

  it('returns false (no rebuild) when no organism is at/below the floor', () => {
    const r = rig();
    const ref = r.store.register(buildAutotrophGenome(6));
    const body = develop(buildAutotrophGenome(6), 256, 16);
    const org = instantiateBody(
      body,
      r.cells,
      r.net,
      r.bonds,
      r.organisms,
      ref,
      1000,
      1000,
      0,
      2048,
      2048,
      r.scratch,
    new GlowEffectors(4096),
    );
    r.organisms.energy[org] = 500;
    r.organisms.cellCount[org] = body.count;
    const { live, n } = collectLive(r.cells);
    const out = { deaths: 0 };
    expect(
      killStarvedOrganisms(
        r.cells,
        r.net,
        r.bonds,
        r.organisms,
        r.store,
        new GlowEffectors(4096),
        live,
        n,
        0,
        30,
        r.dying,
        out,
      ),
    ).toBe(false);
    expect(r.organisms.isAlive(org)).toBe(true);
  });

  it('does NOT kill a genome-less organism (M5 cluster immortality preserved)', () => {
    const r = rig();
    const f = r.cells.fields;
    const org = r.organisms.alloc(); // genomeRef stays -1 (no instantiateBody)
    const i0 = r.cells.alloc();
    f.organismId[i0] = org;
    f.energy[i0] = -50; // starved well below the floor
    r.organisms.energy[org] = -50;
    r.organisms.cellCount[org] = 1;
    const { live, n } = collectLive(r.cells);
    const out = { deaths: 0 };
    expect(
      killStarvedOrganisms(
        r.cells,
        r.net,
        r.bonds,
        r.organisms,
        r.store,
        new GlowEffectors(4096),
        live,
        n,
        0,
        30,
        r.dying,
        out,
      ),
    ).toBe(false);
    expect(r.organisms.isAlive(org)).toBe(true); // genomeRef -1 → immune to atomic death
  });

  it("reclaims a dead brained organism's motor/sensor bindings + zeroes its thrust (no ghost-thrust corpse)", () => {
    const r = rig();
    const ref = r.store.register(buildCritterGenome(6));
    const body = develop(buildCritterGenome(6), 256, 16);
    const org = instantiateBody(
      body,
      r.cells,
      r.net,
      r.bonds,
      r.organisms,
      ref,
      1000,
      1000,
      0,
      2048,
      2048,
      r.scratch,
    new GlowEffectors(4096),
    );
    expect(r.net.motorCount).toBe(1);
    expect(r.net.sensorCount).toBe(2);
    const f = r.cells.fields;
    const mover = r.organisms.mover[org]!;
    f.thrust[mover] = 3; // pretend driveMovers wrote thrust this tick
    for (let i = 0; i < r.cells.capacity; i++) if (f.organismId[i] === org) f.energy[i] = 0;
    r.organisms.energy[org] = 0;
    r.organisms.cellCount[org] = body.count;
    const { live, n } = collectLive(r.cells);
    const out = { deaths: 0 };
    killStarvedOrganisms(
      r.cells,
      r.net,
      r.bonds,
      r.organisms,
      r.store,
      new GlowEffectors(4096),
      live,
      n,
      0,
      30,
      r.dying,
      out,
    );
    expect(r.net.motorCount).toBe(0); // motor binding reclaimed → driveMovers won't ghost-thrust
    expect(r.net.sensorCount).toBe(0);
    expect(f.thrust[mover]).toBe(0); // stale drive cleared
  });
});
