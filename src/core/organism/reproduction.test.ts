import { describe, it, expect } from 'vitest';
import { reproduceOrganisms, type ReproParams } from './reproduction';
import { instantiateBody } from './instantiate';
import { aggregateOrganisms } from './organisms';
import { OrganismTable } from './organisms';
import { BondNetwork } from './bonds';
import { CellStore } from '../memory/cell-store';
import { NeuralNetwork } from '../neural/network';
import { GenomeStore } from '../genome/genome';
import { develop } from '../genome/develop';
import { buildAutotrophGenome } from '../genome/critter-genome';
import { type MutationRates } from '../genome/mutate';
import { Rng } from '../math/rng';

const NO_MUT: MutationRates = {
  paramSigma: 0.1,
  paramRate: 0,
  weightSigma: 0.1,
  weightRate: 0,
  addGeneRate: 0,
  deleteGeneRate: 0,
  duplicateGeneRate: 0,
  rewireRate: 0,
  changeTypeRate: 0,
  duplicateSubgraphRate: 0,
};

function rig() {
  const cells = new CellStore(64, false);
  const net = new NeuralNetwork(64, 64, 64);
  const bonds = new BondNetwork(64, 128, 8);
  const organisms = new OrganismTable(16);
  const store = new GenomeStore();
  const scratch = new Int32Array(64);
  return { cells, net, bonds, organisms, store, scratch };
}

function collectLive(cells: CellStore): { live: Uint32Array; n: number } {
  const live = new Uint32Array(cells.capacity);
  let n = 0;
  for (let i = 0; i < cells.capacity; i++) if (cells.isAlive(i)) live[n++] = i;
  return { live, n };
}

function seedParent(r: ReturnType<typeof rig>, perCellEnergy: number) {
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
  );
  const f = r.cells.fields;
  for (let i = 0; i < r.cells.capacity; i++)
    if (f.organismId[i] === org) f.energy[i] = perCellEnergy;
  const { live, n } = collectLive(r.cells);
  aggregateOrganisms(live, n, f.organismId, f.energy, f.posX, f.posY, r.organisms);
  return { ref, org, live, n };
}

const PARAMS = (over: Partial<ReproParams> = {}): ReproParams => ({
  reproThreshold: 600,
  parentFloor: 200,
  offspringOffset: 40,
  maxCellsPerOrganism: 256,
  maxRecursionDepth: 16,
  maxBirthsPerTick: 64,
  worldWidth: 2048,
  worldHeight: 2048,
  tick: 5,
  ...over,
});

describe('reproduceOrganisms', () => {
  it('a provisioned organism reproduces: a child genome + a second organism + deducted parent', () => {
    const r = rig();
    const { org, live, n } = seedParent(r, 300); // 4 cells × 300 = 1200 ≥ 600
    const out = { births: 0 };
    reproduceOrganisms(
      r.cells,
      r.net,
      r.bonds,
      r.organisms,
      r.store,
      live,
      n,
      new Rng(1),
      NO_MUT,
      PARAMS(),
      r.scratch,
      out,
    );
    expect(out.births).toBe(1);
    expect(r.store.size).toBe(2); // parent + child genome
    expect(r.cells.aliveCount).toBe(8); // 4 parent + 4 offspring
    // the child genome records lineage.
    const child = r.store.get(1)!;
    expect(child.parentRef).toBe(0);
    expect(child.generation).toBe(1);
    // the parent's cells were deducted body.totalEnergy (4 × 50 = 200) proportionally.
    const f = r.cells.fields;
    let parentSum = 0;
    for (let i = 0; i < r.cells.capacity; i++)
      if (f.organismId[i] === org) parentSum += f.energy[i]!;
    expect(parentSum).toBeCloseTo(1000, 1); // 1200 − 200 provisioned
  });

  it('cleanly aborts when the parent cannot afford the provision while keeping the floor', () => {
    const r = rig();
    const { live, n } = seedParent(r, 87.5); // 4 × 87.5 = 350
    const out = { births: 0 };
    // threshold 300 (triggers at 350) but 350 − 200 provision = 150 < floor 200 → abort.
    reproduceOrganisms(
      r.cells,
      r.net,
      r.bonds,
      r.organisms,
      r.store,
      live,
      n,
      new Rng(1),
      NO_MUT,
      PARAMS({ reproThreshold: 300 }),
      r.scratch,
      out,
    );
    expect(out.births).toBe(0);
    expect(r.cells.aliveCount).toBe(4); // nothing built
    expect(r.store.size).toBe(1); // no child genome registered
  });

  it('does not reproduce an organism below threshold or without a genome', () => {
    const r = rig();
    const { org, live, n } = seedParent(r, 100); // 400 < 600
    r.organisms.genomeRef[org] = -1; // also strip the genome
    const out = { births: 0 };
    reproduceOrganisms(
      r.cells,
      r.net,
      r.bonds,
      r.organisms,
      r.store,
      live,
      n,
      new Rng(1),
      NO_MUT,
      PARAMS(),
      r.scratch,
      out,
    );
    expect(out.births).toBe(0);
  });

  it('is deterministic — same seed → identical second world', () => {
    const a = rig();
    const ra = seedParent(a, 300);
    const oa = { births: 0 };
    reproduceOrganisms(
      a.cells,
      a.net,
      a.bonds,
      a.organisms,
      a.store,
      ra.live,
      ra.n,
      new Rng(7),
      NO_MUT,
      PARAMS(),
      a.scratch,
      oa,
    );
    const b = rig();
    const rb = seedParent(b, 300);
    const ob = { births: 0 };
    reproduceOrganisms(
      b.cells,
      b.net,
      b.bonds,
      b.organisms,
      b.store,
      rb.live,
      rb.n,
      new Rng(7),
      NO_MUT,
      PARAMS(),
      b.scratch,
      ob,
    );
    expect(Array.from(a.cells.fields.energy)).toEqual(Array.from(b.cells.fields.energy));
  });
});
