import { describe, it, expect } from 'vitest';
import { instantiateBody } from './instantiate';
import { develop } from '../genome/develop';
import { type Genome } from '../genome/genome';
import { CellStore } from '../memory/cell-store';
import { NeuralNetwork } from '../neural/network';
import { BondNetwork } from './bonds';
import { OrganismTable } from './organisms';
import { CellType } from '../cells/types';
import { SensorChannel } from '../neural/network';

function rig(maxCells = 64) {
  return {
    cells: new CellStore(maxCells, false),
    net: new NeuralNetwork(maxCells, 64, maxCells),
    bonds: new BondNetwork(maxCells, 64, 8),
    organisms: new OrganismTable(16),
    scratch: new Int32Array(64),
  };
}

// A 3-cell body: MOVER seed + two SENSOR children, a brace bond, one synapse, one motor.
function miniGenome(): Genome {
  const g = (cellType: number, over = {}) => ({
    innovation: 0,
    cellType,
    radius: 6,
    mass: 2,
    initialEnergy: 100,
    bias: 0,
    sensorChannel: -1,
    ...over,
  });
  return {
    seedGene: 0,
    genes: [
      g(CellType.MOVER),
      g(CellType.SENSOR, { sensorChannel: SensorChannel.FWD_GRAD }),
      g(CellType.NEURON, { bias: 0.5 }),
    ],
    divisionRules: [
      { parentGene: 0, childGene: 1, angle: 0, dist: 24, stiffness: 1, repeat: 1 },
      { parentGene: 0, childGene: 2, angle: Math.PI, dist: 24, stiffness: 1, repeat: 1 },
    ],
    bondRules: [{ geneA: 1, geneB: 2, stiffness: 0.5 }],
    connectionRules: [{ preGene: 1, postGene: 2, weight: 1.5 }],
    motorRules: [{ moverGene: 0, turnGene: 2, thrustGene: 2 }],
    parentRef: -1,
    generation: 0,
  };
}

describe('instantiateBody', () => {
  it('writes cells/bonds/synapses/sensor/motor into the live structures and returns the org id', () => {
    const { cells, net, bonds, organisms, scratch } = rig();
    const body = develop(miniGenome(), 256, 16);
    const org = instantiateBody(
      body,
      cells,
      net,
      bonds,
      organisms,
      7,
      1000,
      1000,
      0,
      2048,
      2048,
      scratch,
    );
    expect(org).toBeGreaterThanOrEqual(1);
    expect(cells.aliveCount).toBe(3);
    const f = cells.fields;
    // seed (local 0) is the MOVER, placed at the spawn point; org id + genomeRef stamped.
    const seedSlot = scratchSeed(org, organisms);
    expect(f.cellType[seedSlot]).toBe(CellType.MOVER);
    expect(f.organismId[seedSlot]).toBe(org);
    expect(f.genomeRef[seedSlot]).toBe(7);
    expect(f.energy[seedSlot]).toBeCloseTo(100, 3);
    expect(f.mass[seedSlot]).toBeCloseTo(2, 6);
    expect(organisms.genomeRef[org]).toBe(7);
    expect(organisms.mover[org]).toBe(seedSlot);
    bonds.rebuildLive(cells);
    expect(bonds.liveBondCount).toBe(3); // 2 tree + 1 brace
    net.rebuildLive(cells);
    expect(net.liveSynapseCount).toBe(1);
    expect(net.sensorCount).toBe(1);
    expect(net.motorCount).toBe(1);
    expect(net.bias[seedSlot + 2]).toBeCloseTo(0.5, 6); // gene2's bias on its instance (NEURON)
  });

  function scratchSeed(org: number, organisms: OrganismTable): number {
    return organisms.mover[org]!; // the seed MOVER is the motor's mover
  }

  it('cleanly aborts (returns -1, allocates nothing) when cells are short', () => {
    const { net, bonds, organisms, scratch } = rig();
    const cells = new CellStore(2, false); // only 2 slots, body needs 3
    const body = develop(miniGenome(), 256, 16);
    const org = instantiateBody(
      body,
      cells,
      net,
      bonds,
      organisms,
      0,
      0,
      0,
      0,
      2048,
      2048,
      scratch,
    );
    expect(org).toBe(-1);
    expect(cells.aliveCount).toBe(0); // nothing allocated
    expect(organisms.isAlive(1)).toBe(false); // org id not consumed
  });

  it('cleanly aborts when a cell would exceed the bond degree cap', () => {
    const { cells, net, organisms, scratch } = rig();
    const bonds = new BondNetwork(64, 64, 2); // degree cap 2
    // A star: seed + 3 children all bonded to the seed → seed degree 3 > cap 2.
    const g = (cellType: number) => ({
      innovation: 0,
      cellType,
      radius: 6,
      mass: 2,
      initialEnergy: 100,
      bias: 0,
      sensorChannel: -1,
    });
    const star: Genome = {
      seedGene: 0,
      genes: [g(CellType.MOVER), g(CellType.PHOTO)],
      divisionRules: [{ parentGene: 0, childGene: 1, angle: 0, dist: 20, stiffness: 1, repeat: 3 }],
      bondRules: [],
      connectionRules: [],
      motorRules: [],
      parentRef: -1,
      generation: 0,
    };
    const body = develop(star, 256, 16);
    const org = instantiateBody(
      body,
      cells,
      net,
      bonds,
      organisms,
      0,
      0,
      0,
      0,
      2048,
      2048,
      scratch,
    );
    expect(org).toBe(-1);
    expect(cells.aliveCount).toBe(0);
  });
});
